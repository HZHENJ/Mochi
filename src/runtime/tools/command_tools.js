const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const { requireWorkspaceRoot, resolveWorkspacePath } = require("./workspace_context");
const { createApprovalDeniedResult, runWithApproval } = require("./tool_approval");
const { createToolResult, truncateText } = require("./tool_result");

const execFileAsync = promisify(execFile);

function createCommandTools({ sdk, zod, getWorkspaceRoot, getRunState, requestApproval }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "run_command",
      description:
        "Run a workspace-local command with explicit arguments and capture stdout, stderr, and exit code.",
      parameters: z.object({
        command: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().default("."),
        timeoutMs: z.number().int().min(1000).max(120000).default(20000),
      }),
      execute: async ({ command, args = [], cwd = ".", timeoutMs = 20000 }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const targetCwd = resolveWorkspacePath(workspaceRoot, cwd || ".");
        const prompt = getRunState ? getRunState().prompt : "";
        const approval = requestApproval
          ? {
              allowed: false,
              approvalRequest: {
                kind: "command-execution",
                action: "run_command",
                reason: "run-command",
                relativePath: cwd || ".",
              },
            }
          : { allowed: true };

        return runWithApproval({
          approval,
          requestApproval,
          prompt,
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "command",
              action: "run_command",
              path: cwd || ".",
              message: `User denied approval for run_command in ${cwd || "."}`,
              data: {
                command,
                args,
                cwd: targetCwd,
                notRun: true,
                exitCode: null,
                stdout: "",
                stderr: "",
              },
            }),
          run: () =>
            executeCommand({
              command,
              args,
              cwd,
              targetCwd,
              timeoutMs,
            }),
        });
      },
    }),
  ];
}

async function executeCommand({ command, args, cwd, targetCwd, timeoutMs }) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: targetCwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const stdout = result && typeof result.stdout === "string" ? result.stdout : "";
    const stderr = result && typeof result.stderr === "string" ? result.stderr : "";

    return createToolResult({
      ok: true,
      kind: "command",
      action: "run_command",
      path: cwd || ".",
      message: `Command succeeded: ${formatCommand(command, args)}`,
      summary: `Command succeeded: ${formatCommand(command, args)}`,
      data: {
        command,
        args,
        cwd: targetCwd,
        exitCode: 0,
        stdout,
        stderr,
        stdoutPreview: truncateText(stdout, 600),
        stderrPreview: truncateText(stderr, 600),
      },
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    const exitCode = typeof error.code === "number" ? error.code : error.killed ? null : null;

    return createToolResult({
      ok: false,
      kind: "command",
      action: "run_command",
      path: cwd || ".",
      message: `Command failed: ${formatCommand(command, args)}`,
      summary: `Command failed: ${formatCommand(command, args)}`,
      data: {
        command,
        args,
        cwd: targetCwd,
        exitCode,
        stdout,
        stderr,
        stdoutPreview: truncateText(stdout, 600),
        stderrPreview: truncateText(stderr || error.message || String(error), 600),
        timedOut: Boolean(error.killed),
      },
    });
  }
}

function formatCommand(command, args) {
  const suffix = Array.isArray(args) && args.length ? ` ${args.join(" ")}` : "";
  return `${command}${suffix}`;
}

module.exports = {
  createCommandTools,
};
