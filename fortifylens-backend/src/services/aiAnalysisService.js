// ============================================================
// FortifyLens — Claude AI Deep Analysis Service  (FIXED)
//
// FIXES APPLIED:
//   1. MODEL: changed 'claude-sonnet-4-6' → 'claude-sonnet-4-5'
//      (4-6 doesn't exist and silently fails or routes wrong)
//
//   2. max_tokens: 4000 → 8192
//      The JSON schema for requirements/threats/code is large.
//      4000 tokens is often not enough, causing truncated JSON
//      that fails to parse with "Expected ',' or ']'" errors.
//
//   3. safeParseJSON: the old regex /{[\s\S]*}/ matches the
//      OUTERMOST braces greedily, which works — but if the
//      model adds markdown fences OR trailing text the regex
//      still fails. New version: strip fences first, then
//      find the JSON object/array, then parse.
//
//   4. DOMAIN_POLICIES: added 2 new domains (mobile, devops)
//      to reach 8 total, as requested.
//
//   5. detectDomain: added keywords for mobile + devops,
//      and tightened threshold logic so domain falls through
//      to 'general' cleanly when nothing matches.
//
//   6. buildPolicyContext: inlined the full policy including
//      domain label so the model always knows what it's doing.
//
//   7. All three analysis functions:
//      - Added explicit JSON instruction in user message
//        ("Return ONLY raw JSON. No markdown. No preamble.")
//      - Increased max_tokens to 8192
//      - safeParseJSON wraps every parse in a fallback that
//        logs the raw response before throwing so you can
//        diagnose future truncation issues
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ✅ FIXED: correct model string
const MODEL = 'claude-sonnet-4-5';

// ✅ FIXED: max output tokens — 4000 was too small for large JSON
const MAX_TOKENS = 8192;

// ─── SHARED HELPER ────────────────────────────────────────────

/**
 * Robustly extracts and parses JSON from a model response.
 * Handles: markdown fences, leading/trailing prose, partial wrapping.
 */
function safeParseJSON(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('safeParseJSON: received empty or non-string input');
  }

  // 1. Strip ```json ... ``` or ``` ... ``` fences
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();

  // 2. Try direct parse first (model sometimes returns clean JSON)
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // continue
  }

  // 3. Find the outermost { ... } block
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      console.error('[safeParseJSON] JSON parse failed. Raw snippet (first 500 chars):', cleaned.slice(0, 500));
      throw err;
    }
  }

  // 4. Find the outermost [ ... ] block (array-rooted response)
  const aStart = cleaned.indexOf('[');
  const aEnd   = cleaned.lastIndexOf(']');
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    try {
      return JSON.parse(cleaned.slice(aStart, aEnd + 1));
    } catch (err) {
      console.error('[safeParseJSON] Array JSON parse failed. Raw snippet:', cleaned.slice(0, 500));
      throw err;
    }
  }

  console.error('[safeParseJSON] No JSON object or array found. Full raw response:', raw.slice(0, 1000));
  throw new Error('safeParseJSON: no JSON structure found in response');
}

// ═══════════════════════════════════════════════════════════════
// POLICY LAYER  (8 domains)
// ═══════════════════════════════════════════════════════════════

const DOMAIN_POLICIES = {

  healthcare: {
    label: 'Healthcare / MedTech',
    compliance: ['HIPAA', 'HITECH', 'HL7 FHIR Security', 'NIST 800-66'],
    mandatoryControls: [
      'PHI must be encrypted at rest (AES-256) and in transit (TLS 1.2+)',
      'Access to PHI must be role-based with minimum necessary access principle',
      'All PHI access must be logged with user ID, timestamp, and action (HIPAA Audit Controls)',
      'Multi-factor authentication required for all users accessing PHI',
      'Automatic session timeout after inactivity (max 15 minutes for PHI access)',
      'Business Associate Agreements (BAA) required for all third-party vendors handling PHI',
      'Data breach notification procedures must be defined (HIPAA Breach Notification Rule)',
      'PHI must never be stored in logs, error messages, or analytics systems',
      'Patient consent must be obtained before collecting or sharing health data',
      'Data retention and secure disposal policies must be defined for PHI',
      'Backup and disaster recovery procedures must be defined and tested',
      'Vulnerability management and patching procedures must be documented',
    ],
    riskAreas: [
      'Unencrypted PHI storage or transmission',
      'Missing audit logging for PHI access',
      'PHI exposed in error messages or logs',
      'Inadequate access controls on patient records',
      'Missing BAA with cloud providers or third-party services',
      'No breach notification process defined',
      'Session management weaknesses allowing unauthorized PHI access',
    ],
  },

  finance: {
    label: 'Finance / FinTech / Banking',
    compliance: ['PCI-DSS v4.0', 'SOX', 'GDPR (if EU)', 'FFIEC', 'GLBA', 'ISO 27001'],
    mandatoryControls: [
      'Cardholder data (PAN, CVV, expiry) must NEVER be stored — use tokenization',
      'All payment data transmission must use TLS 1.2 or higher',
      'Strong cryptography required for all sensitive financial data at rest',
      'MFA required for all access to financial systems and admin panels',
      'Separation of duties: no single user can initiate and approve financial transactions',
      'All financial transactions must have a complete, immutable audit trail',
      'Network segmentation: payment systems must be isolated from general systems',
      'Anti-fraud controls: rate limiting, anomaly detection on transaction patterns',
      'Input validation on all financial fields (amounts, account numbers, routing numbers)',
      'Penetration testing required annually (PCI-DSS requirement)',
      'All access to financial data must be logged and monitored',
      'Secure key management for encryption keys (HSM recommended)',
      'Data retention policies aligned with regulatory requirements',
      'Incident response plan must cover financial data breaches',
    ],
    riskAreas: [
      'Storage of raw card data (PCI-DSS violation)',
      'Unencrypted financial data in transit or at rest',
      'Missing or bypassable authentication on financial endpoints',
      'No transaction audit trail',
      'Client-side price or amount manipulation',
      'Missing fraud detection or rate limiting on payment endpoints',
      'Hardcoded API keys for payment processors',
      'Insecure direct object reference on financial records',
    ],
  },

  ecommerce: {
    label: 'E-Commerce / Retail',
    compliance: ['PCI-DSS v4.0', 'GDPR', 'CCPA', 'WCAG (accessibility)'],
    mandatoryControls: [
      'Payment card data must never be stored — use payment processor tokenization (Stripe, Braintree)',
      'All checkout and account pages must enforce HTTPS',
      'User passwords must be hashed with bcrypt, Argon2, or scrypt (never MD5 or SHA1)',
      'Session tokens must use HttpOnly, Secure, and SameSite cookie attributes',
      'All user-uploaded files must be validated for type, size, and scanned for malware',
      'SQL queries must use parameterized statements or ORM — never string concatenation',
      'Admin panel must require MFA and be restricted by IP or VPN',
      'Rate limiting on login, registration, and checkout endpoints',
      'CSRF protection on all state-changing requests',
      'Personal data (name, email, address) must be protected per GDPR/CCPA',
      'Order and payment history must be access-controlled per user',
      'Bulk admin operations must require confirmation and produce audit logs',
    ],
    riskAreas: [
      'Storing raw card data instead of using tokenization',
      'Plain text or weakly hashed passwords',
      'Unrestricted file upload',
      'SQL injection via search, category, or product filters',
      'Missing authentication on order creation or deletion endpoints',
      'Price or quantity manipulation from client-side values',
      'IDOR on order or user profile endpoints',
    ],
  },

  saas: {
    label: 'SaaS / Multi-Tenant Platform',
    compliance: ['SOC 2 Type II', 'ISO 27001', 'GDPR', 'OWASP Top 10'],
    mandatoryControls: [
      'Tenant isolation: one tenant must never access another tenant\'s data',
      'All API endpoints must enforce authentication and authorization',
      'Role-based access control with least privilege principle',
      'Data encryption at rest and in transit for all tenant data',
      'API rate limiting per tenant to prevent abuse and DoS',
      'Comprehensive audit logging: who did what, when, on which tenant',
      'Secure multi-tenancy: tenant ID must come from authenticated session, never from request body',
      'Secrets and API keys must be stored in a secrets manager — never hardcoded',
      'Dependency vulnerability scanning in CI/CD pipeline',
      'Penetration testing and security reviews before major releases',
      'Data backup and recovery tested regularly',
      'Incident response and breach notification procedures defined',
    ],
    riskAreas: [
      'Tenant ID accepted from user input (tenant confusion/escalation)',
      'Cross-tenant data leakage in shared database queries',
      'Missing authorization checks on API endpoints',
      'Hardcoded secrets or credentials in source',
      'Missing rate limiting enabling DoS by one tenant',
      'Overly permissive roles allowing privilege escalation',
    ],
  },

  healthcare_device: {
    label: 'Medical Device / IoT Healthcare',
    compliance: ['FDA 21 CFR Part 11', 'IEC 62443', 'HIPAA', 'MDR (EU)', 'NIST 800-82'],
    mandatoryControls: [
      'Firmware must be signed and verified before execution',
      'Secure boot chain must be implemented and documented',
      'All device communications must use encrypted channels (TLS/DTLS)',
      'Default credentials must not be present — credentials must be unique per device',
      'Over-the-air updates must be authenticated and integrity-verified',
      'Physical access controls must be documented for devices handling PHI',
      'Audit logs for all device configuration changes',
      'Network segmentation: medical devices must be on isolated network segments',
      'Vulnerability disclosure and patch management process must be defined',
      'PHI transmitted by device must meet HIPAA encryption requirements',
    ],
    riskAreas: [
      'Default or hardcoded device credentials',
      'Unsigned or unverified firmware updates',
      'Unencrypted device communications',
      'No network segmentation for medical devices',
      'Missing audit trail for device configuration changes',
    ],
  },

  government: {
    label: 'Government / Public Sector',
    compliance: ['FedRAMP', 'NIST 800-53', 'FISMA', 'FIPS 140-2', 'Section 508'],
    mandatoryControls: [
      'Only FIPS 140-2 validated cryptographic modules must be used',
      'MFA required for all privileged access',
      'Continuous monitoring and security assessment required (FedRAMP)',
      'Data must be classified and handled per government data classification policy',
      'All systems must have an Authority to Operate (ATO) process',
      'Audit logs must be tamper-evident and retained per NIST requirements',
      'Supply chain risk management for all software components',
      'Incident response plan aligned with US-CERT reporting requirements',
      'Privacy Impact Assessment required for systems processing PII',
      'Zero trust architecture principles must be applied',
    ],
    riskAreas: [
      'Non-FIPS cryptography in use',
      'Inadequate access controls on classified or sensitive data',
      'Missing audit trail or tamper-evident logging',
      'Supply chain risks in third-party dependencies',
      'Missing continuous monitoring capability',
    ],
  },

  // ✅ NEW DOMAIN 7: Mobile Application
  mobile: {
    label: 'Mobile Application (iOS / Android)',
    compliance: ['OWASP MASVS', 'OWASP Mobile Top 10', 'GDPR', 'App Store / Play Store Guidelines'],
    mandatoryControls: [
      'Sensitive data must not be stored in plaintext on device (SharedPreferences, NSUserDefaults)',
      'All API communications must use certificate pinning and TLS 1.2+',
      'Biometric or PIN authentication required for accessing sensitive app features',
      'App must not log sensitive data (tokens, PII) to system logs (logcat, NSLog)',
      'Root/jailbreak detection should be implemented for sensitive operations',
      'Deep link handling must validate and sanitize all incoming parameters',
      'WebViews must disable JavaScript interfaces to native code unless absolutely required',
      'Sensitive data must be cleared from memory after use',
      'App binary must not contain hardcoded secrets, API keys, or credentials',
      'Exported activities/intents must be protected with proper permissions',
      'Clipboard access for sensitive fields (passwords, card numbers) must be blocked',
      'Local authentication tokens must have expiry and be invalidated on logout',
    ],
    riskAreas: [
      'Sensitive data stored unencrypted in SQLite or SharedPreferences',
      'Hardcoded API keys or secrets in APK/IPA binary',
      'Missing certificate pinning allowing MITM attacks',
      'Insecure deep link handling leading to parameter injection',
      'Exported components allowing unauthorized access to app internals',
      'WebView JavaScript bridge enabling native code execution from web content',
      'Cleartext traffic in AndroidManifest or App Transport Security exceptions',
    ],
  },

  // ✅ NEW DOMAIN 8: DevOps / Cloud Infrastructure
  devops: {
    label: 'DevOps / Cloud Infrastructure / CI-CD',
    compliance: ['CIS Benchmarks', 'NIST SSDF', 'SOC 2 Type II', 'ISO 27001', 'OWASP Top 10 CI/CD'],
    mandatoryControls: [
      'Secrets must never be committed to source control — use a secrets manager (Vault, AWS Secrets Manager)',
      'CI/CD pipelines must scan dependencies for known CVEs before deployment',
      'Containers must run as non-root and with read-only filesystems where possible',
      'Infrastructure-as-Code (IaC) templates must be linted for misconfigurations (tfsec, checkov)',
      'Cloud storage buckets must not be publicly writable; default-deny access policy required',
      'Network security groups / firewall rules must follow least-privilege (no 0.0.0.0/0 inbound)',
      'All cloud API credentials must use short-lived tokens or IAM roles — no long-lived access keys',
      'Container images must be built from trusted base images and signed (Cosign, Notary)',
      'Kubernetes RBAC must be configured with least privilege per service account',
      'Audit logging must be enabled for all cloud control-plane operations (CloudTrail, Cloud Audit)',
      'Immutable infrastructure: production changes must go through CI/CD, not manual SSH',
      'Dependency pinning: use exact versions or digests, not floating tags',
    ],
    riskAreas: [
      'Secrets or credentials hardcoded in Dockerfiles, Helm charts, or CI config',
      'World-writable S3 buckets or GCS buckets',
      'Containers running as root with excessive Linux capabilities',
      'Overly permissive IAM roles (wildcard * actions or resources)',
      'Unencrypted secrets in Kubernetes ConfigMaps',
      'CI/CD pipeline with no dependency vulnerability scanning',
      'SSH access to production servers bypassing change control',
      'Floating Docker image tags allowing silent dependency changes',
    ],
  },

  general: {
    label: 'General Software / Web Application',
    compliance: ['OWASP Top 10', 'OWASP ASVS Level 2', 'CWE Top 25', 'NIST SSDF'],
    mandatoryControls: [
      'Authentication: strong password policy, secure hashing (bcrypt/Argon2), MFA for sensitive actions',
      'Authorization: every endpoint must verify the caller has permission for the requested resource',
      'Session management: secure cookies (HttpOnly, Secure, SameSite), token expiry, logout invalidation',
      'Input validation: all user input must be validated, sanitized, and used in safe APIs',
      'Output encoding: all output must be encoded for the context (HTML, SQL, shell, etc.)',
      'Sensitive data: encryption at rest and in transit, no secrets in source code or logs',
      'Error handling: generic errors to users, detailed logs server-side only',
      'Dependency management: no known vulnerable dependencies, regular updates',
      'Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options',
      'Rate limiting and brute-force protection on authentication endpoints',
      'CSRF protection on all state-changing operations',
      'Audit logging for security-relevant events',
    ],
    riskAreas: [
      'Injection vulnerabilities (SQL, command, template)',
      'Broken authentication or session management',
      'Missing or bypassable authorization',
      'Sensitive data exposure',
      'Security misconfiguration',
      'Vulnerable and outdated components',
      'Insufficient logging and monitoring',
    ],
  },
};

// ─── DOMAIN DETECTION ────────────────────────────────────────

const DOMAIN_KEYWORDS = {
  healthcare: [
    'patient', 'ehr', 'emr', 'phi', 'hipaa', 'hitech', 'clinical', 'diagnosis',
    'prescription', 'medical record', 'health data', 'provider', 'telemedicine',
    'lab result', 'radiology', 'pharmacy', 'physician', 'hospital', 'clinic',
    'healthcare', 'fhir', 'hl7', 'dicom', 'icd', 'cpt code',
  ],
  healthcare_device: [
    'medical device', 'firmware', 'iot device', 'embedded', 'sensor', 'implant',
    'wearable', 'ventilator', 'infusion pump', 'pacemaker', 'glucose monitor',
    'fda', 'mdr', 'iec 62443', 'secure boot', 'over-the-air', 'ota update',
  ],
  finance: [
    'payment', 'transaction', 'card', 'bank', 'loan', 'credit', 'debit',
    'account number', 'routing number', 'wire transfer', 'pci', 'pci-dss',
    'sox', 'glba', 'ffiec', 'trading', 'investment', 'portfolio', 'kyc',
    'aml', 'fintech', 'ledger', 'settlement', 'clearing', 'swift', 'ach',
    'stripe', 'braintree', 'paypal', 'cryptocurrency', 'wallet', 'blockchain',
  ],
  ecommerce: [
    'cart', 'checkout', 'product', 'order', 'shipping', 'inventory',
    'e-commerce', 'ecommerce', 'shop', 'store', 'purchase', 'buyer',
    'seller', 'merchant', 'sku', 'catalog', 'wishlist', 'coupon', 'discount',
    'stripe', 'payment gateway', 'fulfillment', 'returns', 'refund',
  ],
  saas: [
    'tenant', 'multi-tenant', 'subscription', 'workspace', 'organization',
    'saas', 'soc 2', 'soc2', 'api key', 'webhook', 'integration', 'plan',
    'billing cycle', 'usage limit', 'seat', 'enterprise tier',
  ],
  government: [
    'fedramp', 'fisma', 'nist 800-53', 'fips', 'ato', 'authority to operate',
    'government', 'federal', 'agency', 'classified', 'cui', 'fouo',
    'section 508', 'dod', 'dhs', 'gsa', 'clearance', 'public sector',
  ],
  // ✅ NEW
  mobile: [
    'android', 'ios', 'swift', 'kotlin', 'react native', 'flutter', 'xamarin',
    'mobile app', 'apk', 'ipa', 'play store', 'app store', 'push notification',
    'deep link', 'webview', 'biometric', 'face id', 'touch id', 'masvs',
    'shared preferences', 'nsuserdefaults', 'keychain', 'keystore', 'logcat',
  ],
  // ✅ NEW
  devops: [
    'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'ansible', 'ci/cd',
    'pipeline', 'github actions', 'gitlab ci', 'jenkins', 'aws', 'gcp', 'azure',
    'iam role', 's3 bucket', 'cloudtrail', 'dockerfile', 'container', 'pod',
    'secret manager', 'vault', 'infrastructure as code', 'iac', 'ecr', 'gcr',
    'rbac', 'service account', 'ingress', 'helm chart', 'argocd', 'flux',
  ],
};

function detectDomain(text) {
  const lower = text.toLowerCase();
  const scores = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
  }

  // healthcare_device needs a stronger signal to beat plain healthcare
  if (scores.healthcare_device >= 3) return 'healthcare_device';

  // Build ranked list excluding healthcare_device (already handled)
  const ranked = Object.entries(scores)
    .filter(([d]) => d !== 'healthcare_device')
    .sort((a, b) => b[1] - a[1]);

  const [topDomain, topScore] = ranked[0];

  // Finance beats ecommerce when both are high (stricter regulations)
  if (topDomain === 'ecommerce' && scores.finance >= 2) return 'finance';

  // Must score at least 2 keyword matches to claim a domain
  return topScore >= 2 ? topDomain : 'general';
}

function buildPolicyContext(domain) {
  const policy = DOMAIN_POLICIES[domain] || DOMAIN_POLICIES.general;
  return `
DOMAIN DETECTED: ${policy.label}

APPLICABLE COMPLIANCE FRAMEWORKS:
${policy.compliance.map(c => `  - ${c}`).join('\n')}

MANDATORY SECURITY CONTROLS FOR THIS DOMAIN:
(Every item below is a policy requirement. Flag any that are violated or absent.)
${policy.mandatoryControls.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

KNOWN HIGH-RISK AREAS FOR THIS DOMAIN:
(Pay extra attention to these — they are the most exploited in ${policy.label} systems.)
${policy.riskAreas.map(r => `  - ${r}`).join('\n')}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: REQUIREMENTS ANALYSIS
// ═══════════════════════════════════════════════════════════════

const REQUIREMENTS_BASE_PROMPT = `You are a senior application security engineer reviewing a requirements document. Your analysis must be grounded in the specific compliance frameworks and mandatory controls defined in the POLICY CONTEXT below.

APPROACH:
1. Read the document and understand what the system does, who uses it, and what data it handles.
2. Check every mandatory control in the policy — is it addressed correctly, addressed insecurely, or missing?
3. Look beyond the checklist too — flag any security issue specific to this system that the policy doesn't explicitly cover.
4. Every finding must quote or reference something in the document, or clearly state the control is absent.

SEVERITY:
- Critical: direct path to data breach, account takeover, or compliance violation that triggers regulatory penalty
- High: significant exploitable gap or clear policy violation
- Medium: security weakness or incomplete control
- Low: vague requirement, unmeasurable NFR, minor gap

CRITICAL OUTPUT RULES:
- Return ONLY raw JSON. No markdown fences. No preamble. No explanation after the JSON.
- The response must start with { and end with }
- Do not truncate arrays — complete every array before closing

Return this exact JSON structure:

{
  "findings": [
    {
      "severity": "Critical | High | Medium | Low",
      "issue": "Short descriptive title (max 10 words)",
      "description": "What the document says or omits, and why it is a security problem",
      "recommendation": "The specific requirement text that should be added or corrected",
      "lineContext": "Copy the exact sentence/bullet from the document that is wrong. If entirely absent: [Not present in document]",
      "policy": "The compliance framework or mandatory control this violates (e.g. HIPAA Audit Controls, PCI-DSS Req 3.2)"
    }
  ],
  "securityScore": 0,
  "riskScore": 0,
  "riskLevel": "Critical | High | Medium | Low",
  "domain": "detected domain label",
  "applicableFrameworks": ["list of compliance frameworks that apply"],
  "summary": "3-4 sentences: what the system does, which domain/policies apply, current security posture, top concerns",
  "missingRequirements": ["Policy-grounded requirement that is absent from the document"],
  "securityChecklist": [
    "✅ Mandatory control that IS properly addressed",
    "⚠️ Mandatory control that IS mentioned but defined insecurely",
    "🔲 Mandatory control that is MISSING from the document"
  ],
  "positiveFindings": ["Specific things the document handles correctly"]
}`;

async function analyzeRequirementsWithAI(requirementsText) {
  try {
    const domain = detectDomain(requirementsText);
    const policyContext = buildPolicyContext(domain);
    const systemPrompt = `${REQUIREMENTS_BASE_PROMPT}\n\n---\nPOLICY CONTEXT:\n${policyContext}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,  // ✅ FIXED: was 4000
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this requirements document. Apply every mandatory control in the policy context — flag violations and gaps precisely.\n\nIMPORTANT: Return ONLY raw JSON starting with { — no markdown, no preamble.\n\n${requirementsText}`,
        },
      ],
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[aiAnalysisService] Requirements raw response length:', raw.length, '| stop_reason:', response.stop_reason);

    const parsed = safeParseJSON(raw);

    return {
      findings:             parsed.findings             || [],
      securityScore:        parsed.securityScore        ?? 50,
      riskScore:            parsed.riskScore            ?? 50,
      riskLevel:            parsed.riskLevel            || 'Medium',
      domain:               parsed.domain               || domain,
      applicableFrameworks: parsed.applicableFrameworks || DOMAIN_POLICIES[domain].compliance,
      summary:              parsed.summary              || 'AI analysis complete.',
      missingRequirements:  parsed.missingRequirements  || [],
      securityChecklist:    parsed.securityChecklist    || [],
      positiveFindings:     parsed.positiveFindings     || [],
      aiPowered:            true,
    };
  } catch (err) {
    console.error('[aiAnalysisService] Requirements analysis failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: THREAT MODEL ANALYSIS
// ═══════════════════════════════════════════════════════════════

const THREAT_MODEL_BASE_PROMPT = `You are a senior security architect performing threat modeling. Apply the domain's compliance frameworks and mandatory controls (defined in POLICY CONTEXT below) to identify threats specific to this regulated environment.

APPROACH:
1. Understand the system architecture and what data it handles.
2. Map the attack surface: entry points, trust boundaries, privilege transitions.
3. For each component, reason about realistic threats from an attacker's perspective.
4. Ground each threat in the domain's policy — note when a threat exists because a mandatory control is absent.

USE STRIDE + domain-specific threat patterns:
- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
- Supply chain, operational, business logic, and lateral movement threats

SEVERITY:
- Critical: high impact, low barrier, direct path to breach or regulatory violation
- High: significant impact, realistic attack
- Medium: conditional or moderate impact
- Low: low likelihood or limited blast radius

CRITICAL OUTPUT RULES:
- Return ONLY raw JSON. No markdown fences. No preamble. No explanation after the JSON.
- The response must start with { and end with }
- Do not truncate arrays — complete every array before closing

Return this exact JSON structure:

{
  "threats": [
    {
      "id": "T001",
      "component": "Exact component name",
      "componentType": "API | Database | Client | Server | Queue | Cache | Gateway | Storage | External",
      "category": "Spoofing | Tampering | Repudiation | Information Disclosure | Denial of Service | Elevation of Privilege",
      "severity": "Critical | High | Medium | Low",
      "description": "Concrete threat: who attacks, how, what they access or do, what the impact is",
      "mitigation": "Specific mitigation for this component in this domain",
      "policy": "The mandatory control or compliance requirement this threat violates",
      "status": "open"
    }
  ],
  "riskScore": 0,
  "criticalCount": 0,
  "highCount": 0,
  "totalThreats": 0,
  "mitigatedControls": 0,
  "domain": "detected domain label",
  "applicableFrameworks": ["compliance frameworks applied"],
  "summary": "3-4 sentences: system architecture, threat landscape, most critical domain-specific exposures",
  "components": [{"name": "component name", "type": "type"}],
  "securityControlsDetected": {
    "authentication": true,
    "authorization": true,
    "encryption": true,
    "inputValidation": true,
    "logging": true,
    "rateLimit": true,
    "networkSegmentation": true,
    "secretsManagement": true
  },
  "attackSurface": ["Identified trust boundary or external entry point"],
  "policyViolations": ["Mandatory control that is absent from this architecture"]
}`;

async function analyzeThreatModelWithAI(components, designText) {
  try {
    const textForDetection = `${designText || ''} ${components.map(c => c.name).join(' ')}`;
    const domain = detectDomain(textForDetection);
    const policyContext = buildPolicyContext(domain);
    const systemPrompt = `${THREAT_MODEL_BASE_PROMPT}\n\n---\nPOLICY CONTEXT:\n${policyContext}`;

    const componentList = components.map(c => `- ${c.name} (${c.type})`).join('\n');
    const prompt = `Perform threat modeling on this system. Think like an attacker — what can be exploited, abused, or bypassed? Apply all mandatory controls from the policy context.

Components:
${componentList}

Architecture / Design Document:
${designText || '(No design document — analyze from components only)'}

IMPORTANT: Return ONLY raw JSON starting with { — no markdown, no preamble.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,  // ✅ FIXED: was 4000
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[aiAnalysisService] Threat model raw response length:', raw.length, '| stop_reason:', response.stop_reason);

    const parsed = safeParseJSON(raw);

    return {
      threats:                  parsed.threats                  || [],
      riskScore:                parsed.riskScore                ?? 50,
      criticalCount:            parsed.criticalCount            ?? 0,
      highCount:                parsed.highCount                ?? 0,
      totalThreats:             parsed.threats?.length          ?? 0,
      mitigatedControls:        parsed.mitigatedControls        ?? 0,
      domain:                   parsed.domain                   || domain,
      applicableFrameworks:     parsed.applicableFrameworks     || DOMAIN_POLICIES[domain].compliance,
      summary:                  parsed.summary                  || 'AI threat analysis complete.',
      components:               parsed.components               || components,
      securityControlsDetected: parsed.securityControlsDetected || {},
      attackSurface:            parsed.attackSurface            || [],
      policyViolations:         parsed.policyViolations         || [],
      aiPowered:                true,
    };
  } catch (err) {
    console.error('[aiAnalysisService] Threat model analysis failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: CODE REVIEW ANALYSIS
// ═══════════════════════════════════════════════════════════════

const CODE_REVIEW_BASE_PROMPT = `You are a senior application security engineer performing a code security review. Apply the domain's compliance frameworks and mandatory controls (defined in POLICY CONTEXT below) — many code-level vulnerabilities are direct violations of domain policy.

You can review code in any language or format: JavaScript, TypeScript, Python, Java, Go, PHP, Ruby, C#, C/C++, Rust, shell scripts, SQL, Terraform, Dockerfile, Kubernetes YAML, or anything else.

APPROACH:
1. Identify the language, framework, and what the code does.
2. Find every point where untrusted data enters the system.
3. Trace each input — is it validated, sanitized, escaped, or used raw in a dangerous context?
4. Look for code patterns that violate the domain's mandatory controls.
5. Flag secrets, insecure configurations, and missing security middleware.

VULNERABILITY CLASSES (apply what's relevant):
- Injection: SQL, NoSQL, LDAP, OS command, template, XPath, XXE
- Output: XSS (reflected/stored/DOM), HTML injection, open redirect
- Auth: hardcoded credentials, weak algorithms, missing auth checks, broken sessions
- AuthZ: missing access control, IDOR, privilege escalation, path traversal
- Crypto: MD5/SHA1/DES, hardcoded keys, insecure RNG, missing encryption
- Secrets: API keys, tokens, passwords, connection strings as literals in code
- Exposure: sensitive data in logs, full error stacks to client, verbose errors
- Deserialization: unsafe deserialization, prototype pollution, pickle, etc.
- Resources: unbounded input DoS, missing rate limits, ReDoS, memory issues
- Business logic: client-trusted values, race conditions, workflow bypass
- Infrastructure: insecure defaults, overly permissive IAM, open ports

SEVERITY:
- critical: RCE, full data breach, account takeover, or direct regulatory violation
- high: auth bypass, SQLi, IDOR, stored XSS, stored card data
- medium: exploitable under conditions, PII exposure risk, meaningful policy gap
- low: best-practice violation, minor info leakage, hardening gap

CRITICAL OUTPUT RULES:
- Return ONLY raw JSON. No markdown fences. No preamble. No explanation after the JSON.
- The response must start with { and end with }
- Do not truncate arrays — complete every array before closing

RULES:
- Variable destructuring (const { password } = req.body) is NOT a hardcoded secret.
- Do not flag the same line twice for the same CWE.
- Each finding must be a distinct vulnerability.
- "code" must be copied exactly from the source — never paraphrased.
- Severity must match real-world exploitability and domain impact.
- If an area is genuinely safe, say so — do not manufacture findings.

Return this exact JSON structure:

{
  "vulnerabilities": [
    {
      "id": "vuln-001",
      "line": 0,
      "code": "Exact vulnerable line or minimal block from the source",
      "severity": "critical | high | medium | low",
      "type": "Human-readable vulnerability class name",
      "description": "What makes this vulnerable and what an attacker can concretely do",
      "fix": "Specific, language-appropriate fix",
      "cwe": "CWE-XXX",
      "policy": "The mandatory control or compliance requirement this code violates"
    }
  ],
  "summary": "3-4 sentences: what the code does, its security posture, domain policy compliance, most critical issues",
  "overallRisk": "critical | high | medium | low | safe",
  "domain": "detected domain label",
  "applicableFrameworks": ["compliance frameworks applied"],
  "policyViolations": ["Mandatory control violated by this code, with specific reference"],
  "recommendations": ["Prioritized, actionable recommendation for the developer"],
  "codeQuality": {
    "score": 0,
    "issues": ["Non-security quality issues that increase attack surface"]
  }
}`;

async function analyzeCodeWithAI(sourceCode, language) {
  try {
    const domain = detectDomain(sourceCode);
    const policyContext = buildPolicyContext(domain);
    const systemPrompt = `${CODE_REVIEW_BASE_PROMPT}\n\n---\nPOLICY CONTEXT:\n${policyContext}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,  // ✅ FIXED: was 4000
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Review this ${language} code for security vulnerabilities. Apply all mandatory controls from the policy context — flag violations at the code level.\n\nIMPORTANT: Return ONLY raw JSON starting with { — no markdown, no preamble.\n\n\`\`\`${language}\n${sourceCode}\n\`\`\``,
        },
      ],
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[aiAnalysisService] Code review raw response length:', raw.length, '| stop_reason:', response.stop_reason);

    const parsed = safeParseJSON(raw);

    return {
      vulnerabilities:      parsed.vulnerabilities      || [],
      summary:              parsed.summary              || 'AI code review complete.',
      overallRisk:          parsed.overallRisk          || 'low',
      domain:               parsed.domain               || domain,
      applicableFrameworks: parsed.applicableFrameworks || DOMAIN_POLICIES[domain].compliance,
      policyViolations:     parsed.policyViolations     || [],
      recommendations:      parsed.recommendations      || [],
      codeQuality:          parsed.codeQuality          || { score: 80, issues: [] },
      aiPowered:            true,
    };
  } catch (err) {
    console.error('[aiAnalysisService] Code review analysis failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: CROSS-PHASE CONSISTENCY MAPPING
// ═══════════════════════════════════════════════════════════════

const PHASE_MAPPING_PROMPT = `You are a senior security architect performing a cross-phase consistency audit for a software project. You will receive analysis results from up to 3 phases: Requirements, Design/Threat Modeling, and Code Review.

Your job is to cross-reference these phases and identify:
1. CONSISTENT items — security controls defined in requirements AND implemented in design AND reflected in code
2. WARNINGS — security requirements defined but missing or partially implemented in later phases
3. CONFLICTS — design or code directly contradicts or violates a stated requirement
4. COMPLIANCE DRIFT — compliance frameworks stated in requirements (HIPAA, PCI-DSS, GDPR, SOC2, OWASP, ISO27001) that are violated by findings in design or code phases

COMPLIANCE DRIFT RULES (highest priority):
- If requirements state HIPAA compliance but code has unencrypted storage or missing audit logs → CONFLICT with severity "critical"
- If requirements state PCI-DSS but code stores raw card data or uses weak crypto → CONFLICT with severity "critical"
- If requirements state GDPR but design has no data minimization or consent mechanism → WARNING with severity "high"
- If requirements state OWASP Top 10 coverage but code review finds SQLi, XSS, or hardcoded secrets → CONFLICT
- Always extract compliance frameworks from the requirements phase and check each one against design and code findings

AUDIT RULES:
- If a requirement mandates authentication and the threat model shows auth bypass threats were not mitigated → WARNING
- If requirements say "encrypt all data" and code review finds unencrypted storage → CONFLICT
- If all phases mention input validation and code implements it properly → CONSISTENT
- If a requirement exists but design phase was not run → WARNING (gap in coverage)
- If code introduces a vulnerability not covered by any requirement or threat → CONFLICT

Return ONLY raw JSON in this exact structure:
{
  "summary": "2-3 sentence executive summary of overall cross-phase consistency",
  "overallScore": 0-100,
  "complianceDrift": [
    {
      "id": "CD-001",
      "framework": "HIPAA | PCI-DSS | GDPR | OWASP | SOC2 | ISO27001",
      "requirement": "What the compliance framework requires",
      "violation": "What was found in design or code that violates it",
      "foundIn": "design | code",
      "severity": "critical | high | medium"
    }
  ],
  "consistent": [
    {
      "id": "C-001",
      "control": "Name of the security control",
      "description": "How this is consistently covered across phases",
      "phases": ["requirement", "design", "code"],
      "confidence": "high | medium | low"
    }
  ],
  "warnings": [
    {
      "id": "W-001",
      "control": "Name of the gap",
      "requirement": "What was required",
      "gap": "What is missing or incomplete",
      "missingIn": ["design", "code"],
      "severity": "high | medium | low",
      "recommendation": "How to close this gap"
    }
  ],
  "conflicts": [
    {
      "id": "X-001",
      "control": "Name of the conflict",
      "requirement": "What was stated in requirements",
      "violation": "What design or code does that contradicts it",
      "conflictBetween": ["requirement", "code"],
      "severity": "critical | high | medium",
      "recommendation": "How to resolve this conflict"
    }
  ],
  "phasesCovered": ["requirement", "design", "code"],
  "phasesGap": ["design"],
  "topActions": ["Prioritized action 1", "Prioritized action 2", "Prioritized action 3"]
}`;

async function analyzePhaseMappingWithAI({ requirementResult, threatResult, codeResult, pipelineResult, requirementsText }) {
  try {
    const phasesProvided = [];
    const phasesSummary = [];

    if (requirementResult) {
      phasesProvided.push('requirement');
      phasesSummary.push(`
PHASE 1 — REQUIREMENTS ANALYSIS:
Security Score: ${requirementResult.securityScore ?? requirementResult.riskScore ?? 'N/A'}/100
Risk Score: ${requirementResult.riskScore ?? 'N/A'}/100
Controls Present: ${(requirementResult.securityChecklist ?? []).filter(c => c.startsWith('✅')).join(', ') || 'N/A'}
Missing Requirements: ${(requirementResult.missingRequirements ?? []).join(', ') || 'None'}
Key Findings: ${(requirementResult.findings ?? []).slice(0, 5).map(f => `[${f.severity}] ${f.issue}`).join('; ') || 'None'}
Compliance: ${(requirementResult.compliance ?? requirementResult.applicableFrameworks ?? []).join(', ') || 'N/A'}
`);
    }

    if (threatResult) {
      phasesProvided.push('design');
      phasesSummary.push(`
PHASE 2 — DESIGN / THREAT MODELING:
Risk Score: ${threatResult.riskScore ?? 'N/A'}/100
Total Threats: ${threatResult.threats?.length ?? 0}
Critical Threats: ${threatResult.criticalCount ?? threatResult.threats?.filter(t => t.severity === 'Critical').length ?? 0}
Top Threats: ${(threatResult.threats ?? []).slice(0, 5).map(t => `[${t.severity}] ${t.title ?? t.category}: ${t.description?.slice(0, 80)}`).join('; ') || 'None'}
Mitigated Controls: ${threatResult.mitigatedControls ?? 'N/A'}
Policy Violations: ${(threatResult.policyViolations ?? []).join(', ') || 'None'}
Attack Surface: ${(threatResult.attackSurface ?? []).join(', ') || 'N/A'}
`);
    }

    if (codeResult) {
      phasesProvided.push('code');
      phasesSummary.push(`
PHASE 3 — CODE REVIEW:
Overall Risk: ${codeResult.overallRisk ?? 'N/A'}
Total Vulnerabilities: ${codeResult.vulnerabilities?.length ?? codeResult.summary?.total ?? 0}
Critical: ${codeResult.vulnerabilities?.filter(v => v.severity === 'critical' || v.severity === 'Critical').length ?? codeResult.summary?.critical ?? 0}
High: ${codeResult.vulnerabilities?.filter(v => v.severity === 'high' || v.severity === 'High').length ?? codeResult.summary?.high ?? 0}
Top Vulnerabilities: ${(codeResult.vulnerabilities ?? []).slice(0, 5).map(v => `[${v.severity}] ${v.type ?? v.name}: ${v.description?.slice(0, 80)}`).join('; ') || 'None'}
Policy Violations: ${(codeResult.policyViolations ?? []).join(', ') || 'None'}
Recommendations: ${(codeResult.recommendations ?? []).slice(0, 3).join('; ') || 'N/A'}
`);
    }

    if (pipelineResult) {
      phasesProvided.push('pipeline');
      phasesSummary.push(`
PIPELINE SECURITY FINDINGS:
Risk Level: ${pipelineResult.riskLevel || 'Unknown'}
Total Findings: ${pipelineResult.totalFindings || 0}
Critical: ${pipelineResult.critical || 0}, High: ${pipelineResult.high || 0}, Medium: ${pipelineResult.medium || 0}
${pipelineResult.findings ? pipelineResult.findings.slice(0, 10).map(f => `- [${f.severity}] ${f.rule}: ${f.description} (line ${f.line})`).join('\n') : 'No specific findings provided'}
`);
    }

    // Add raw requirements text for richer AI context
    if (requirementsText && requirementsText.trim()) {
      phasesSummary.push(`
RAW REQUIREMENTS DOCUMENT (first 2000 chars):
${requirementsText.slice(0, 2000)}
`);
    }

    if (phasesProvided.length === 0) {
      throw new Error('No phase results provided for mapping');
    }

    const prompt = `Perform a cross-phase security consistency audit for this project.

Phases provided: ${phasesProvided.join(', ')}
Phases NOT run: ${['requirement', 'design', 'code', 'pipeline'].filter(p => !phasesProvided.includes(p)).join(', ') || 'None'}

${phasesSummary.join('\n---\n')}

Cross-reference all phases. Find what is consistent, what is missing (warnings), and what contradicts (conflicts).

IMPORTANT: Return ONLY raw JSON starting with { — no markdown, no preamble.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PHASE_MAPPING_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[aiAnalysisService] Phase mapping raw response length:', raw.length, '| stop_reason:', response.stop_reason);

    const parsed = safeParseJSON(raw);

    return {
      summary:        parsed.summary        || 'Phase mapping analysis complete.',
      overallScore:   parsed.overallScore   ?? 50,
      complianceDrift: parsed.complianceDrift || [],
      consistent:     parsed.consistent     || [],
      warnings:       parsed.warnings       || [],
      conflicts:      parsed.conflicts      || [],
      phasesCovered:  parsed.phasesCovered  || phasesProvided,
      phasesGap:      parsed.phasesGap      || [],
      topActions:     parsed.topActions     || [],
      aiPowered:      true,
    };
  } catch (err) {
    console.error('[aiAnalysisService] Phase mapping failed:', err.message);
    return null;
  }
}

module.exports = {
  analyzeRequirementsWithAI,
  analyzeThreatModelWithAI,
  analyzeCodeWithAI,
  analyzePhaseMappingWithAI,
  detectDomain,
  DOMAIN_POLICIES,
};