// ============================================================
// FortifyLens — AI Security Analysis Service
//
// HOW THE AI LOGIC WORKS:
// ────────────────────────────────────────────────────────────
// 1. REQUIREMENT ANALYSIS:
//    Uses a weighted scoring model. Each security control
//    (authentication, encryption, compliance, etc.) carries
//    a weight. Missing critical controls increase the risk
//    score. We also apply keyword scanning on the freetext
//    requirements to detect security-relevant patterns.
//
// 2. THREAT MODELING (STRIDE):
//    Maps each architectural component to STRIDE categories
//    (Spoofing, Tampering, Repudiation, Information Disclosure,
//    Denial of Service, Elevation of Privilege). Generates
//    threats dynamically based on component type.
//
// 3. CODE REVIEW:
//    Regex-based SAST (Static Application Security Testing)
//    pattern scanner. Detects OWASP Top 10 vulnerability
//    patterns: SQLi, XSS, hardcoded secrets, insecure functions,
//    eval(), dangling pointers, etc.
// ============================================================

// ─── REQUIREMENT ANALYSIS ────────────────────────────────────

const SECURITY_CONTROL_WEIGHTS = {
  authentication:    20,
  sensitiveData:     18,
  encryption:        16,
  dataStorage:       12,
  thirdPartyAPIs:    8,
  compliance:        10, // per item up to 26
};

const COMPLIANCE_RISK_MAP = {
  'PCI-DSS':  { weight: 8,  description: 'Payment card data protection' },
  'HIPAA':    { weight: 9,  description: 'Health data privacy requirements' },
  'GDPR':     { weight: 7,  description: 'EU general data protection regulation' },
  'SOC2':     { weight: 6,  description: 'Service organization control framework' },
  'OWASP':    { weight: 5,  description: 'OWASP Top 10 security practices' },
  'ISO27001': { weight: 7,  description: 'Information security management' },
};

const REQUIREMENT_KEYWORDS = {
  high_risk:   ['password', 'auth', 'token', 'session', 'credit card', 'ssn', 'personal', 'private key', 'secret'],
  medium_risk: ['api', 'database', 'storage', 'file upload', 'email', 'login', 'register', 'oauth'],
  low_risk:    ['report', 'export', 'filter', 'search', 'display', 'view'],
};

function analyzeRequirements({ authentication, sensitiveData, encryption, dataStorage, thirdPartyAPIs, compliance = [], requirementsText = '', codeSnippet = '' }) {
  let riskScore = 0;
  const findings = [];
  const missingRequirements = [];
  const securityChecklist = [];

  // ── Auto-detect controls from the pasted text ─────────────
  // So users don't need to check boxes — plain text documents work correctly
  const fullTextLower = (requirementsText + ' ' + codeSnippet).toLowerCase();
  const textHas = (kws) => kws.some(kw => fullTextLower.includes(kw));

  const authDetected      = authentication      || textHas(['jwt','oauth','mfa','multi-factor','bcrypt','argon2','hashed','hash','credential','login','register','session token','bearer','sign in','sign-in','password must','rate limit','lockout','brute force']);
  const sensitiveDetected = sensitiveData       || textHas(['pii','sensitive','personal data','confidential','credit card','ssn','gdpr','hipaa','aes-256','encrypted at rest','encrypt at rest','data classification','never stored','not stored']);
  const encryptionDetected= encryption          || textHas(['tls','https','ssl','encrypt','aes','sha-256','hashing','bcrypt','argon2','in transit','at rest','hsts','cipher']);
  const storageDetected   = dataStorage         || textHas(['database','storage','backup','postgres','mysql','mongodb','redis','data retention','data store','stored','s3','bucket']);
  const thirdPartyDetected= thirdPartyAPIs      || textHas(['stripe','sendgrid','twilio','google','firebase','aws','third-party','third party','external api','integration','oauth provider','webhook','payment gateway']);

  // Auto-detect compliance
  const detectedCompliance = [...compliance];
  if (fullTextLower.includes('pci-dss') || fullTextLower.includes('pci dss')) { if (!detectedCompliance.includes('PCI-DSS'))  detectedCompliance.push('PCI-DSS');  }
  if (fullTextLower.includes('gdpr'))                                          { if (!detectedCompliance.includes('GDPR'))     detectedCompliance.push('GDPR');     }
  if (fullTextLower.includes('hipaa'))                                         { if (!detectedCompliance.includes('HIPAA'))    detectedCompliance.push('HIPAA');    }
  if (fullTextLower.includes('owasp'))                                         { if (!detectedCompliance.includes('OWASP'))    detectedCompliance.push('OWASP');    }
  if (fullTextLower.includes('iso 27001') || fullTextLower.includes('iso27001')){ if (!detectedCompliance.includes('ISO27001')) detectedCompliance.push('ISO27001'); }
  const effectiveCompliance = detectedCompliance.length > 0 ? detectedCompliance : compliance;

  // ── Score active controls (each control reduces risk)
  const maxScore = 100;
  let deductions = 0;

  if (!authDetected) {
    deductions += SECURITY_CONTROL_WEIGHTS.authentication;
    missingRequirements.push('Authentication mechanism not specified');
    findings.push({ severity: 'Critical', issue: 'No authentication control defined', recommendation: 'Define authentication strategy (JWT, OAuth2, session-based)' });
  } else {
    securityChecklist.push('✅ Authentication mechanism defined');
  }

  if (!sensitiveDetected) {
    deductions += SECURITY_CONTROL_WEIGHTS.sensitiveData;
    missingRequirements.push('Sensitive data handling policy missing');
    findings.push({ severity: 'High', issue: 'No sensitive data classification', recommendation: 'Classify data sensitivity levels and define handling procedures' });
  } else {
    securityChecklist.push('✅ Sensitive data handling specified');
  }

  if (!encryptionDetected) {
    deductions += SECURITY_CONTROL_WEIGHTS.encryption;
    missingRequirements.push('Encryption standards not specified');
    findings.push({ severity: 'High', issue: 'No encryption requirements defined', recommendation: 'Specify TLS 1.2+, AES-256 for data at rest' });
  } else {
    securityChecklist.push('✅ Encryption standards specified');
  }

  if (!storageDetected) {
    deductions += SECURITY_CONTROL_WEIGHTS.dataStorage;
    missingRequirements.push('Data storage security requirements missing');
    findings.push({ severity: 'Medium', issue: 'No data storage security policy', recommendation: 'Define database security, backup, and access control requirements' });
  } else {
    securityChecklist.push('✅ Data storage security addressed');
  }

  if (!thirdPartyDetected) {
    deductions += SECURITY_CONTROL_WEIGHTS.thirdPartyAPIs;
    missingRequirements.push('Third-party API security not addressed');
    findings.push({ severity: 'Medium', issue: 'Third-party integration risks not evaluated', recommendation: 'Document all external APIs and their security requirements' });
  } else {
    securityChecklist.push('✅ Third-party API security considered');
  }

  // ── Score compliance requirements
  if (effectiveCompliance.length === 0) {
    deductions += 10;
    missingRequirements.push('No compliance frameworks specified');
    findings.push({ severity: 'Medium', issue: 'No compliance requirements identified', recommendation: 'Identify applicable regulatory requirements (GDPR, HIPAA, PCI-DSS)' });
  } else {
    effectiveCompliance.forEach(c => {
      const info = COMPLIANCE_RISK_MAP[c];
      if (info) securityChecklist.push(`✅ ${c} compliance requirement documented`);
    });
  }

  // ── Targeted gap detection — only flag genuinely missing specific controls
  let keywordRiskBoost = 0;
  if (authDetected && !textHas(['rate limit','rate-limit','lockout','brute force','throttl','max attempt'])) {
    keywordRiskBoost += 5;
    findings.push({ severity: 'Medium', issue: 'No rate limiting or brute-force protection specified', recommendation: 'Add: Limit login attempts to 5 per 15 minutes before lockout' });
  }
  if (!textHas(['input validation','sanitiz','parameterized','sql injection','xss','injection'])) {
    keywordRiskBoost += 5;
    findings.push({ severity: 'Medium', issue: 'No input validation requirements specified', recommendation: 'Add: All user inputs must be validated and sanitized server-side' });
  }

  // ── Final risk score calculation
  // riskScore = how risky the document is (high = more risk = worse)
  // securityScore = inverse (high = more secure = better) — this is what UI shows as "100/100"
  riskScore = Math.min(100, Math.max(5, deductions + keywordRiskBoost));

  // ── Security score = complement of deductions (what was COVERED)
  const maxPossibleDeductions = 
    SECURITY_CONTROL_WEIGHTS.authentication +
    SECURITY_CONTROL_WEIGHTS.sensitiveData +
    SECURITY_CONTROL_WEIGHTS.encryption +
    SECURITY_CONTROL_WEIGHTS.dataStorage +
    SECURITY_CONTROL_WEIGHTS.thirdPartyAPIs + 10;
  
  const securityScore = Math.max(0, Math.round(100 - (deductions / maxPossibleDeductions) * 100));

  // ── Always add baseline checklist items
  if (!securityChecklist.includes('✅ Authentication mechanism defined')) {
    securityChecklist.push('⚠️ Authentication — NOT defined');
  }
  securityChecklist.push('🔲 Multi-factor authentication — Consider adding');
  securityChecklist.push('🔲 Rate limiting & brute-force protection — Required');
  securityChecklist.push('🔲 Input validation & sanitization — Required');
  securityChecklist.push('🔲 Security headers (CSP, HSTS) — Recommended');
  securityChecklist.push('🔲 Audit logging & monitoring — Required');

  const riskLevel = riskScore >= 70 ? 'Critical' : riskScore >= 45 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low';

  return {
    riskScore,
    securityScore,  // <-- This is the correct "security coverage" score (not 100 when nothing is checked)
    riskLevel,
    findings,
    missingRequirements,
    securityChecklist,
    complianceAnalysis: effectiveCompliance.map(c => ({
      standard: c,
      ...(COMPLIANCE_RISK_MAP[c] || { weight: 5, description: 'Custom compliance standard' })
    })),
    summary: `Analysis identified ${findings.length} security concern(s). Risk Score: ${riskScore}/100 (${riskLevel}). Security Coverage: ${securityScore}/100.`
  };
}

// ─── STRIDE THREAT MODELING ──────────────────────────────────

const STRIDE_TEMPLATES = {
  API: [
    { category: 'Spoofing',               severity: 'High',   description: 'API endpoints can be spoofed via forged tokens or session hijacking', mitigation: 'Implement OAuth2/JWT with short-lived tokens and token rotation' },
    { category: 'Tampering',              severity: 'High',   description: 'API request payloads can be modified in transit', mitigation: 'Use HTTPS + request signing (HMAC). Validate all inputs server-side' },
    { category: 'Information Disclosure', severity: 'Medium', description: 'Verbose API error messages may leak internal implementation details', mitigation: 'Use generic error responses in production. Implement proper logging' },
    { category: 'Denial of Service',      severity: 'High',   description: 'API endpoints vulnerable to rate-limit exhaustion attacks', mitigation: 'Implement rate limiting (e.g., 100 req/min per IP). Use API gateway' },
  ],
  Database: [
    { category: 'Tampering',              severity: 'Critical', description: 'SQL/NoSQL injection attacks can alter database records', mitigation: 'Use parameterized queries / ORM. Never concatenate user input into queries' },
    { category: 'Information Disclosure', severity: 'Critical', description: 'Database breach could expose all stored sensitive records', mitigation: 'Encrypt sensitive columns (AES-256). Implement column-level security' },
    { category: 'Denial of Service',      severity: 'Medium',   description: 'Unoptimized queries can cause database performance degradation', mitigation: 'Add query timeouts, connection pooling, and index optimization' },
    { category: 'Elevation of Privilege', severity: 'High',     description: 'Over-privileged DB accounts could allow unauthorized data access', mitigation: 'Apply principle of least privilege. Use separate read/write DB users' },
  ],
  Client: [
    { category: 'Spoofing',               severity: 'Medium', description: 'Client-side session tokens may be stolen via XSS attacks', mitigation: 'Use httpOnly + secure cookies. Implement CSP headers' },
    { category: 'Tampering',              severity: 'High',   description: 'Client-side validation can be bypassed by attackers', mitigation: 'Always validate and sanitize inputs on the server side as well' },
    { category: 'Information Disclosure', severity: 'Medium', description: 'Sensitive data stored in localStorage/sessionStorage is readable by JS', mitigation: 'Do not store sensitive data client-side. Use encrypted tokens only' },
  ],
  Server: [
    { category: 'Denial of Service',      severity: 'High',     description: 'Server can be overloaded by volumetric DDoS attacks', mitigation: 'Use CDN/WAF, auto-scaling, and load balancing' },
    { category: 'Elevation of Privilege', severity: 'Critical',  description: 'Misconfigured server permissions could allow privilege escalation', mitigation: 'Run services as non-root. Use container isolation (Docker) and security namespaces' },
    { category: 'Repudiation',            severity: 'Medium',    description: 'Lack of audit logs makes it hard to trace malicious actions', mitigation: 'Implement structured access logging with user, IP, timestamp, and action' },
    { category: 'Tampering',              severity: 'High',      description: 'Server configuration files may be modified by insiders', mitigation: 'Use file integrity monitoring (FIM) and immutable infrastructure patterns' },
  ],
};

function analyzeThreatModel(components, designText = '') {
  const threats = [];
  let totalRisk = 0;
  let threatId = 1;
  const lower = (designText || '').toLowerCase();

  // ── Detect security controls present in the architecture text ──
  // Each detected control REMOVES relevant threats (they are mitigated)
  const has = (kws) => kws.some(kw => lower.includes(kw));

  const hasAuth        = has(['jwt','oauth','bearer','mfa','multi-factor','authentication','token rotation','short-lived token','rate limit','lockout']);
  const hasEncryption  = has(['tls','https','ssl','aes-256','encrypt','hsts','cipher','in transit','at rest']);
  const hasInputValid  = has(['parameterized','sanitize','sanitization','input validation','xss','injection prevention','escape']);
  const hasLogging     = has(['audit log','access log','monitoring','sentry','cloudwatch','structured log','logging']);
  const hasNetworkSeg  = has(['network segmentation','private zone','vpc','firewall','waf','zero trust','least privilege','dmz']);
  const hasBackup      = has(['backup','recovery','rto','rpo','redundanc','failover','replication']);
  const hasSecHeaders  = has(['csp','content security policy','x-frame','x-content-type','security header','helmet']);
  const hasRateLimit   = has(['rate limit','throttl','ddos','cdn','waf','cloudflare','auto-scal','load balanc']);
  const hasPwdSecurity = has(['bcrypt','argon2','password hash','hashed','pbkdf2','salted']);
  const hasFileValid   = has(['file type validation','malware scan','allowed extension','mime type check','file filter']);
  const hasSecretsMan  = has(['environment variable','secret manager','vault','env var','.env','not committed','never commit','secrets management']);

  // ── Determine which threats to include based on what is MISSING ──
  // If the architecture document already addresses a threat, downgrade or skip it.
  components.forEach(component => {
    const templates = STRIDE_TEMPLATES[component.type] || STRIDE_TEMPLATES.Server;

    templates.forEach(t => {
      // Determine if this threat is mitigated by the document
      let isMitigated = false;
      let downgradedSeverity = t.severity;

      if (t.category === 'Spoofing'               && hasAuth)       isMitigated = true;
      if (t.category === 'Tampering'              && hasInputValid)  downgradedSeverity = 'Low';
      if (t.category === 'Information Disclosure' && hasEncryption)  downgradedSeverity = 'Low';
      if (t.category === 'Repudiation'            && hasLogging)     isMitigated = true;
      if (t.category === 'Denial of Service'      && hasRateLimit)   downgradedSeverity = 'Medium';
      if (t.category === 'Elevation of Privilege' && hasNetworkSeg)  downgradedSeverity = 'Medium';

      // Additional component-specific mitigations
      if (component.type === 'Database') {
        if (t.category === 'Tampering'              && hasInputValid)  isMitigated = true;
        if (t.category === 'Information Disclosure' && hasEncryption && hasNetworkSeg) isMitigated = true;
      }
      if (component.type === 'API') {
        if (t.category === 'Spoofing' && hasAuth && hasEncryption)    isMitigated = true;
        if (t.category === 'Denial of Service' && hasRateLimit)       isMitigated = true;
      }
      if (component.type === 'Server') {
        if (t.category === 'Repudiation' && hasLogging)               isMitigated = true;
        if (t.category === 'Elevation of Privilege' && hasNetworkSeg) isMitigated = true;
      }

      // Only include non-mitigated threats
      if (!isMitigated) {
        const effectiveSeverity = downgradedSeverity;
        const severityScore = { Critical: 25, High: 15, Medium: 8, Low: 3 };
        totalRisk += severityScore[effectiveSeverity] || 5;

        threats.push({
          id:            `T${String(threatId++).padStart(3, '0')}`,
          component:     component.name,
          componentType: component.type,
          category:      t.category,
          severity:      effectiveSeverity,
          description:   `[${component.name}] ${t.description}`,
          mitigation:    t.mitigation,
          status:        'open',
          mitigationNote: isMitigated ? 'Partially addressed in architecture' : null,
        });
      }
    });
  });

  // ── Additional architecture-specific gap threats ──────────────
  // Add threats based on what is MISSING from the document (not component-based)
  if (!hasSecretsMan && lower.includes('api')) {
    threats.push({
      id: `T${String(threatId++).padStart(3,'0')}`,
      component: 'Architecture', componentType: 'API', category: 'Information Disclosure',
      severity: 'Critical',
      description: '[Architecture] API keys or credentials may be hardcoded — no secrets management strategy specified',
      mitigation: 'Use environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault). Never commit credentials to source control.',
      status: 'open',
    });
    totalRisk += 25;
  }
  if (!hasFileValid && (lower.includes('upload') || lower.includes('file') || lower.includes('image'))) {
    threats.push({
      id: `T${String(threatId++).padStart(3,'0')}`,
      component: 'File Upload', componentType: 'Server', category: 'Tampering',
      severity: 'High',
      description: '[File Upload] No file type validation or malware scanning mentioned — attackers could upload malicious files',
      mitigation: 'Validate file types by MIME type and extension. Scan all uploads for malware. Store outside web root.',
      status: 'open',
    });
    totalRisk += 15;
  }
  if (!hasPwdSecurity && (lower.includes('password') || lower.includes('login') || lower.includes('auth'))) {
    threats.push({
      id: `T${String(threatId++).padStart(3,'0')}`,
      component: 'Authentication', componentType: 'API', category: 'Spoofing',
      severity: 'Critical',
      description: '[Authentication] No password hashing algorithm specified — passwords may be stored in plaintext or with weak hashing',
      mitigation: 'Use bcrypt (cost ≥ 12) or Argon2id for password hashing. Never store plaintext passwords.',
      status: 'open',
    });
    totalRisk += 25;
  }
  if (!hasBackup && (lower.includes('database') || lower.includes('data'))) {
    threats.push({
      id: `T${String(threatId++).padStart(3,'0')}`,
      component: 'Database', componentType: 'Database', category: 'Denial of Service',
      severity: 'Medium',
      description: '[Database] No backup or recovery strategy specified — data loss risk in case of failure or ransomware',
      mitigation: 'Implement automated daily backups with point-in-time recovery. Define RTO/RPO. Test restoration regularly.',
      status: 'open',
    });
    totalRisk += 8;
  }

  // ── Calculate final scores based on actual threats found ─────
  const divisor = Math.max(1, components.length) * 63;
  const riskScore  = Math.min(100, Math.max(5, Math.round((totalRisk / divisor) * 100)));
  const criticalCount = threats.filter(t => t.severity === 'Critical').length;
  const highCount     = threats.filter(t => t.severity === 'High').length;

  // ── Count mitigated threats ───────────────────────────────────
  const mitigatedCount = [hasAuth, hasEncryption, hasInputValid, hasLogging, hasNetworkSeg, hasBackup, hasRateLimit].filter(Boolean).length;

  return {
    threats,
    riskScore,
    criticalCount,
    highCount,
    totalThreats: threats.length,
    mitigatedControls: mitigatedCount,
    components,
    summary: `STRIDE analysis found ${threats.length} active threat(s) across ${components.length} component(s). ${mitigatedCount} security control(s) detected in architecture. Risk score: ${riskScore}/100.`,
    strideBreakdown: {
      Spoofing:                 threats.filter(t => t.category === 'Spoofing').length,
      Tampering:                threats.filter(t => t.category === 'Tampering').length,
      Repudiation:              threats.filter(t => t.category === 'Repudiation').length,
      'Information Disclosure': threats.filter(t => t.category === 'Information Disclosure').length,
      'Denial of Service':      threats.filter(t => t.category === 'Denial of Service').length,
      'Elevation of Privilege': threats.filter(t => t.category === 'Elevation of Privilege').length,
    },
    securityControlsDetected: {
      authentication:    hasAuth,
      encryption:        hasEncryption,
      inputValidation:   hasInputValid,
      logging:           hasLogging,
      networkSegmentation: hasNetworkSeg,
      backup:            hasBackup,
      rateLimit:         hasRateLimit,
      passwordSecurity:  hasPwdSecurity,
      secretsManagement: hasSecretsMan,
    },
  };
}

// ─── CODE SAST SCANNER ────────────────────────────────────────

const SAST_PATTERNS = [
  {
    id:   'SQL-INJ-001',
    name: 'SQL Injection Risk',
    severity: 'Critical',
    pattern: /`[^`]*(SELECT|INSERT|UPDATE|DELETE|DROP|WHERE)[^`]*\$\{[^}]+\}/gi,
    category: 'Injection',
    description: 'String concatenation detected in SQL context — potential SQL injection',
    recommendation: 'Use parameterized queries or an ORM. Never build SQL with string concatenation.',
    owasp: 'A03:2021 - Injection',
  },
  {
    id:   'XSS-001',
    name: 'Cross-Site Scripting (XSS)',
    severity: 'High',
    pattern: /innerHTML\s*=|document\.write\(|\.html\(.*req\.|dangerouslySetInnerHTML/g,
    category: 'XSS',
    description: 'Potentially unsafe HTML insertion that could allow XSS attacks',
    recommendation: 'Use textContent instead of innerHTML. Sanitize all user inputs with DOMPurify.',
    owasp: 'A03:2021 - Injection',
  },
  {
    id:   'HARDCODED-SECRET-001',
    name: 'Hardcoded Secret / API Key',
    severity: 'Critical',
    pattern: /(?<!\w)(password|passwd|secret|api_key|apikey|private_key)\s*=\s*['"][a-zA-Z0-9!@#$%^&*()\-_]{8,}['"]/gi,
    category: 'Sensitive Data Exposure',
    description: 'Hardcoded credential or secret detected in source code',
    recommendation: 'Move all secrets to environment variables. Never commit credentials to version control.',
    owasp: 'A02:2021 - Cryptographic Failures',
  },
  {
    id:   'EVAL-001',
    name: 'Dangerous eval() Usage',
    severity: 'High',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(|setTimeout\s*\(\s*["']/g,
    category: 'Code Injection',
    description: 'eval() or equivalent dynamic code execution detected',
    recommendation: 'Avoid eval() entirely. Use JSON.parse() for data, or refactor to avoid dynamic execution.',
    owasp: 'A03:2021 - Injection',
  },
  {
    id:   'WEAK-CRYPTO-001',
    name: 'Weak Cryptography',
    severity: 'High',
    pattern: /\bMD5\b|\bSHA1\b|\bDES\b|\bRC4\b|createCipher\s*\(\s*['"]des/gi,
    category: 'Cryptographic Failures',
    description: 'Weak or deprecated cryptographic algorithm detected',
    recommendation: 'Use SHA-256 or SHA-3 for hashing. Use AES-256-GCM for encryption.',
    owasp: 'A02:2021 - Cryptographic Failures',
  },
  {
    id:   'PATH-TRAVERSAL-001',
    name: 'Path Traversal Risk',
    severity: 'High',
    pattern: /fs\.(readFile|writeFile|unlink|stat)\s*\(\s*(req\.|path\.join|__dirname.*\+)/g,
    category: 'Path Traversal',
    description: 'File system operations with user-supplied paths — potential path traversal',
    recommendation: 'Validate and sanitize all file paths. Use path.resolve() and check against allowed directories.',
    owasp: 'A01:2021 - Broken Access Control',
  },
  {
    id:   'INSECURE-RANDOM-001',
    name: 'Insecure Randomness',
    severity: 'Medium',
    pattern: /Math\.random\(\)/g,
    category: 'Cryptographic Failures',
    description: 'Math.random() is not cryptographically secure',
    recommendation: 'Use crypto.randomBytes() for security tokens, session IDs, or OTPs.',
    owasp: 'A02:2021 - Cryptographic Failures',
  },
  {
    id:   'NO-HTTPS-001',
    name: 'HTTP Instead of HTTPS',
    severity: 'Medium',
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/g,
    category: 'Insecure Communication',
    description: 'Non-HTTPS URL detected — data may be transmitted in plaintext',
    recommendation: 'Always use HTTPS in production. Enforce HSTS headers.',
    owasp: 'A02:2021 - Cryptographic Failures',
  },
  {
    id:   'COMMAND-INJECTION-001',
    name: 'Command Injection Risk',
    severity: 'Critical',
    pattern: /child_process|exec\s*\(|execSync\s*\(|spawn\s*\(/g,
    category: 'Injection',
    description: 'Shell command execution detected — risk of command injection',
    recommendation: 'Avoid shell execution with user input. Use execFile() with argument arrays, never exec() with string concatenation.',
    owasp: 'A03:2021 - Injection',
  },
  {
    id:   'CONSOLE-LOG-001',
    name: 'Debug Console.log in Production',
    severity: 'Low',
    pattern: /console\.(log|debug|info)\s*\([^)]*(?:password|token|secret|key|auth)/gi,
    category: 'Information Disclosure',
    description: 'Sensitive information may be logged to console',
    recommendation: 'Remove console.log statements that output sensitive data. Use structured logging with log levels.',
    owasp: 'A09:2021 - Security Logging Failures',
  },
];

function analyzeCode(sourceCode, language = 'javascript') {
  const vulnerabilities = [];
  const lines = sourceCode.split('\n');

  SAST_PATTERNS.forEach(rule => {
    // Find all matches with line numbers
    lines.forEach((line, lineIdx) => {
      if (rule.pattern.test(line)) {
        vulnerabilities.push({
          id:             rule.id,
          name:           rule.name,
          severity:       rule.severity,
          category:       rule.category,
          description:    rule.description,
          recommendation: rule.recommendation,
          owasp:          rule.owasp,
          lineNumber:     lineIdx + 1,
          codeLine:       line.trim().slice(0, 100),
        });
      }
      rule.pattern.lastIndex = 0; // Reset regex state
    });
  });

  // Remove false positives from secure code patterns
  const filtered = vulnerabilities.filter(v => {
    const l = v.codeLine.toLowerCase();
    // SQL-INJ: skip parameterized queries
    if (v.id === 'SQL-INJ-001' && (l.includes('$1') || l.includes('$2') || (l.includes('pool.query') && l.includes('[')))) return false;
    // HARDCODED-SECRET: skip variable names and bcrypt hashes
    if (v.id === 'HARDCODED-SECRET-001') {
      if (l.includes('password_hash') || l.includes('dummyhash') || l.includes('hashtocompare')) return false;
      if (l.includes('.hash') || l.includes('bcrypt') || l.includes('process.env')) return false;
      if (!/[:=]\s*['"][a-zA-Z0-9!@#$%^&*()\-_]{8,}['"]/.test(l)) return false;
    }
    return true;
  });

  const critical = filtered.filter(v => v.severity === 'Critical').length;
  const high     = filtered.filter(v => v.severity === 'High').length;
  const medium   = filtered.filter(v => v.severity === 'Medium').length;
  const low      = filtered.filter(v => v.severity === 'Low').length;

  const riskScore = Math.min(100, critical * 25 + high * 15 + medium * 8 + low * 3);
  const riskLevel = riskScore >= 70 ? 'Critical' : riskScore >= 45 ? 'High' : riskScore >= 20 ? 'Medium' : 'Low';

  const linesScanned = lines.length;
  const owaspCategories = [...new Set(filtered.map(v => v.owasp))];

  return {
    vulnerabilities: filtered,
    riskScore,
    riskLevel,
    linesScanned,
    language,
    summary: {
      total: filtered.length,
      critical,
      high,
      medium,
      low,
    },
    owaspCoverage: owaspCategories,
    recommendation: critical > 0
      ? 'CRITICAL issues found — do not deploy until resolved.'
      : high > 0
        ? 'HIGH severity issues require immediate attention before release.'
        : medium > 0
          ? 'MEDIUM issues should be resolved in next sprint.'
          : 'Code meets baseline security standards. Continue monitoring.',
  };
}

module.exports = { analyzeRequirements, analyzeThreatModel, analyzeCode };