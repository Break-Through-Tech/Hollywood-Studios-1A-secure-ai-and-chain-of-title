import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Signs a client-side upload for a Creative OS file. The browser sends the
 * bytes straight to Blob storage, so a script never has to fit inside a JSON
 * request body — which is what capped uploads at a few megabytes and answered
 * larger files with a bare 413.
 */
const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/xml', 'text/xml',       // .fdx (Final Draft)
  'application/octet-stream',          // .fountain and anything the browser can't name
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname }),
      }),
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('Vault upload token error:', err);
    return res.status(400).json({ error: (err as Error).message });
  }
}
