import type { VercelRequest, VercelResponse } from '@vercel/node';
import checkout from './_checkout.js';
import portal from './_portal.js';
import status from './_status.js';
import webhook from './_webhook.js';
import { resolveRouteAction } from '../_route.js';

export const config = { api: { bodyParser: false } };

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'checkout': checkout,
  'portal': portal,
  'status': status,
  'webhook': webhook,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'stripe');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // For non-webhook routes, parse JSON body manually since bodyParser is disabled
  if (action !== 'webhook' && !req.body && req.method === 'POST') {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer | string>) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch { req.body = {}; }
  }

  return route(req, res);
}
