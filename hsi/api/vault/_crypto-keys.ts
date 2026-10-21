import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUserCryptoKeysTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);
  await ensureUserCryptoKeysTable(sql);

  if (req.method === 'GET') {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const [keys] = await sql`
      SELECT encrypted_kek, kek_iv, kek_salt, kek_iterations,
             public_key_jwk, encrypted_private_key, private_key_iv,
             messaging_public_key_jwk, encrypted_messaging_private_key, messaging_private_key_iv
      FROM user_crypto_keys WHERE email = ${email}
    `;
    if (!keys) return res.status(404).json({ error: 'No encryption keys found' });
    return res.status(200).json(keys);
  }

  if (req.method === 'POST') {
    const { email, encryptedKek, kekIv, kekSalt, kekIterations,
            publicKeyJwk, encryptedPrivateKey, privateKeyIv,
            messagingPublicKeyJwk, encryptedMessagingPrivateKey, messagingPrivateKeyIv } = req.body;

    if (!email || !encryptedKek || !kekIv || !kekSalt || !publicKeyJwk || !encryptedPrivateKey || !privateKeyIv) {
      return res.status(400).json({ error: 'Missing required key fields' });
    }

    try {
      await sql`
        INSERT INTO user_crypto_keys (email, encrypted_kek, kek_iv, kek_salt, kek_iterations,
          public_key_jwk, encrypted_private_key, private_key_iv,
          messaging_public_key_jwk, encrypted_messaging_private_key, messaging_private_key_iv)
        VALUES (${email}, ${encryptedKek}, ${kekIv}, ${kekSalt}, ${kekIterations || 600000},
          ${JSON.stringify(publicKeyJwk)}, ${encryptedPrivateKey}, ${privateKeyIv},
          ${messagingPublicKeyJwk ? JSON.stringify(messagingPublicKeyJwk) : null},
          ${encryptedMessagingPrivateKey || null}, ${messagingPrivateKeyIv || null})
        ON CONFLICT (email) DO UPDATE SET
          encrypted_kek = ${encryptedKek}, kek_iv = ${kekIv}, kek_salt = ${kekSalt},
          kek_iterations = ${kekIterations || 600000},
          public_key_jwk = ${JSON.stringify(publicKeyJwk)},
          encrypted_private_key = ${encryptedPrivateKey}, private_key_iv = ${privateKeyIv},
          messaging_public_key_jwk = COALESCE(${messagingPublicKeyJwk ? JSON.stringify(messagingPublicKeyJwk) : null}, user_crypto_keys.messaging_public_key_jwk),
          encrypted_messaging_private_key = COALESCE(${encryptedMessagingPrivateKey || null}, user_crypto_keys.encrypted_messaging_private_key),
          messaging_private_key_iv = COALESCE(${messagingPrivateKeyIv || null}, user_crypto_keys.messaging_private_key_iv)
      `;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Crypto keys save error:', err);
      return res.status(500).json({ error: 'Failed to save encryption keys' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
