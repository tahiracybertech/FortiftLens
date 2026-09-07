// ============================================================
// FortifyLens GitHub Action - Security Scan
// Runs the FortifyLens CLI and posts results as PR comments
// ============================================================

const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');

async function run() {
  try {
    const apiKey = core.getInput('api-key', { required: true });
    const serverUrl = core.getInput('server-url') || 'https://api.fortifylens.com';
    const projectId = core.getInput('project-id', { required: true });
    const failOnSeverity = core.getInput('fail-on-severity') || 'high';
    const scanAllFiles = core.getInput('scan-all-files') === 'true';

    process.env.FORTIFYLENS_API_KEY = apiKey;
    process.env.FORTIFYLENS_SERVER_URL = serverUrl;

    // Resolve CLI path - prefer monorepo sibling, fall back to npm install
    let cliPath = path.resolve(__dirname, '..', 'fortifylens-cli', 'bin', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      core.info('CLI not found locally, installing from npm...');
      const installDir = path.resolve(__dirname, 'fortifylens-cli-install');
      await exec.exec('npm', ['install', 'fortifylens-cli', '--prefix', installDir]);
      cliPath = path.join(installDir, 'node_modules', 'fortifylens-cli', 'bin', 'cli.js');
    } else {
      const cliDir = path.resolve(__dirname, '..', 'fortifylens-cli');
      if (!fs.existsSync(path.join(cliDir, 'node_modules'))) {
        core.info('Installing CLI dependencies...');
        await exec.exec('npm', ['install', '--prefix', cliDir]);
      }
    }

    // Build CLI arguments
    const args = [cliPath, 'scan', '--project-id', projectId, '--server-url', serverUrl];
    if (scanAllFiles) args.push('--all');
    // API key passed via env var to keep it out of process table

    // Run CLI
    let exitCode = 0;
    try {
      exitCode = await exec.exec('node', args, {
        ignoreReturnCode: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    } catch (e) {
      core.warning(`CLI execution error: ${e.message}`);
      exitCode = 2;
    }

    if (exitCode === 2) {
      core.setFailed('FortifyLens scan failed - CLI error (check API key and server URL)');
      return;
    }

    // Parse results artifact
    const resultsPath = path.resolve(process.cwd(), 'fortifylens-results.json');
    let results = null;

    if (fs.existsSync(resultsPath)) {
      const raw = fs.readFileSync(resultsPath, 'utf8');
      results = JSON.parse(raw);
    }

    if (!results) {
      core.info('No results file found - scan produced no findings');
      core.setOutput('findings-count', '0');
      core.setOutput('critical-count', '0');
      core.setOutput('high-count', '0');
      core.setOutput('has-blocking-findings', 'false');
      return;
    }

    // Extract counts
    const findings = results.findings || [];
    const summary = results.summary || {};
    const criticalCount = summary.critical || findings.filter(f => f.severity === 'critical').length;
    const highCount = summary.high || findings.filter(f => f.severity === 'high').length;
    const mediumCount = summary.medium || findings.filter(f => f.severity === 'medium').length;
    const totalCount = findings.length;

    // Set outputs
    core.setOutput('findings-count', String(totalCount));
    core.setOutput('critical-count', String(criticalCount));
    core.setOutput('high-count', String(highCount));
    core.setOutput('has-blocking-findings', String(summary.blocking || false));

    // Post PR comment if this is a pull request with findings
    const context = github.context;
    if (context.payload.pull_request && totalCount > 0) {
      await postPRComment(context, findings, { criticalCount, highCount, mediumCount, totalCount });
    }

    // Apply severity threshold
    const shouldFail = checkThreshold(findings, failOnSeverity);
    if (shouldFail) {
      core.setFailed(
        `Security scan found ${criticalCount} critical and ${highCount} high severity findings (threshold: ${failOnSeverity})`
      );
    } else {
      core.info(`Scan complete: ${totalCount} findings, none above '${failOnSeverity}' threshold`);
    }

  } catch (error) {
    core.setFailed(`FortifyLens Action failed: ${error.message}`);
  }
}

/**
 * Post a summary comment on the PR with findings table.
 */
async function postPRComment(context, findings, counts) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.warning('GITHUB_TOKEN not available - skipping PR comment');
      return;
    }

    const octokit = github.getOctokit(token);
    const prNumber = context.payload.pull_request.number;

    let body = '## FortifyLens Security Scan Results\n\n';
    body += '| Severity | Count |\n|----------|-------|\n';
    body += `| Critical | ${counts.criticalCount} |\n`;
    body += `| High | ${counts.highCount} |\n`;
    body += `| Medium | ${counts.mediumCount} |\n`;
    body += `| **Total** | **${counts.totalCount}** |\n\n`;

    if (findings.length > 0) {
      body += '### Top Findings\n\n';
      body += '| File | Severity | Type | Message |\n';
      body += '|------|----------|------|--------|\n';

      const topFindings = findings
        .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
        .slice(0, 10);

      for (const f of topFindings) {
        const file = f.file ? ('`' + f.file + '`') : 'unknown';
        body += `| ${file} | ${f.severity} | ${f.type || '-'} | ${f.message || '-'} |\n`;
      }

      if (findings.length > 10) {
        body += `\n*...and ${findings.length - 10} more findings. See full results in the job artifacts.*\n`;
      }
    }

    body += '\n---\n*Powered by [FortifyLens](https://fortifylens.com)*';

    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: prNumber,
      body,
    });

    core.info('PR comment posted successfully');
  } catch (err) {
    core.warning(`Failed to post PR comment: ${err.message}`);
  }
}

/**
 * Severity ordering for sorting (lower = more severe).
 */
function severityOrder(severity) {
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return order[severity] ?? 5;
}

/**
 * Check if any findings exceed the fail-on severity threshold.
 */
function checkThreshold(findings, threshold) {
  const levels = ['critical', 'high', 'medium', 'low'];
  const thresholdIndex = levels.indexOf(threshold);
  if (thresholdIndex === -1) return false;
  const blockingLevels = levels.slice(0, thresholdIndex + 1);
  return findings.some(f => blockingLevels.includes(f.severity));
}

run();