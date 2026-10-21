import type { VercelRequest, VercelResponse } from '@vercel/node';
import query from './_query.js';
import trending from './_trending.js';
import { resolveRouteAction } from '../_route.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

const routes: Record<string, Handler> = {
  'query': query,
  'trending': trending,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'search');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });
  return route(req, res);
}
