import { put } from '@vercel/blob';
import { connect, envVar } from './_db.mjs';

const sql = connect();
const blobToken = envVar('BLOB_READ_WRITE_TOKEN');
process.env.BLOB_READ_WRITE_TOKEN = blobToken;

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function run() {
  const entities = await sql`
    SELECT id, title, year, slug, image_url FROM entities
    WHERE type = 'movie' AND image_url IS NOT NULL
    ORDER BY year DESC
  `;

  console.log(`Migrating ${entities.length} posters to Vercel Blob\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const entity of entities) {
    if (entity.image_url.includes('vercel-storage.com') || entity.image_url.includes('blob.vercel-storage')) {
      console.log(`  – ${entity.title} (${entity.year}) already on Blob`);
      skipped++;
      continue;
    }

    try {
      const res = await fetch(entity.image_url, {
        headers: { 'User-Agent': 'HSI-Poster-Migration/1.0' },
      });

      if (!res.ok) {
        console.log(`  ✗ ${entity.title} (${entity.year}) — HTTP ${res.status}`);
        failed++;
        continue;
      }

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const buffer = Buffer.from(await res.arrayBuffer());
      const fileName = `entities/posters/${slugify(entity.title)}-${entity.year}.${ext}`;

      const blob = await put(fileName, buffer, {
        access: 'private',
        contentType,
      });

      await sql`UPDATE entities SET image_url = ${blob.url}, updated_at = NOW() WHERE id = ${entity.id}`;
      migrated++;
      console.log(`  ✓ ${entity.title} (${entity.year}) → ${blob.url.substring(0, 70)}...`);
    } catch (err) {
      console.log(`  ✗ ${entity.title} (${entity.year}) — ${err.message}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} already on Blob, ${failed} failed`);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
