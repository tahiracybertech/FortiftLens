// Temporary smoke test for pipelineSecurityService — deleted after run.
const { analyzePipelineConfig } = require('./src/services/pipelineSecurityService');

const workflow = [
  'name: CI',
  'on:',
  '  pull_request_target:',
  '    branches: [main]',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@main',
  '        with:',
  '          ref: ${{ github.event.pull_request.head.ref }}',
  '      - run: docker run --privileged -e API_KEY="sk_live_abcdef123456" myapp',
  '      # uses: actions/checkout@master   <- comment, must be skipped',
  '        env:',
  '          PASSWORD: "${{ secrets.DB_PASS }}"   <- var ref, must be skipped',
  '      - uses: actions/checkout@v4   <- pinned, must NOT be flagged',
].join('\n');

const dockerfileBad = [
  'FROM node:20-alpine',
  'ENV API_KEY="hardcoded-key-12345"',
  'RUN apt-get update && apt-get install -y curl',
].join('\n');

const dockerfileExplicitRoot = [
  'FROM ubuntu:22.04',
  'USER root',
].join('\n');

const dockerfileClean = [
  'FROM node:20-alpine',
  'RUN useradd -m appuser',
  'USER appuser',
].join('\n');

const compose = [
  'services:',
  '  db:',
  '    image: postgres:16',
  '    privileged: true',
  '    environment:',
  '      POSTGRES_PASSWORD: "supersecret123"',
].join('\n');

const cases = [
  ['workflow ci.yml (PIPE-001/002/004/005)', workflow, 'ci.yml'],
  ['Dockerfile no USER (PIPE-002 + implicit PIPE-003)', dockerfileBad, 'Dockerfile'],
  ['Dockerfile explicit USER root (PIPE-003 explicit)', dockerfileExplicitRoot, 'Dockerfile'],
  ['Dockerfile clean (no findings)', dockerfileClean, 'Dockerfile.prod'],
  ['docker-compose.yml (PIPE-002 + PIPE-004)', compose, 'docker-compose.yml'],
  ['unknown file type (no rules)', workflow, 'readme.txt'],
];

let failures = 0;
const expect = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  -> ' + detail}`);
  if (!cond) failures++;
};

for (const [label, content, filename] of cases) {
  const r = analyzePipelineConfig(content, filename);
  console.log(`\n=== ${label} ===`);
  console.log(`summary=${JSON.stringify(r.summary)} riskScore=${r.riskScore} riskLevel=${r.riskLevel}`);
  r.findings.forEach(f => console.log(`  [${f.severity}] ${f.id} line ${f.line}: ${f.code.slice(0, 60)}`));
}

// Assertions
const w = analyzePipelineConfig(workflow, 'ci.yml');
expect('workflow: 4 findings', w.findings.length === 4, JSON.stringify(w.findings.map(f => f.id)));
expect('workflow: PIPE-005 Critical at ref line 11',
  w.findings.some(f => f.id === 'PIPE-005' && f.severity === 'Critical' && f.line === 11),
  JSON.stringify(w.findings.filter(f => f.id === 'PIPE-005')));
expect('workflow: PIPE-001 at line 9', w.findings.some(f => f.id === 'PIPE-001' && f.line === 9));
expect('workflow: PIPE-002 + PIPE-004 both at line 12',
  w.findings.filter(f => f.line === 12).length === 2 &&
  w.findings.filter(f => f.line === 12).every(f => f.severity === 'High'));
expect('workflow: comment line 13 skipped', !w.findings.some(f => f.line === 13));
expect('workflow: var-ref line 15 skipped', !w.findings.some(f => f.line === 15));
expect('workflow: pinned action line 16 not flagged', !w.findings.some(f => f.line === 16));
expect('workflow: rulesChecked=4 (PIPE-003 is Dockerfile-only)', w.summary.rulesChecked === 4, String(w.summary.rulesChecked));
expect('workflow: riskScore=60 High', w.riskScore === 60 && w.riskLevel === 'High', `${w.riskScore} ${w.riskLevel}`);

const db = analyzePipelineConfig(dockerfileBad, 'Dockerfile');
expect('dockerfileBad: PIPE-002 High + implicit PIPE-003 Medium',
  db.findings.length === 2 &&
  db.findings.some(f => f.id === 'PIPE-002' && f.severity === 'High') &&
  db.findings.some(f => f.id === 'PIPE-003' && f.line === 1 && f.severity === 'Medium'),
  JSON.stringify(db.findings.map(f => f.id)));
expect('dockerfileBad: rulesChecked=3', db.summary.rulesChecked === 3, String(db.summary.rulesChecked));
expect('dockerfileBad: riskScore=20 Low', db.riskScore === 20 && db.riskLevel === 'Low', `${db.riskScore} ${db.riskLevel}`);

const dr = analyzePipelineConfig(dockerfileExplicitRoot, 'Dockerfile');
expect('explicit root: exactly 1 finding (explicit, no implicit duplicate)',
  dr.findings.length === 1 && dr.findings[0].id === 'PIPE-003' && dr.findings[0].line === 2,
  JSON.stringify(dr.findings.map(f => `${f.id}@${f.line}`)));

const dc = analyzePipelineConfig(dockerfileClean, 'Dockerfile.prod');
expect('clean dockerfile: 0 findings, level None',
  dc.findings.length === 0 && dc.riskScore === 0 && dc.riskLevel === 'None' && dc.summary.rulesChecked === 3,
  JSON.stringify(dc.summary));

const cp = analyzePipelineConfig(compose, 'docker-compose.yml');
expect('compose: PIPE-002 + PIPE-004 High x2, rulesChecked=4',
  cp.findings.length === 2 && cp.summary.rulesChecked === 4 && cp.riskScore === 30 && cp.riskLevel === 'Medium',
  JSON.stringify(cp.summary) + ` score=${cp.riskScore} level=${cp.riskLevel}`);

const un = analyzePipelineConfig(workflow, 'readme.txt');
expect('unknown type: 0 rules checked, level None',
  un.summary.rulesChecked === 0 && un.findings.length === 0 && un.riskLevel === 'None');

const empty = analyzePipelineConfig('', 'ci.yml');
expect('empty content: graceful, level None', empty.findings.length === 0 && empty.riskLevel === 'None');

console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASSED' : failures + ' ASSERTION(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
