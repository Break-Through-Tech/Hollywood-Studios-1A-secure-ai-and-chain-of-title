import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM, getLLMConfig } from './_llm.js';

const MIN_DRAFT_CHARS = 1000;
const MAX_DRAFT_CHARS = 60_000;
const MAX_HISTORY = 12;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, email, draft, context, messages } = req.body as {
    slug?: string; email?: string; draft?: string; context?: string; messages?: ChatMessage[];
  };

  if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages are required' });
  }

  const draftText = (draft || '').slice(0, MAX_DRAFT_CHARS);
  if (draftText.length < MIN_DRAFT_CHARS) {
    return res.status(400).json({ error: `The assistant unlocks once your draft reaches ${MIN_DRAFT_CHARS} characters` });
  }

  try {
    const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${email}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    const history = messages.slice(-MAX_HISTORY).filter(
      (m): m is ChatMessage => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    );
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    if (!lastUser) return res.status(400).json({ error: 'A user message is required' });

    const systemPrompt = [
      'You are the HSI Draft Assistant, a sharp, supportive story development partner for screenwriters and creators.',
      'You have the writer\'s current draft and project brief below. Ground every answer in their actual writing: quote or reference specific passages, characters, and beats.',
      'When asked for edits, propose concrete rewrites. When asked for suggestions, give 2-4 specific, actionable ideas. Be concise — no filler, no generic writing advice.',
      'Respond in plain text (no JSON, no markdown headers).',
      context?.trim() ? `\n=== PROJECT BRIEF ===\n${context.trim().slice(0, 4000)}` : '',
      `\n=== CURRENT DRAFT ===\n${draftText}`,
    ].join('\n');

    const transcript = history
      .map(m => `${m.role === 'user' ? 'WRITER' : 'ASSISTANT'}: ${m.content.slice(0, 4000)}`)
      .join('\n\n');
    const userPrompt = `Conversation so far:\n\n${transcript}\n\nReply to the writer's latest message.`;

    const result = await callLLM(getLLMConfig(), systemPrompt, userPrompt, {
      temperature: 0.7,
      maxTokens: 1200,
      timeout: 120_000,
      json: false,
    });

    return res.status(200).json({ reply: result.text });
  } catch (err) {
    console.error('Draft assistant error:', err);
    return res.status(500).json({ error: 'The assistant is unavailable right now. Try again in a moment.' });
  }
}
