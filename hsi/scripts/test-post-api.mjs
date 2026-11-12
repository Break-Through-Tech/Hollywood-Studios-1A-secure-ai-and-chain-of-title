import { register } from "node:module";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./_db.mjs";

process.env.DATABASE_URL = databaseUrl();
register(new URL("./ts-resolver.mjs", import.meta.url));

const sql = neon(process.env.DATABASE_URL);
const { default: networkRouter } = await import(
  new URL("../api/network/_router.ts", import.meta.url).href
);
const { createSession } = await import(
  new URL("../api/_session.ts", import.meta.url).href
);
const { ensureProfile } = await import(
  new URL("../api/auth/_ensure-profile.ts", import.meta.url).href
);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `post-test-${runId}@hsi-selftest.invalid`;
const content = `Post API database test ${runId}`;
let profileId;
let failure;

try {
  await ensureProfile(sql, email);
  const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
  if (!profile) throw new Error("Test profile was not created");
  profileId = profile.id;

  const token = await createSession(sql, email);
  const req = {
    method: "POST",
    body: { email, content },
    query: {},
    cookies: {},
    url: "/api/network/posts/create",
    headers: { authorization: `Bearer ${token}` },
  };
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await networkRouter(req, res);
  if (res.statusCode !== 201) {
    throw new Error(
      `Create request returned ${res.statusCode}: ${JSON.stringify(res.body)}`,
    );
  }

  const postId = res.body?.post?.id;
  if (postId === undefined)
    throw new Error("Create response did not include a post ID");

  const [savedPost] = await sql`
    SELECT id, content FROM posts
    WHERE id = ${postId} AND profile_id = ${profileId}
  `;
  if (!savedPost || savedPost.content !== content) {
    throw new Error(
      "Created post was not found in the database with the expected content",
    );
  }

  console.log(
    `PASS: POST /api/network/posts/create returned 201; post ${postId} was saved.`,
  );
} catch (err) {
  failure = err;
} finally {
  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (profile) {
      await sql`DELETE FROM post_likes WHERE post_id IN (
        SELECT id FROM posts WHERE profile_id = ${profile.id} AND content = ${content}
      )`;
      await sql`DELETE FROM posts WHERE profile_id = ${profile.id} AND content = ${content}`;
      await sql`DELETE FROM user_sessions WHERE email = ${email}`;
      await sql`DELETE FROM profiles WHERE id = ${profile.id}`;
    }
  } catch (err) {
    console.error("Cleanup failed for this test profile:", err);
    failure ||= err;
  }
}

if (failure) {
  console.error("FAIL: Post API database test did not complete successfully.");
  console.error(failure);
  process.exitCode = 1;
}
