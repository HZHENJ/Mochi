const { createToolResult, truncateText } = require("./tool_result");

const SUBAGENT_ROLES = {
  repo_guide: {
    label: "Repo Guide",
    description:
      "Use for read-only repository exploration, codebase orientation, file/location discovery, and architecture explanations.",
  },
  coding: {
    label: "Coding Agent",
    description:
      "Use for implementation, debugging, refactoring, and focused code changes after the task is clear.",
  },
  plan_reviewer: {
    label: "Plan Reviewer",
    description:
      "Use to validate an implementation plan, architecture proposal, or multi-step strategy before code is changed.",
  },
  review: {
    label: "Review Agent",
    description:
      "Use to review completed or proposed changes for bugs, regressions, missing tests, and risky behavior.",
  },
};

function createSubagentTools({ sdk, zod, getSubAgents, runSubAgent }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "run_subagent",
      description:
        "Delegate a bounded task to a specialized Mochi subagent and return its result to the root agent. Use this for complex exploration, planning review, implementation, or code review work; keep the task concrete and scoped.",
      parameters: z.object({
        agent: z.enum(Object.keys(SUBAGENT_ROLES)),
        task: z.string().min(1),
        context: z.string().default(""),
      }),
      execute: async ({ agent, task, context = "" }) => {
        const subAgents = getSubAgents ? getSubAgents() : {};
        const subAgent = subAgents ? subAgents[agent] : null;
        const role = SUBAGENT_ROLES[agent];

        if (!subAgent || !role) {
          return createToolResult({
            ok: false,
            kind: "agent",
            action: "run_subagent",
            message: `Unknown subagent: ${agent}`,
            data: {
              availableAgents: Object.keys(SUBAGENT_ROLES),
            },
          });
        }

        if (typeof runSubAgent !== "function") {
          return createToolResult({
            ok: false,
            kind: "agent",
            action: "run_subagent",
            message: "Subagent runner is not configured.",
          });
        }

        const result = await runSubAgent({
          agentKey: agent,
          agentName: role.label,
          agent: subAgent,
          task,
          context,
        });
        const output =
          result && typeof result === "object" && typeof result.output === "string"
            ? result.output
            : String(result || "");
        const evidence =
          result && typeof result === "object" && result.evidence
            ? result.evidence
            : null;
        const text = truncateText(output, 8000);

        return createToolResult({
          ok: true,
          kind: "agent",
          action: "run_subagent",
          message: `${role.label} completed the delegated task.`,
          summary: `${role.label}: ${truncateText(text, 600)}`,
          data: {
            agent,
            agentName: role.label,
            task,
            output: text,
            evidence,
            truncated: output.length > text.length,
          },
        });
      },
    }),
  ];
}

module.exports = {
  createSubagentTools,
  SUBAGENT_ROLES,
};
