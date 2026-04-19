const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { evaluateFileOperationApproval } = require("../support/approval_policy");
const { requireWorkspaceRoot, resolveWorkspacePath } = require("./workspace_context");
const { createApprovalDeniedResult, runWithApproval } = require("./tool_approval");
const { createToolResult, truncateText } = require("./tool_result");

const mutationQueuesByPath = new Map();

function createFileTools({ sdk, zod, getWorkspaceRoot, getRunState, requestApproval }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "read_file",
      description: "Read a UTF-8 text file from the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "read_file",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }
        if (!stat.isFile()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "read_file",
            path: relativePath,
            message: `Not a file: ${relativePath}`,
          });
        }

        const content = await fs.promises.readFile(target, "utf8");
        recordFileSnapshot(getRunState, target, relativePath, content);
        return createToolResult({
          ok: true,
          kind: "file",
          action: "read_file",
          path: relativePath,
          message: `Read ${relativePath}`,
          summary: `Read ${relativePath}`,
          data: {
            content,
            preview: truncateText(content, 600),
          },
        });
      },
    }),
    tool({
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file in the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
      execute: async ({ relativePath, content }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const existingContent = await fs.promises.readFile(target, "utf8").catch(() => null);
        const writeTarget = async () => runSerializedFileMutation(target, async () => {
          const latestContent = await fs.promises.readFile(target, "utf8").catch(() => null);
          const staleResult = createStaleFileResultIfNeeded({
            getRunState,
            target,
            relativePath,
            action: "write_file",
            existingContent: latestContent,
          });
          if (staleResult) {
            return staleResult;
          }

          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.writeFile(target, content, "utf8");
          recordFileSnapshot(getRunState, target, relativePath, content);
          return createToolResult({
            ok: true,
            kind: "file",
            action: "write_file",
            path: relativePath,
            message: `Wrote ${relativePath}`,
            data: {
              bytes: Buffer.byteLength(content, "utf8"),
              created: latestContent === null,
              emptied: content.length === 0,
            },
          });
        });
        const approval = evaluateFileOperationApproval({
          action: "write_file",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: existingContent !== null,
          existingContent,
          nextContent: content,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: writeTarget,
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "write_file",
              path: relativePath,
              message: `User denied approval for write_file on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "write_file",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
    tool({
      name: "append_file",
      description: "Append UTF-8 text to a file in the active workspace, creating it if needed.",
      parameters: z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
      execute: async ({ relativePath, content }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        return runSerializedFileMutation(target, async () => {
          const existingContent = await fs.promises.readFile(target, "utf8").catch(() => null);
          const staleResult = createStaleFileResultIfNeeded({
            getRunState,
            target,
            relativePath,
            action: "append_file",
            existingContent,
          });
          if (staleResult) {
            return staleResult;
          }

          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.appendFile(target, content, "utf8");
          recordFileSnapshot(
            getRunState,
            target,
            relativePath,
            existingContent === null ? content : `${existingContent}${content}`
          );
          return createToolResult({
            ok: true,
            kind: "file",
            action: "append_file",
            path: relativePath,
            message: `Appended to ${relativePath}`,
            data: {
              bytes: Buffer.byteLength(content, "utf8"),
            },
          });
        });
      },
    }),
    tool({
      name: "make_dir",
      description: "Create a directory in the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        return runSerializedFileMutation(target, async () => {
          await fs.promises.mkdir(target, { recursive: true });
          return createToolResult({
            ok: true,
            kind: "file",
            action: "make_dir",
            path: relativePath,
            message: `Created directory ${relativePath}`,
          });
        });
      },
    }),
    tool({
      name: "delete_file",
      description: "Delete a single file in the active workspace. Refuses to delete directories.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_file",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }
        if (!stat.isFile()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_file",
            path: relativePath,
            message: `Refusing to delete non-file path: ${relativePath}`,
          });
        }

        const approval = evaluateFileOperationApproval({
          action: "delete_file",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: true,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: async () => runSerializedFileMutation(target, async () => {
            const latestContent = await fs.promises.readFile(target, "utf8").catch(() => null);
            const staleResult = createStaleFileResultIfNeeded({
              getRunState,
              target,
              relativePath,
              action: "delete_file",
              existingContent: latestContent,
            });
            if (staleResult) {
              return staleResult;
            }

            await fs.promises.unlink(target);
            recordFileSnapshot(getRunState, target, relativePath, null);
            return createToolResult({
              ok: true,
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: `Deleted ${relativePath}`,
            });
          }),
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: `User denied approval for delete_file on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
    tool({
      name: "delete_dir",
      description:
        "Recursively delete a directory inside the active workspace. Refuses to delete files or the workspace root.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const normalizedRelativePath = String(relativePath || "").trim();
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!normalizedRelativePath || normalizedRelativePath === "." || target === workspaceRoot) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: "Refusing to delete the workspace root directory.",
          });
        }

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }

        if (!stat.isDirectory()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: `Not a directory: ${relativePath}`,
          });
        }

        const approval = evaluateFileOperationApproval({
          action: "delete_dir",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: true,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: async () => runSerializedFileMutation(target, async () => {
            await fs.promises.rm(target, { recursive: true, force: false });
            return createToolResult({
              ok: true,
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: `Deleted directory ${relativePath}`,
            });
          }),
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: `User denied approval for delete_dir on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
  ];
}

function getFileSnapshotStore(getRunState) {
  const runState = getRunState ? getRunState() : null;
  if (!runState) {
    return null;
  }

  if (!runState.fileSnapshots) {
    runState.fileSnapshots = {};
  }

  return runState.fileSnapshots;
}

function recordFileSnapshot(getRunState, absolutePath, relativePath, content) {
  const snapshots = getFileSnapshotStore(getRunState);
  if (!snapshots) {
    return;
  }

  snapshots[absolutePath] = {
    relativePath,
    fingerprint: createContentFingerprint(content),
    capturedAt: new Date().toISOString(),
  };
}

function createStaleFileResultIfNeeded({ getRunState, target, relativePath, action, existingContent }) {
  const snapshots = getFileSnapshotStore(getRunState);
  const snapshot = snapshots ? snapshots[target] : null;
  if (!snapshot) {
    return null;
  }

  const latestFingerprint = createContentFingerprint(existingContent);
  if (snapshot.fingerprint === latestFingerprint) {
    return null;
  }

  return createToolResult({
    ok: false,
    kind: "file",
    action,
    path: relativePath,
    message:
      `Refusing to ${action} ${relativePath} because it changed since this run last read it. ` +
      "Read the file again and merge with the latest contents before writing.",
    data: {
      staleRead: true,
      previousFingerprint: snapshot.fingerprint,
      latestFingerprint,
      capturedAt: snapshot.capturedAt,
    },
  });
}

function createContentFingerprint(content) {
  if (content === null || content === undefined) {
    return "missing";
  }

  return crypto.createHash("sha1").update(String(content)).digest("hex");
}

async function runSerializedFileMutation(target, run) {
  const previous = mutationQueuesByPath.get(target) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  const queued = previous.then(() => current, () => current);
  mutationQueuesByPath.set(target, queued);

  try {
    await previous.catch(() => {});
    return await run();
  } finally {
    release();
    if (mutationQueuesByPath.get(target) === queued) {
      mutationQueuesByPath.delete(target);
    }
  }
}

module.exports = {
  createFileTools,
};
