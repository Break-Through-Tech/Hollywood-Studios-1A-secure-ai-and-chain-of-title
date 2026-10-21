import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import all handlers
import conversations from './messages/_conversations.js';
import downloadAttachment from './messages/_download-attachment.js';
import friends from './messages/_friends.js';
import getOrCreate from './messages/_get-or-create.js';
import messagesList from './messages/_list.js';
import poll from './messages/_poll.js';
import send from './messages/_send.js';
import uploadAttachment from './messages/_upload-attachment.js';
import postsCreate from './posts/_create.js';
import postsDelete from './posts/_delete.js';
import postsLike from './posts/_like.js';
import linkPreview from './posts/_link-preview.js';
import postsList from './posts/_list.js';
import uploadToken from './_upload-token.js';
import { resolveRouteAction } from '../_route.js';
import { guardClaimedSession, guardAnySession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'messages/conversations': conversations,
  'messages/download-attachment': downloadAttachment,
  'messages/friends': friends,
  'messages/get-or-create': getOrCreate,
  'messages/list': messagesList,
  'messages/poll': poll,
  'messages/send': send,
  'messages/upload-attachment': uploadAttachment,
  'posts/create': postsCreate,
  'posts/delete': postsDelete,
  'posts/like': postsLike,
  'posts/link-preview': linkPreview,
  'posts/list': postsList,
  'upload-token': uploadToken,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'network');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // A request that names a member must carry that member's session; public
  // reads carry no claim and pass through.
  const sql = neon(process.env.DATABASE_URL!);
  // Upload tokens carry no email but hand out storage; any member may have one, nobody else.
  if (action === 'upload-token' && !(await guardAnySession(sql, req, res))) return;
  if (!(await guardClaimedSession(sql, req, res))) return;

  return route(req, res);
}
