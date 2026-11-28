import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import create from './_create.js';
import companySave from './_company-save.js';
import del from './_delete.js';
import get from './_get.js';
import list from './_list.js';
import myPages from './_my-pages.js';
import search from './_search.js';
import update from './_update.js';
import view from './_view.js';
import projects from './_projects.js';
import { resolveRouteAction } from '../_route.js';
import { guardClaimedSession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

const routes: Record<string, Handler> = {
  'create': create,
  'company-save': companySave,
  'delete': del,
  'get': get,
  'list': list,
  'my-pages': myPages,
  'search': search,
  'update': update,
  'view': view,
  'projects': projects,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'entity');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // A request that names a member must carry that member's session; public
  // reads carry no claim and pass through.
  const sql = neon(process.env.DATABASE_URL!);
  if (!(await guardClaimedSession(sql, req, res))) return;

  return route(req, res);
}
