// ============================================================
// FortifyLens — Firebase Admin SDK Configuration
// Uses Service Account for server-side Firebase access
// ============================================================

const admin = require('firebase-admin');
const path = require('path');

let db, auth, storage;

function initFirebase() {
  if (admin.apps.length > 0) {
    // Already initialized
    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();
    return;
  }

  // Option A: Use service account JSON file (recommended for local dev)
  // Option B: Use environment variables (recommended for production)

  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Production: Base64-encoded service account JSON in env var
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    // Alternative: individual env variables
    credential = admin.credential.cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:   process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    // Local dev: Use serviceAccountKey.json file placed in backend root
    const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    const serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
  }

  admin.initializeApp({
    credential,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'fortifylens-cba3f.firebasestorage.app',
  });

  db      = admin.firestore();
  auth    = admin.auth();
  storage = admin.storage();

  console.log('✅ Firebase Admin SDK initialized');
}

initFirebase();

module.exports = { admin, db, auth, storage };
