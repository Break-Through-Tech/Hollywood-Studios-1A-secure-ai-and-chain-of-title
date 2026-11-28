import type { VercelRequest, VercelResponse } from '@vercel/node';
import createWorkspace from './_create-workspace.js';
import cryptoKeys from './_crypto-keys.js';
import cryptoPublicKey from './_crypto-public-key.js';
import del from './_delete.js';
import download from './_download.js';
import extractText from './_extract-text.js';
import get from './_get.js';
import list from './_list.js';
import move from './_move.js';
import folderCreate from './folders/_create.js';
import folderDelete from './folders/_delete.js';
import folderRename from './folders/_rename.js';
import preview from './_preview.js';
import save from './_save.js';
import share from './_share.js';
import shareKey from './_share-key.js';
import timestamp from './_timestamp.js';
import timestampStatus from './_timestamp-status.js';
import timestampVerify from './_timestamp-verify.js';
import unshare from './_unshare.js';
import upload from './_upload.js';
import uploadToken from './_upload-token.js';
import actAnalysis from './analysis/_act-analysis.js';
import decompose from './analysis/_decompose.js';
import reset from './analysis/_reset.js';
import run from './analysis/_run.js';
import status from './analysis/_status.js';
import assistant from './_assistant.js';
import trackCreateLink from './tracking/_create-link.js';
import trackListLinks from './tracking/_list-links.js';
import trackUpdateLink from './tracking/_update-link.js';
import trackResolve from './tracking/_resolve.js';
import trackUnlock from './tracking/_unlock.js';
import trackDeactivateAll from './tracking/_deactivate-all.js';
import trackSignatures from './tracking/_signatures.js';
import trackVersions from './tracking/_versions.js';
import trackStart from './tracking/_start.js';
import trackBeat from './tracking/_beat.js';
import trackNote from './tracking/_note.js';
import trackSummary from './tracking/_summary.js';
import attachDelete from './attachments/_delete.js';
import attachDownload from './attachments/_download.js';
import attachList from './attachments/_list.js';
import attachUpload from './attachments/_upload.js';
import trackVerifyViewer from './tracking/_verify-viewer.js';
import trackDownloadEvent from './tracking/_download-event.js';
import { resolveRouteAction } from '../_route.js';
import { neon } from '@neondatabase/serverless';
import { guardClaimedSession, guardAnySession } from '../_session.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  'create-workspace': createWorkspace,
  'crypto-keys': cryptoKeys,
  'crypto-public-key': cryptoPublicKey,
  'delete': del,
  'download': download,
  'extract-text': extractText,
  'get': get,
  'list': list,
  'move': move,
  'folders/create': folderCreate,
  'folders/delete': folderDelete,
  'folders/rename': folderRename,
  'preview': preview,
  'save': save,
  'share': share,
  'share-key': shareKey,
  'timestamp': timestamp,
  'timestamp-status': timestampStatus,
  'timestamp-verify': timestampVerify,
  'unshare': unshare,
  'upload': upload,
  'upload-token': uploadToken,
  'analysis/act-analysis': actAnalysis,
  'analysis/decompose': decompose,
  'analysis/reset': reset,
  'analysis/run': run,
  'analysis/status': status,
  'assistant': assistant,
  'tracking/create-link': trackCreateLink,
  'tracking/list-links': trackListLinks,
  'tracking/update-link': trackUpdateLink,
  'tracking/resolve': trackResolve,
  'tracking/unlock': trackUnlock,
  'tracking/deactivate-all': trackDeactivateAll,
  'tracking/signatures': trackSignatures,
  'tracking/versions': trackVersions,
  'tracking/start': trackStart,
  'tracking/beat': trackBeat,
  'tracking/note': trackNote,
  'tracking/summary': trackSummary,
  'tracking/verify-viewer': trackVerifyViewer,
  'tracking/download-event': trackDownloadEvent,
  'attachments/delete': attachDelete,
  'attachments/download': attachDownload,
  'attachments/list': attachList,
  'attachments/upload': attachUpload,
};

// Viewer-facing routes: no login session exists, identity is gated inside the handlers.
const PUBLIC_ROUTES = new Set([
  'tracking/resolve',
  'tracking/unlock',
  'tracking/start',
  'tracking/beat',
  'tracking/note', // viewer path; the owner path re-checks the session itself
  'tracking/verify-viewer',
  'tracking/download-event',
  'crypto-public-key', // public keys are public by design
  'timestamp-verify',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveRouteAction(req, 'vault');
  const route = routes[action];
  if (!route) return res.status(404).json({ error: `Unknown route: ${action}` });

  if (!PUBLIC_ROUTES.has(action)) {
    const sql = neon(process.env.DATABASE_URL!);
    // Upload tokens carry no email but hand out storage; any member may have one, nobody else.
    if (action === 'upload-token' && !(await guardAnySession(sql, req, res))) return;
    if (!(await guardClaimedSession(sql, req, res))) return;
  }

  return route(req, res);
}
