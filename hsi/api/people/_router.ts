import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import list from './_list.js';
import featured from './_featured.js';
import request from './_request.js';
import respond from './_respond.js';
import { resolveRouteAction } from '../_route.js';
import { guardClaimedSession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

const routes: Record<string, Handler> = {
  'list': list,
  'featured': featured,
  'request': request,
  'respond': respond,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'people');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // A request that names a member must carry that member's session; public
  // reads carry no claim and pass through.
  const sql = neon(process.env.DATABASE_URL!);
  if (!(await guardClaimedSession(sql, req, res))) return;

  return route(req, res);
}
