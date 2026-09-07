// ============================================================
// FortifyLens — API Key Auth Middleware
// Enables CI/CD pipelines to authenticate with an X-API-Key
// header instead of a Firebase ID token. Keys are stored in
// Firestore as SHA-256 hashes — the plain key is only ever
// shown once, at creation time.
// ============================================================

const crypto = require('crypto');
const { db } = require('../../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');
const { verifyToken } = require('./auth');

/**
 * verifyApiKey — Validates the X-API-Key header against the
 * Firestore 'apiKeys' collection (hashed lookup, revoked keys
 * rejected). Attaches { orgId, role: 'ci', uid: 'ci:<docId>' }
 * to req.user so downstream routes treat it like an org member.
 */
async function verifyApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing X-API-Key header' });
    }

    // Hash the incoming key — plaintext keys are never stored or queried
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const snapshot = await db.collection('apiKeys')
      .where('keyHash', '==', hash)
      .where('revoked', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    const doc = snapshot.docs[0];
    req.user = {
      orgId: doc.data().orgId,
      role: 'ci',
      uid: 'ci:' + doc.id,
    };

    // Fire-and-forget: record last usage without blocking the request
    doc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});

    next();
  } catch (err) {
    console.error('verifyApiKey error:', err);
    return res.status(401).json({ error: 'Invalid API key' });
  }
}

/**
 * verifyTokenOrApiKey — Dual-mode auth for routes shared by the
 * web app (Firebase Bearer token) and CI pipelines (X-API-Key).
 * If an X-API-Key header is present, API-key auth takes priority;
 * otherwise it falls back to standard token verification.
 */
function verifyTokenOrApiKey(req, res, next) {
  if (req.headers['x-api-key']) {
    return verifyApiKey(req, res, next);
  }
  return verifyToken(req, res, next);
}

module.exports = { verifyApiKey, verifyTokenOrApiKey };
