// ============================================================
// FortifyLens — Auth Middleware
// Verifies Firebase ID tokens on protected routes
// ============================================================

const { auth, db } = require('../../config/firebase');

/**
 * verifyToken — Decodes & validates the Firebase JWT from the
 * Authorization: Bearer <token> header.
 * Attaches { uid, email, role, orgId } to req.user.
 */
async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = header.split(' ')[1];
    const decoded = await auth.verifyIdToken(token);

    // Fetch role & orgId from Firestore user profile
    let role = 'user';
    let orgId = null; // SECURITY/CORRECTNESS FIX: must be null for users with no real org —
                       // previously defaulted to decoded.uid, which made every individual
                       // user (with no org) look like they belonged to an org equal to
                       // their own uid, causing analysis.js to write orphan data into
                       // organizations/{their-own-uid}/projects/... for every single user.
    try {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        role  = data.role  || 'user';
        orgId = data.orgId || null; // only a real, explicitly-assigned orgId counts
      }
      // No profile yet, or no orgId field — orgId stays null (individual user)
    } catch (e) {
      // Profile fetch failed — orgId stays null; route-level resolveOrgId() guards handle this
    }

    req.user = {
      uid:   decoded.uid,
      email: decoded.email,
      role,
      orgId,
    };

    next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired, please log in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * requireRole — Role-based access control middleware factory.
 * Usage: router.get('/admin-only', verifyToken, requireRole('superadmin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };