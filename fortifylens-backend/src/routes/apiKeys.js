// ============================================================
// FortifyLens — API Keys Routes
// Org admins manage CI/CD API keys: create, list, revoke.
// Keys are stored as SHA-256 hashes; the plaintext key is
// returned exactly once (on creation) and never recoverable.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const { db }  = require('../../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// All key-management endpoints require an org admin or superadmin
router.use(verifyToken, requireRole('org_admin', 'superadmin'));

/**
 * POST /api/api-keys
 * Body: { label: string }
 * Generates a 256-bit random key, stores only its SHA-256 hash,
 * and returns the plaintext key exactly once.
 */
router.post('/', async (req, res) => {
  try {
    const { label } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ error: 'label is required' });
    }

    const plainKey = crypto.randomBytes(32).toString('base64url');
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    const docRef = await db.collection('apiKeys').add({
      orgId: req.user.orgId,
      keyHash,
      label: label.trim(),
      createdBy: req.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
      revoked: false,
    });

    // The only time the plaintext key is ever exposed
    res.status(201).json({ key: plainKey, keyId: docRef.id, label: label.trim() });
  } catch (err) {
    console.error('create apiKey error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * GET /api/api-keys
 * Lists the org's keys (metadata only — keyHash is never returned).
 */
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('apiKeys')
      .where('orgId', '==', req.user.orgId)
      .orderBy('createdAt', 'desc')
      .get();

    const keys = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        label: data.label,
        createdAt: data.createdAt || null,
        lastUsedAt: data.lastUsedAt || null,
        revoked: data.revoked,
      };
    });

    res.json(keys);
  } catch (err) {
    console.error('list apiKeys error:', err);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

/**
 * DELETE /api/api-keys/:keyId
 * Revokes a key (soft delete — the hash row is kept for audit,
 * but verifyApiKey() will reject it forever after).
 */
router.delete('/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;

    const docRef = db.collection('apiKeys').doc(keyId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // SECURITY: prevent cross-org revocation
    if (doc.data().orgId !== req.user.orgId) {
      return res.status(403).json({ error: 'Access denied. Key belongs to another organization' });
    }

    await docRef.update({ revoked: true });

    res.json({ message: 'API key revoked' });
  } catch (err) {
    console.error('revoke apiKey error:', err);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

module.exports = router;
