import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import get from './_get.js';
import upsert from './_upsert.js';
import connect from './_connect.js';
import awardsDelete from './awards/_delete.js';
import awardsSave from './awards/_save.js';
import creditsSave from './credits/_save.js';
import experienceDelete from './experience/_delete.js';
import experienceSave from './experience/_save.js';
import { resolveRouteAction } from '../_route.js';
import { guardClaimedSession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'get': get,
  'upsert': upsert,
  'connect': connect,
  'awards/delete': awardsDelete,
  'awards/save': awardsSave,
  'credits/save': creditsSave,
  'experience/delete': experienceDelete,
  'experience/save': experienceSave,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'profile');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // A request that names a member must carry that member's session; public
  // reads carry no claim and pass through.
  const sql = neon(process.env.DATABASE_URL!);
  if (!(await guardClaimedSession(sql, req, res))) return;

  return route(req, res);
}
