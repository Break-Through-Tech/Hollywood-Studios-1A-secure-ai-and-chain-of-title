import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import apply from './_apply.js';
import checkEmail from './_check-email.js';
import sendOtp from './_send-otp.js';
import verifyOtp from './_verify-otp.js';
import blobImage from './_blob-image.js';
import uploadImage from './_upload-image.js';
import { resolveRouteAction } from '../_route.js';
import { guardAnySession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'apply': apply,
  'check-email': checkEmail,
  'send-otp': sendOtp,
  'verify-otp': verifyOtp,
  'blob/image': blobImage,
  'upload/image': uploadImage,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'auth');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  // Sign-in routes are public by nature; storing an image is for members.
  if (action === 'upload/image') {
    const sql = neon(process.env.DATABASE_URL!);
    if (!(await guardAnySession(sql, req, res))) return;
  }

  return route(req, res);
}
