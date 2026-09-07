// ============================================================
// FortifyLens — Input Validation Helpers
// ============================================================

function validateRequired(fields, body) {
  const missing = fields.filter(f => !body[f] && body[f] !== false);
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  return { valid: true };
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validateProjectDomain(domain) {
  const allowed = ['web-application', 'mobile-app', 'api-service', 'cloud-infrastructure', 'iot', 'desktop-app', 'other'];
  return allowed.includes(domain);
}

function validateProjectPhase(phase) {
  return ['requirement', 'design', 'development'].includes(phase);
}

function validateSeverity(severity) {
  return ['Critical', 'High', 'Medium', 'Low'].includes(severity);
}

// SECURITY FIX: sanitizeString previously only trimmed/truncated —
// it let raw HTML/script markup through into Firestore untouched.
// React escapes on render today, so this wasn't directly exploitable
// yet, but any future PDF export, email template, admin tool, or
// dangerouslySetInnerHTML use of this stored text would be stored-XSS.
// Escaping here makes the API itself safe regardless of how a
// consumer later renders the value.
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return escapeHtml(str.trim().slice(0, maxLen));
}

module.exports = {
  validateRequired,
  validateEmail,
  validateProjectDomain,
  validateProjectPhase,
  validateSeverity,
  sanitizeString,
};