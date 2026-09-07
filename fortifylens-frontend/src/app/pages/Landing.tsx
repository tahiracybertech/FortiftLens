import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight, CheckCircle2, Loader2, Terminal,
  ClipboardCheck, Radar, ScanLine, Package, GitBranch,
  Database, Bug, KeyRound, Lock, Shield, Workflow,
  Boxes, Layers, Cpu, Github, Gitlab, Container, AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { motion, useInView, AnimatePresence } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { useAuth } from '../context/AuthContext';
import logoImage from '../../assets/logo.png';

// Typography is driven by design tokens (Chakra Petch / IBM Plex Mono / IBM Plex Sans).
const displayFont = { fontFamily: 'var(--font-display)' } as const;
const monoFont = { fontFamily: 'var(--font-mono)' } as const;

// ── REAL internal numbers (read from source, never invented) ────────────────
// SDLC phases        → fortifylens-backend/src/routes/analysis.js  SDLC_PHASES (6)
// SAST rule patterns → fortifylens-backend/src/services/analysisService.js  SAST_PATTERNS (10)
// Pipeline rules     → fortifylens-backend/src/services/pipelineSecurityService.js  PIPELINE_RULES (5)
// Dependency ecosystems → fortifylens-cli/bin/cli.js  DEP_FILES (4: npm, PyPI, Maven, Go) — SCA source: OSV
const REAL_STATS = {
  phases: 6,
  sastPatterns: 10,
  pipelineRules: 5,
  ecosystems: 4,
} as const;

// Scan-panel stagger: rows resolve one-by-one, as if a live scan completes.
const SCAN_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};
const SCAN_ITEM = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' as const } }
};

// Shared scroll-reveal wrapper — every band fades/slides in once, ~0.5s.
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// The six real SDLC phases (analysis.js SDLC_PHASES) with genuine sample checks
// pulled from analysisService.js / pipelineSecurityService.js.
const PHASES: {
  key: string; label: string; full: string; icon: LucideIcon;
  blurb: string; checks: string[];
}[] = [
  {
    key: 'requirement', label: 'Requirements', full: 'Requirements Analysis', icon: ClipboardCheck,
    blurb: 'AI-assisted detection of security requirements straight from your freetext specs, scored against compliance baselines before design begins.',
    checks: [
      'Security-requirement keyword detection across freetext specs',
      'Compliance baseline gap-checking with weighted controls',
      'Risk score raised when critical controls are missing',
    ],
  },
  {
    key: 'design', label: 'Threat Modeling', full: 'Threat Modeling (STRIDE)', icon: Radar,
    blurb: 'STRIDE-based analysis of your architecture components — API, Database, Client, Server — surfacing design risk with concrete mitigations.',
    checks: [
      'STRIDE categories: Spoofing · Tampering · Repudiation · Disclosure · DoS · Elevation',
      'Per-component threat templates (API · Database · Client · Server)',
      'A concrete mitigation strategy attached to every threat',
    ],
  },
  {
    key: 'development', label: 'Code Review', full: 'Code Review (SAST)', icon: ScanLine,
    blurb: 'Regex-based static analysis over your source, flagging OWASP Top 10 patterns with line numbers and false-positive filtering.',
    checks: [
      'SQL Injection Risk — concatenation in SQL context (SQL-INJ-001)',
      'Hardcoded Secret / API Key detection (HARDCODED-SECRET-001)',
      'Dangerous eval() / dynamic code execution (EVAL-001)',
    ],
  },
  {
    key: 'sca', label: 'Dependencies', full: 'Dependency Scanning (SCA)', icon: Package,
    blurb: 'OSV-backed scanning of your dependency manifests for known-vulnerable and outdated packages, complete with fix versions.',
    checks: [
      'OSV vulnerability database lookup per manifest',
      'Vulnerable and outdated package detection',
      'Recommended fix versions for every flagged dependency',
    ],
  },
  {
    key: 'pipeline', label: 'Pipeline', full: 'Pipeline Security', icon: Workflow,
    blurb: 'CI/CD misconfiguration scanning across workflow YAML, Dockerfiles and compose files using targeted pipeline rules.',
    checks: [
      'Unpinned GitHub Actions — mutable branch/tag refs (PIPE-001)',
      'Hardcoded Secrets in CI/CD configuration (PIPE-002)',
      'pull_request_target script injection, two-pass (PIPE-005)',
    ],
  },
  {
    key: 'crossphase', label: 'Cross-Phase', full: 'Cross-Phase Consistency', icon: GitBranch,
    blurb: 'Correlates findings from the five prior phases into one unified risk view — traceable from requirement down to pipeline.',
    checks: [
      'Cross-phase finding correlation into a unified risk view',
      'Aggregated risk score computed across all phases',
      'Traceability from requirement → design → code → pipeline',
    ],
  },
];

// Genuine detection categories (kept from the original page).
const DETECTIONS: { icon: LucideIcon; label: string }[] = [
  { icon: Database, label: 'SQL Injection' },
  { icon: Bug, label: 'Cross-Site Scripting (XSS)' },
  { icon: KeyRound, label: 'IDOR / Broken Access' },
  { icon: Lock, label: 'Hardcoded Secrets' },
  { icon: Package, label: 'Vulnerable Dependencies' },
  { icon: Radar, label: 'STRIDE Threat Categories' },
];

// "Why bolt-on security fails" — honest problem framing, no fabricated proof.
const PROBLEMS: { title: string; copy: string; lines: { text: string; tone: 'teal' | 'amber' | 'muted' }[] }[] = [
  {
    title: 'Findings arrive only at the end',
    copy: 'Security bolted on after the code is written surfaces risk when it is most expensive to fix — right before ship.',
    lines: [
      { text: '$ scan --phase pre-release', tone: 'muted' },
      { text: '⚠ 42 issues found · sprint frozen', tone: 'amber' },
      { text: '✓ requirements never analyzed', tone: 'teal' },
    ],
  },
  {
    title: 'Every phase has its own siloed tool',
    copy: 'Requirements, threat modeling, SAST, SCA and CI each live in separate dashboards that never talk to one another.',
    lines: [
      { text: '$ tool-a · tool-b · tool-c', tone: 'muted' },
      { text: '⚠ context lost between stages', tone: 'amber' },
      { text: '✓ no unified risk view', tone: 'teal' },
    ],
  },
  {
    title: 'No traceability, requirement to pipeline',
    copy: 'Without a thread from the first requirement to the final workflow, nobody can prove a control was actually implemented.',
    lines: [
      { text: '$ trace requirement → deploy', tone: 'muted' },
      { text: '⚠ link broken at handoff', tone: 'amber' },
      { text: '✓ coverage impossible to audit', tone: 'teal' },
    ],
  },
];

// Verified ecosystems / CI targets only:
// DEP_FILES → npm, PyPI, Maven, Go. Pipeline scanner + CI action → GitHub Actions, GitLab CI, Docker.
const ECOSYSTEMS: { icon: LucideIcon; name: string }[] = [
  { icon: Package, name: 'npm' },
  { icon: Boxes, name: 'PyPI' },
  { icon: Layers, name: 'Maven' },
  { icon: Cpu, name: 'Go' },
  { icon: Github, name: 'GitHub Actions' },
  { icon: Gitlab, name: 'GitLab CI' },
  { icon: Container, name: 'Docker' },
];

// How It Works — a genuine sequential pipeline (kept from the original page).
const HOW_IT_WORKS: { phase: string; title: string; description: string; icon: LucideIcon }[] = [
  { phase: 'Phase 1', title: 'Requirement Analysis', description: 'Detect security requirements with AI assistance and check them against compliance baselines to reveal gaps early.', icon: ClipboardCheck },
  { phase: 'Phase 2', title: 'Threat Modeling', description: 'Classify architecture components and run STRIDE-based threat analysis with concrete mitigation strategies.', icon: Radar },
  { phase: 'Phase 3', title: 'Code Review (SAST)', description: 'Static analysis of your source code to locate injection flaws, unsafe patterns, and exposed secrets.', icon: ScanLine },
  { phase: 'Phase 4', title: 'Dependency Scanning (SCA)', description: 'OSV-backed scanning of your manifests for vulnerable and outdated packages, with fix versions.', icon: Package },
  { phase: 'Phase 5', title: 'Pipeline Security', description: 'Scan CI/CD workflow YAML, Dockerfiles and compose files for misconfigurations and injected secrets.', icon: Workflow },
  { phase: 'Phase 6', title: 'Cross-Phase Mapping', description: 'Correlate findings across all prior phases into a unified, traceable risk view.', icon: GitBranch },
];

// ── Sticky stats: a single stat row that dims unless it is the active one ────
function StatRow({ value, label, sub, index, onActive }: {
  value: number; label: string; sub: string; index: number;
  onActive: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' });

  useEffect(() => { if (inView) onActive(index); }, [inView, index, onActive]);

  return (
    <motion.div
      ref={ref}
      className="border-l border-border py-8 pl-6 sm:pl-8"
      animate={{ opacity: inView ? 1 : 0.25 }}
      transition={{ duration: 0.75, ease: 'easeOut' }}
    >
      <div style={displayFont} className="txt-gradient text-6xl font-bold leading-none sm:text-7xl">
        {value}
      </div>
      <div style={monoFont} className="mt-4 text-xs uppercase tracking-[0.25em] text-foreground">
        {label}
      </div>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{sub}</p>
    </motion.div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Smart redirect — logged-in users go to their dashboard, others to signup
  const handleGetStarted = () => {
    if (!user) { navigate('/signup'); return; }
    if (user.role === 'superadmin') navigate('/superadmin-dashboard');
    else if (user.role === 'org_admin') navigate('/admin-dashboard');
    else navigate('/user-dashboard');
  };

  // Phase explorer state
  const [activePhase, setActivePhase] = useState(0);
  // Sticky stats state — which stat row is currently centred
  const [activeStat, setActiveStat] = useState(0);

  // The six real SDLC phases FortifyLens runs — shared by the hero scan panel.
  const scanPhases = [
    { name: 'Requirement Analysis', icon: ClipboardCheck, status: 'complete' as const },
    { name: 'Threat Modeling', icon: Radar, status: 'complete' as const },
    { name: 'Code Review (SAST)', icon: ScanLine, status: 'complete' as const },
    { name: 'Dependency Scanning (SCA)', icon: Package, status: 'complete' as const },
    { name: 'Pipeline Security', icon: Workflow, status: 'complete' as const },
    { name: 'Cross-Phase Mapping', icon: GitBranch, status: 'scanning' as const }
  ];

  const stats = [
    { value: REAL_STATS.phases, label: 'SDLC phases covered', sub: 'Requirements, threat modeling, SAST, SCA, pipeline and cross-phase correlation — analyzed as one pipeline.' },
    { value: REAL_STATS.sastPatterns, label: 'SAST rule patterns', sub: 'Regex-based static rules mapping to the OWASP Top 10, from SQL injection to exposed secrets.' },
    { value: REAL_STATS.pipelineRules, label: 'Pipeline security rules', sub: 'Targeted CI/CD checks across workflow YAML, Dockerfiles and docker-compose configurations.' },
    { value: REAL_STATS.ecosystems, label: 'Dependency ecosystems scanned', sub: 'npm, PyPI, Maven and Go manifests checked against the OSV vulnerability database.' },
  ];

  const phase = PHASES[activePhase];

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-background text-foreground">
      {/* ══ 1. HERO — two-column split with layered depth ══ */}
      <section className="relative overflow-hidden">
        {/* token-driven atmosphere — no raw hex, no gradient utilities */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="dot-wave pointer-events-none absolute -top-10 right-0 h-[28rem] w-[28rem] opacity-[0.18]" />

        <div className="container relative z-10 mx-auto px-4 py-20 lg:py-28">
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-16">
            {/* Left — message + CTAs */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="mb-6 flex items-center gap-3">
                <img src={logoImage} alt="FortifyLens logo" className="h-9 w-9 rounded-md" />
                <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">
                  AI-Powered Secure SDLC
                </span>
              </div>

              <h1 style={displayFont} className="mb-6 text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl lg:text-6xl">
                Catch security flaws{' '}
                <span className="text-primary">from the first phase</span>,{' '}
                <span className="txt-gradient">not the last.</span>
              </h1>

              <p className="mb-8 max-w-xl text-lg text-muted-foreground">
                FortifyLens runs a six-phase analysis across your entire SDLC — requirements,
                threat modeling, code review, dependency scanning, pipeline security, and
                cross-phase correlation — so risk is visible before you ship.
              </p>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  onClick={handleGetStarted}
                  size="lg"
                  className="border-0 bg-primary px-8 text-lg text-primary-foreground hover:bg-primary/90"
                >
                  {user ? 'Go to Dashboard' : 'Get Started'} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-primary/50 px-8 text-lg text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Link to="/features">View Features</Link>
                </Button>
              </div>
            </motion.div>

            {/* Right — live scan panel (the ONLY .scan-line container) + floating tiles */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="scan-line relative"
            >
              <Card className="border-border bg-card/80 p-0 shadow-2xl shadow-primary/10 backdrop-blur-sm">
                {/* panel title bar */}
                <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                  <Terminal className="h-4 w-4 text-primary" />
                  <span style={monoFont} className="text-xs uppercase tracking-widest text-muted-foreground">
                    fortifylens · live scan
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                    <span style={monoFont} className="text-[10px] uppercase tracking-wider text-primary">running</span>
                  </span>
                </div>

                {/* phase rows */}
                <motion.div variants={SCAN_CONTAINER} initial="hidden" animate="visible" className="divide-y divide-border">
                  {scanPhases.map((p, i) => (
                    <motion.div key={p.name} variants={SCAN_ITEM} className="flex items-center gap-3 px-5 py-3.5">
                      <span style={monoFont} className="w-6 shrink-0 text-xs text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm text-foreground">{p.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {p.status === 'complete' ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span style={monoFont} className="text-[10px] uppercase tracking-wider text-muted-foreground">done</span>
                          </>
                        ) : (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--risk-amber)' }} />
                            <span style={{ ...monoFont, color: 'var(--risk-amber)' }} className="text-[10px] uppercase tracking-wider">scanning</span>
                          </>
                        )}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>

                {/* panel footer */}
                <div className="flex items-center gap-2 border-t border-border px-5 py-3">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span style={monoFont} className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    6 phases · unified risk view
                  </span>
                </div>
              </Card>

              {/* floating severity-chip tile — overlapping top-left corner */}
              <motion.div
                initial={{ opacity: 0, x: -16, y: -10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="absolute -left-4 -top-6 hidden sm:block lg:-left-10"
              >
                <Card className="border-border bg-card/95 px-4 py-3 shadow-xl shadow-primary/10 backdrop-blur">
                  <span style={monoFont} className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    severity
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span style={monoFont} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground bg-primary">C</span>
                    <span style={{ ...monoFont, color: 'var(--risk-amber)' }} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">H</span>
                    <span style={monoFont} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">M</span>
                    <span style={monoFont} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">L</span>
                  </div>
                </Card>
              </motion.div>

              {/* floating mono tile — overlapping bottom-right corner */}
              <motion.div
                initial={{ opacity: 0, x: 16, y: 10 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.5, delay: 0.65 }}
                className="absolute -bottom-6 -right-3 hidden sm:block lg:-right-8"
              >
                <Card className="card-accent border-border bg-card/95 px-4 py-3 shadow-xl shadow-primary/10 backdrop-blur">
                  <span style={monoFont} className="text-xs font-semibold text-foreground">6 phases</span>
                  <span style={monoFont} className="mx-1.5 text-xs text-muted-foreground">·</span>
                  <span style={monoFont} className="text-xs text-primary">1 report</span>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ 2. PROBLEM BAND — why bolt-on security fails ══ */}
      <section className="border-t border-border py-20">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <span style={{ ...monoFont, color: 'var(--risk-amber)' }} className="text-xs uppercase tracking-[0.25em]">
                the problem
              </span>
              <h2 style={displayFont} className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                Why bolt-on security fails
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Tooling that arrives late and never connects leaves risk invisible until it is expensive.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08}>
                <Card className="card-accent h-full border-border bg-card/60 p-6 pt-7 transition-colors hover:border-primary/40">
                  {/* mini terminal header */}
                  <div className="mb-5 rounded-md border border-border bg-background/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary/70" />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--circuit-teal)' }} />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--risk-amber)' }} />
                    </div>
                    {p.lines.map((l) => (
                      <div
                        key={l.text}
                        style={{
                          ...monoFont,
                          color: l.tone === 'amber' ? 'var(--risk-amber)'
                            : l.tone === 'teal' ? 'var(--circuit-teal)'
                              : 'var(--muted-foreground)',
                        }}
                        className="truncate text-[11px] leading-relaxed"
                      >
                        {l.text}
                      </div>
                    ))}
                  </div>
                  <h3 style={displayFont} className="mb-2 text-lg font-semibold text-foreground">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{p.copy}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 3. STICKY STATS BAND — phase pipeline (sticky) + scroll-dimmed stats ══ */}
      <section className="border-y border-border bg-secondary/30 py-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* LEFT — sticky phase pipeline (hidden below lg per responsive rule) */}
            <div className="hidden lg:block">
              <div className="lg:sticky lg:top-24">
                <Reveal>
                  <Card className="card-accent border-border bg-card/70 p-7 pt-8">
                    <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">
                      the pipeline
                    </span>
                    <h3 style={displayFont} className="mt-2 mb-6 text-2xl font-bold text-foreground">
                      Six phases, one report
                    </h3>
                    <ol className="space-y-1">
                      {PHASES.map((ph, i) => {
                        const done = i < activeStat;
                        const active = i === activeStat;
                        return (
                          <li
                            key={ph.key}
                            className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-500 ${active ? 'bg-primary/10' : ''}`}
                          >
                            <span style={monoFont} className={`w-6 shrink-0 text-xs ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <ph.icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : done ? 'text-primary/60' : 'text-muted-foreground'}`} />
                            <span style={monoFont} className={`truncate text-sm ${active ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                              {ph.full}
                            </span>
                            {done && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary/60" />}
                            {active && <span className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />}
                          </li>
                        );
                      })}
                    </ol>
                  </Card>
                </Reveal>
              </div>
            </div>

            {/* RIGHT — scroll-linked dimming stat rows */}
            <div>
              <Reveal>
                <div className="mb-6 lg:hidden">
                  <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">by the numbers</span>
                </div>
              </Reveal>
              {stats.map((s, i) => (
                <StatRow key={s.label} value={s.value} label={s.label} sub={s.sub} index={i} onActive={setActiveStat} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 4. PHASE EXPLORER TABS ══ */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="mb-10 max-w-2xl">
              <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">explore</span>
              <h2 style={displayFont} className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                What each phase actually checks
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Real detections from the FortifyLens engine — pick a phase to see inside.
              </p>
            </div>
          </Reveal>

          {/* pill tab bar with sliding indicator */}
          <Reveal>
            <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-border bg-card/50 p-2">
              {PHASES.map((ph, i) => (
                <button
                  key={ph.key}
                  onClick={() => setActivePhase(i)}
                  className={`relative rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${activePhase === i ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {activePhase === i && (
                    <motion.span
                      layoutId="phase-pill"
                      className="absolute inset-0 rounded-xl bg-primary"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <ph.icon className="h-4 w-4" />
                    {ph.label}
                  </span>
                </button>
              ))}
            </div>
          </Reveal>

          {/* crossfading panel */}
          <div className="relative min-h-[19rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase.key}
                initial={{ opacity: 0, x: 24, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -24, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <Card className="card-accent border-border bg-card/60 p-8 pt-9">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
                      <phase.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <span style={monoFont} className="text-xs uppercase tracking-widest text-primary">
                        phase {String(activePhase + 1).padStart(2, '0')} / 06
                      </span>
                      <h3 style={displayFont} className="text-2xl font-semibold text-foreground">{phase.full}</h3>
                    </div>
                  </div>
                  <p className="mb-7 max-w-3xl text-base leading-relaxed text-muted-foreground">{phase.blurb}</p>
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {phase.checks.map((c) => (
                      <li key={c} className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-4">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span style={monoFont} className="text-xs leading-relaxed text-foreground">{c}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ══ 5. ECOSYSTEM MARQUEE ══ */}
      <section className="border-y border-border bg-secondary/30 py-16">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="mb-10 text-center">
              <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">integrations</span>
              <h2 style={displayFont} className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                Works where you build
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                Scans the manifests and pipelines you already use — verified ecosystems and CI targets only.
              </p>
            </div>
          </Reveal>
        </div>

        {/* edge-faded infinite marquee */}
        <div
          className="relative overflow-hidden"
          style={{
            WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
            maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
          }}
        >
          <div className="marquee-track gap-4">
            {[...ECOSYSTEMS, ...ECOSYSTEMS].map((eco, i) => (
              <div
                key={`${eco.name}-${i}`}
                className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card/70 px-6 py-4"
              >
                <eco.icon className="h-6 w-6 text-primary" />
                <span style={monoFont} className="whitespace-nowrap text-sm font-medium text-foreground">{eco.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 6. DETECTIONS GRID ══ */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">detection coverage</span>
              <h2 style={displayFont} className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                What FortifyLens catches
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                The classes of issues the pipeline is built to surface across your code and design.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DETECTIONS.map((d, index) => (
              <Reveal key={d.label} delay={index * 0.06}>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3.5 transition-colors hover:border-primary/40">
                  <d.icon className="h-5 w-5 shrink-0 text-primary" />
                  <span style={monoFont} className="text-sm text-foreground">{d.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 7. HOW IT WORKS ══ */}
      <section className="border-y border-border bg-secondary/40 py-20">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">workflow</span>
              <h2 style={displayFont} className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                How It Works
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                A left-to-right pipeline: each phase feeds the next, ending in a correlated risk view.
              </p>
            </div>
          </Reveal>

          <div className="max-w-4xl">
            {HOW_IT_WORKS.map((step, index) => (
              <motion.div
                key={step.phase}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="relative flex gap-5 pb-8 last:pb-0"
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                    <span style={monoFont} className="text-sm font-semibold text-primary">{index + 1}</span>
                  </div>
                  {index < HOW_IT_WORKS.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <Card className="mb-0 flex-1 border-border bg-card/60 p-5">
                  <span style={monoFont} className="text-xs uppercase tracking-widest text-primary">{step.phase}</span>
                  <h3 style={displayFont} className="mt-1.5 flex items-center gap-2 text-xl font-semibold text-foreground">
                    <step.icon className="h-5 w-5 text-primary" />
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 8. FINAL CTA CARD — three honest paths ══ */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Reveal>
            <div className="cta-card relative overflow-hidden rounded-2xl p-10 sm:p-14">
              {/* corner dot-wave decoration */}
              <div className="dot-wave pointer-events-none absolute -right-10 -top-10 h-64 w-64 opacity-25" />

              <div className="relative z-10 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                {/* (a) primary path */}
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    <span style={monoFont} className="text-xs uppercase tracking-[0.25em] text-primary">start now</span>
                  </div>
                  <h2 style={displayFont} className="max-w-lg text-3xl font-bold leading-tight text-foreground sm:text-4xl">
                    Security that starts on <span className="txt-gradient">day one</span>
                  </h2>
                  <p className="mt-4 max-w-lg text-lg text-muted-foreground">
                    Run a full six-phase analysis on your project today — an honest, end-to-end view
                    of risk across your whole SDLC. No adoption claims, just coverage.
                  </p>
                  <div className="mt-8">
                    <Button
                      onClick={handleGetStarted}
                      size="lg"
                      className="border-0 bg-primary px-8 text-lg text-primary-foreground hover:bg-primary/90"
                    >
                      {user ? 'Go to Dashboard' : 'Start scanning today'} <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {/* (b) + (c) secondary paths */}
                <div className="flex flex-col gap-4 lg:border-l lg:border-border lg:pl-10">
                  <Link
                    to="/pricing"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-5 py-4 transition-colors hover:border-primary/40"
                  >
                    <span>
                      <span style={displayFont} className="block text-base font-semibold text-foreground">Compare plans</span>
                      <span className="text-sm text-muted-foreground">Find the right tier for your team</span>
                    </span>
                    <span className="txt-gradient flex items-center gap-1 text-sm font-semibold">
                      View <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--primary)' }} />
                    </span>
                  </Link>

                  <Link
                    to="/contact"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-5 py-4 transition-colors hover:border-primary/40"
                  >
                    <span>
                      <span style={displayFont} className="block text-base font-semibold text-foreground">Talk to us</span>
                      <span className="text-sm text-muted-foreground">Questions about coverage or setup</span>
                    </span>
                    <span className="txt-gradient flex items-center gap-1 text-sm font-semibold">
                      Contact <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--primary)' }} />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </motion.div>
  );
}
