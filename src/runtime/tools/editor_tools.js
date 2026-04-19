const { createToolResult, truncateText } = require("./tool_result");

function createEditorTools({ sdk, zod, getEditorContext }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "get_editor_context",
      description: "Return the current editor file path and selection or visible file content snapshot.",
      parameters: z.object({}),
      execute: async () => {
        const context = getEditorContext() || "";
        if (!context) {
          return createToolResult({
            ok: false,
            kind: "editor",
            action: "get_editor_context",
            message: "No active editor context is available.",
          });
        }

        return createToolResult({
          ok: true,
          kind: "editor",
          action: "get_editor_context",
          message: "Read active editor context.",
          summary: "Read active editor context.",
          data: {
            context,
            preview: truncateText(context, 600),
          },
        });
      },
    }),
  ];
}

module.exports = {
  createEditorTools,
};
