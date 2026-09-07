#!/usr/bin/env node
// FortifyLens CLI — minimal single-file scanner.
// Env: FORTIFYLENS_API_KEY, FORTIFYLENS_SERVER_URL. Args: file paths.
const fs = require('fs');
const path = require('path');

const KEY = process.env.FORTIFYLENS_API_KEY;
const SERVER = process.env.FORTIFYLENS_SERVER_URL;
const { execSync } = require('child_process');
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const commitSha = process.env.GITHUB_SHA || git('rev-parse HEAD');
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('branch --show-current');
const DEP_FILES = ['package.json', 'requirements.txt', 'pom.xml', 'go.mod'];
const LANG = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java', go: 'go' };

function fail(msg, code = 2) {
  process.stderr.write(`fortifylens: ${msg}\n`);
  process.exit(code);
}

if (!KEY || !SERVER) fail('FORTIFYLENS_API_KEY and FORTIFYLENS_SERVER_URL must be set');

const files = process.argv.slice(2);
if (files.length === 0) fail('usage: fortifylens <file...>', 2);

const base = SERVER.replace(/\/+$/, '');

async function post(endpoint, body) {
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) fail(`HTTP ${res.status} from ${endpoint}`);
  return res.json();
}

// Normalize both SAST and AI response shapes to { severity, rule, file, line, message }.
function norm(v, file) {
  const raw = String(v.description || v.summary || v.fix || v.recommendation || '');
  return {
    severity: String(v.severity || 'unknown').toLowerCase(),
    rule: v.name || v.type || v.id || v.package || 'finding',
    file,
    line: v.lineNumber ?? v.line ?? '',
    message: raw.length > 60 ? `${raw.slice(0, 57)}...` : raw,
  };
}

(async () => {
  const findings = [];
  for (const f of files) {
    const filename = path.basename(f);
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch (e) {
      fail(`cannot read ${f}: ${e.message}`);
    }
    if (DEP_FILES.includes(filename)) {
      const data = await post('/api/analysis/dependencies', { content, filename, commitSha, branch });
      (data.vulnerabilities || []).forEach((v) => findings.push(norm(v, filename)));
    } else {
      const ext = filename.split('.').pop().toLowerCase();
      const language = LANG[ext] || 'javascript';
      const data = await post('/api/analysis/code', { sourceCode: content, language, commitSha, branch });
      ((data.analysis && data.analysis.vulnerabilities) || []).forEach((v) => findings.push(norm(v, filename)));
    }
  }

  if (findings.length === 0) {
    console.log('No findings.');
    process.exitCode = 0;
    return;
  }
  console.table(findings);
  const counts = findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
  console.log(`Summary: ${Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(', ')}`);
  process.exitCode = findings.some((f) => f.severity === 'critical' || f.severity === 'high') ? 1 : 0;
})().catch((e) => fail(e.message));
