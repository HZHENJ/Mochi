const fs = require("fs");
const { requireWorkspaceRoot, resolveWorkspacePath } = require("./workspace_context");
const { createToolResult } = require("./tool_result");

function createWorkspaceTools({ sdk, zod, getWorkspaceRoot }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "get_workspace_root",
      description: "Return the active VS Code workspace folder path.",
      parameters: z.object({}),
      execute: async () => {
        const root = getWorkspaceRoot();
        if (!root) {
          return createToolResult({
            ok: false,
            kind: "workspace",
            action: "get_workspace_root",
            message: "No workspace folder is currently selected.",
          });
        }

        return createToolResult({
          ok: true,
          kind: "workspace",
          action: "get_workspace_root",
          path: root,
          message: root,
          summary: `Workspace root: ${root}`,
          data: {
            root,
          },
        });
      },
    }),
    tool({
      name: "list_files",
      description: "List files and folders under a workspace-relative directory.",
      parameters: z.object({
        relativePath: z.string().default("."),
        maxEntries: z.number().int().min(1).max(1000).default(200),
      }),
      execute: async ({ relativePath = ".", maxEntries = 200 }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "workspace",
            action: "list_files",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }
        if (!stat.isDirectory()) {
          return createToolResult({
            ok: false,
            kind: "workspace",
            action: "list_files",
            path: relativePath,
            message: `Not a directory: ${relativePath}`,
          });
        }

        const entries = await fs.promises.readdir(target, { withFileTypes: true });
        const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
        const limited = sorted.slice(0, Math.max(1, Math.min(maxEntries, 1000)));
        const lines = limited.map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`);

        if (sorted.length > limited.length) {
          lines.push(`... truncated ${sorted.length - limited.length} more entries`);
        }

        const text = lines.join("\n") || "(empty directory)";
        return createToolResult({
          ok: true,
          kind: "workspace",
          action: "list_files",
          path: relativePath,
          message: `Listed ${relativePath}`,
          summary: `Listed ${relativePath}`,
          data: {
            entries: limited.map((entry) => ({
              name: entry.name,
              isDirectory: entry.isDirectory(),
            })),
            text,
          },
        });
      },
    }),
  ];
}

module.exports = {
  createWorkspaceTools,
};
