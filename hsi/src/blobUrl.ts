export function blobUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes('.private.blob.vercel-storage.com')) {
    return `/api/blob/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
