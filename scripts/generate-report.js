#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

function loadSessions() {
  const dataArg = process.argv.find((a, i) => process.argv[i - 1] === "--data");
  const filePath = dataArg
    ? path.resolve(dataArg)
    : path.join(os.homedir(), ".mochi", "memory", "sessions.json");
  if (!fs.existsSync(filePath)) {
    console.error(`Sessions file not found: ${filePath}`);
    console.error("Run Mochi at least once, or pass --data <path> to use a custom file.");
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to parse sessions file: ${err.message}`);
    process.exit(1);
  }
}

function extractTraces(data) {
  const sessions = (data && data.sessions) ? Object.values(data.sessions) : [];
  const traces = [];
  let skipped = 0;
  for (const session of sessions) {
    if (!session || !session.lastRunTrace) { skipped++; continue; }
    traces.push({ session, trace: session.lastRunTrace });
  }
  return { traces, totalSessions: sessions.length, skipped };
}

function classifyRisk(toolName) {
  if (toolName === "delete_file" || toolName === "delete_dir") return "high";
  if (["run_command", "write_file", "append_file", "make_dir"].includes(toolName)) return "medium";
  return "low";
}

function aggregateSecurityMetrics(traceEntries) {
  const riskCounts = { low: 0, medium: 0, high: 0 };
  const toolMap = {};
  const allApprovals = [];
  let approvalRequests = 0;
  let denied = 0;

  for (const { trace, session } of traceEntries) {
    for (const tc of (trace.toolCalls || [])) {
      const name = tc.name || "unknown";
      const risk = classifyRisk(name);
      riskCounts[risk]++;
      if (!toolMap[name]) toolMap[name] = { total: 0, failed: 0 };
      toolMap[name].total++;
      const failed = tc.status === "failed" || (tc.output && tc.output.ok === false);
      if (failed) toolMap[name].failed++;
    }
    for (const ap of (trace.approvals || [])) {
      approvalRequests++;
      if (ap.status === "denied") denied++;
      allApprovals.push({
        ...ap,
        sessionId: session.id || "",
        at: ap.at || trace.startedAt || "",
      });
    }
  }

  return {
    totalRuns: traceEntries.length,
    highRisk: riskCounts.high,
    approvalRequests,
    denied,
    riskCounts,
    toolMap,
    allApprovals,
  };
}

function aggregateEvalMetrics(traceEntries) {
  const verification = { needed: 0, passed: 0, failed: 0, notRun: 0, denied: 0 };
  const subagentCounts = { repo_guide: 0, coding: 0, plan_reviewer: 0, review: 0 };

  for (const { trace } of traceEntries) {
    const v = trace.verification;
    if (v && v.needed) {
      verification.needed++;
      if (v.status === "passed")   verification.passed++;
      else if (v.status === "failed")  verification.failed++;
      else if (v.status === "not_run") verification.notRun++;
      else if (v.status === "denied")  verification.denied++;
    }
    for (const sr of (trace.subagentRuns || [])) {
      const key = sr.agentKey;
      if (key in subagentCounts) subagentCounts[key]++;
    }
  }

  const pct = (n) => verification.needed > 0 ? Math.round((n / verification.needed) * 100) : 0;

  return {
    verification,
    passRate: pct(verification.passed),
    skipRate: pct(verification.notRun),
    failRate: pct(verification.failed),
    subagentCounts,
  };
}

function renderStatCard(value, label, color = "#58a6ff") {
  return `
    <div class="stat-card">
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

function renderSecTab(security) {
  const { totalRuns, highRisk, approvalRequests, denied, riskCounts, allApprovals } = security;

  const cards = `
    <div class="stat-row">
      ${renderStatCard(totalRuns, "Total Runs", "#58a6ff")}
      ${renderStatCard(highRisk, "High-Risk Actions", "#f85149")}
      ${renderStatCard(approvalRequests, "Approval Requests", "#d29922")}
      ${renderStatCard(denied, "Denied Operations", "#f85149")}
    </div>`;

  const riskChart = `
    <div class="chart-wrap" style="max-width:340px">
      <canvas id="riskChart" height="220"></canvas>
    </div>
    <script>
    (function() {
      const ctx = document.getElementById("riskChart").getContext("2d");
      new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Low Risk", "Medium Risk", "High Risk"],
          datasets: [{
            data: [${riskCounts.low}, ${riskCounts.medium}, ${riskCounts.high}],
            backgroundColor: ["#238636", "#d29922", "#f85149"],
            borderColor: "#161b22",
            borderWidth: 2,
          }]
        },
        options: {
          plugins: {
            legend: { labels: { color: "#c9d1d9", font: { size: 12 } } },
            title: { display: true, text: "Tool Call Risk Distribution", color: "#8b949e", font: { size: 13 } }
          }
        }
      });
    })();
    <\/script>`;

  const approvalRows = allApprovals.length
    ? allApprovals.map(ap => {
        const badge = ap.status === "approved"
          ? '<span class="badge badge-green">approved</span>'
          : ap.status === "denied"
            ? '<span class="badge badge-red">denied</span>'
            : '<span class="badge badge-yellow">pending</span>';
        const time = ap.at ? new Date(ap.at).toLocaleString() : "—";
        const filePath = ap.relativePath ? `<code>${ap.relativePath}</code>` : "—";
        return `<tr><td>${time}</td><td><code>${ap.action || ap.tool || "—"}</code></td><td>${filePath}</td><td>${badge}</td></tr>`;
      }).join("")
    : `<tr><td colspan="4" class="empty">No approval events recorded</td></tr>`;

  const approvalTable = `
    <table>
      <thead><tr><th>Time</th><th>Action</th><th>File</th><th>Decision</th></tr></thead>
      <tbody>${approvalRows}</tbody>
    </table>`;

  return `
    <div class="section">
      <div class="section-title">Security Overview</div>
      ${cards}
    </div>
    <div class="section">
      <div class="section-title">Risk Distribution</div>
      ${riskChart}
    </div>
    <div class="section">
      <div class="section-title">Approval Audit Log</div>
      ${approvalTable}
    </div>`;
}

function renderEvalTab(ev) {
  const { verification, passRate, skipRate, failRate, subagentCounts, toolRows } = ev;

  const verCards = `
    <div class="stat-row">
      ${renderStatCard(verification.needed > 0 ? passRate + "%" : "N/A", "Verification Pass Rate", "#3fb950")}
      ${renderStatCard(verification.needed > 0 ? skipRate + "%" : "N/A", "Skipped (No Verification)", "#d29922")}
      ${renderStatCard(verification.needed > 0 ? failRate + "%" : "N/A", "Verification Failed Rate", "#f85149")}
    </div>`;

  const agentLabels = ["repo_guide", "coding", "plan_reviewer", "review"];
  const agentColors = ["#58a6ff", "#3fb950", "#d29922", "#a5a5ff"];
  const agentData = agentLabels.map(k => subagentCounts[k] || 0);

  const subagentChart = `
    <div class="chart-wrap" style="max-width:480px">
      <canvas id="agentChart" height="200"></canvas>
    </div>
    <script>
    (function() {
      const ctx = document.getElementById("agentChart").getContext("2d");
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: ${JSON.stringify(agentLabels)},
          datasets: [{
            label: "Delegations",
            data: ${JSON.stringify(agentData)},
            backgroundColor: ${JSON.stringify(agentColors)},
            borderRadius: 4,
          }]
        },
        options: {
          plugins: {
            legend: { display: false },
            title: { display: true, text: "Sub-agent Delegation Frequency", color: "#8b949e", font: { size: 13 } }
          },
          scales: {
            x: { ticks: { color: "#c9d1d9" }, grid: { color: "#21262d" } },
            y: { ticks: { color: "#c9d1d9", stepSize: 1 }, grid: { color: "#21262d" }, beginAtZero: true }
          }
        }
      });
    })();
    <\/script>`;

  const toolTableRows = toolRows && toolRows.length
    ? toolRows.map(({ name, total, failed }) => {
        const succeeded = total - failed;
        const rate = Math.round((succeeded / total) * 100);
        const badgeClass = rate >= 90 ? "badge-green" : rate >= 70 ? "badge-yellow" : "badge-red";
        return `<tr>
          <td><code>${name}</code></td>
          <td>${total}</td>
          <td>${succeeded}</td>
          <td>${failed}</td>
          <td><span class="badge ${badgeClass}">${rate}%</span></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="empty">No tool calls recorded</td></tr>`;

  const toolTable = `
    <table>
      <thead><tr><th>Tool</th><th>Total Calls</th><th>Succeeded</th><th>Failed</th><th>Success Rate</th></tr></thead>
      <tbody>${toolTableRows}</tbody>
    </table>`;

  return `
    <div class="section">
      <div class="section-title">Verification Quality</div>
      ${verCards}
    </div>
    <div class="section">
      <div class="section-title">Sub-agent Delegation</div>
      ${subagentChart}
    </div>
    <div class="section">
      <div class="section-title">Tool Success Rate</div>
      ${toolTable}
    </div>`;
}

function renderHtml({ totalSessions, traces, security, eval: ev, generatedAt }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mochi LLMOps Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; padding: 24px; }
  h1 { font-size: 22px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; }
  .meta { color: #8b949e; font-size: 12px; margin-bottom: 24px; }
  .tabs { display: flex; gap: 2px; margin-bottom: 24px; border-bottom: 1px solid #21262d; }
  .tab-btn { background: none; border: none; color: #8b949e; padding: 8px 20px; cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab-btn.active { color: #f0f6fc; border-bottom-color: #58a6ff; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 13px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
  .stat-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px 20px; min-width: 160px; flex: 1; }
  .stat-value { font-size: 32px; font-weight: 700; line-height: 1; margin-bottom: 6px; }
  .stat-label { font-size: 12px; color: #8b949e; }
  .chart-wrap { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #21262d; border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; font-size: 12px; color: #8b949e; background: #0d1117; border-bottom: 1px solid #21262d; }
  td { padding: 9px 14px; border-bottom: 1px solid #161b22; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #0d1117; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-green  { background: #1a3d2b; color: #3fb950; }
  .badge-red    { background: #3d1a1a; color: #f85149; }
  .badge-yellow { background: #3d2e1a; color: #d29922; }
  .empty { color: #8b949e; font-style: italic; padding: 16px; text-align: center; }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; color: #79c0ff; }
</style>
</head>
<body>
<h1>Mochi LLMOps Report</h1>
<div class="meta">Generated: ${generatedAt} &nbsp;|&nbsp; Sessions scanned: ${totalSessions} &nbsp;|&nbsp; Traces found: ${traces.length}</div>

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('sec', this)">LLMSecOps</button>
  <button class="tab-btn" onclick="switchTab('eval', this)">Evaluation &amp; Testing</button>
</div>

<div id="tab-sec" class="tab-panel active">
${renderSecTab(security)}
</div>

<div id="tab-eval" class="tab-panel">
${renderEvalTab(ev)}
</div>

<script>
function switchTab(id, btn) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + id).classList.add("active");
  btn.classList.add("active");
}
<\/script>
</body>
</html>`;
}

function main() {
  const data = loadSessions();
  const { traces, totalSessions, skipped } = extractTraces(data);

  if (traces.length === 0) {
    console.warn("No run traces found in sessions. Use Mochi to run some tasks first.");
    console.warn("Generating report with empty state...");
  } else {
    console.log(`Sessions: ${totalSessions}, Traces: ${traces.length}, Skipped: ${skipped}`);
  }

  const security = aggregateSecurityMetrics(traces);
  const ev = aggregateEvalMetrics(traces);

  const toolRows = Object.entries(security.toolMap)
    .map(([name, { total, failed }]) => ({ name, total, failed }))
    .sort((a, b) => b.total - a.total);

  const html = renderHtml({
    totalSessions,
    traces,
    security,
    eval: { ...ev, toolRows },
    generatedAt: new Date().toLocaleString(),
  });

  const outPath = path.join(process.cwd(), "mochi-report.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Report written: ${outPath}`);
}

main();
