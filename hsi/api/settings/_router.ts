import type { VercelRequest, VercelResponse } from '@vercel/node';
import accountGet from './account/_get.js';
import accountPassword from './account/_password.js';
import accountUpdate from './account/_update.js';
import codesInvite from './codes/_invite.js';
import codesList from './codes/_list.js';
import friendsList from './friends/_list.js';
import friendsRemove from './friends/_remove.js';
import friendsRespond from './friends/_respond.js';
import networkGet from './network/_get.js';
import networkUpdate from './network/_update.js';
import pagesAdd from './pages/_add.js';
import pagesDelete from './pages/_delete.js';
import pagesList from './pages/_list.js';
import pagesUpdate from './pages/_update.js';
import { resolveRouteAction } from '../_route.js';
import { neon } from '@neondatabase/serverless';
import { guardClaimedSession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'account/get': accountGet,
  'account/password': accountPassword,
  'account/update': accountUpdate,
  'codes/invite': codesInvite,
  'codes/list': codesList,
  'friends/list': friendsList,
  'friends/remove': friendsRemove,
  'friends/respond': friendsRespond,
  'network/get': networkGet,
  'network/update': networkUpdate,
  'pages/add': pagesAdd,
  'pages/delete': pagesDelete,
  'pages/list': pagesList,
  'pages/update': pagesUpdate,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'settings');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  const sql = neon(process.env.DATABASE_URL!);
  if (!(await guardClaimedSession(sql, req, res))) return;

  return route(req, res);
}
