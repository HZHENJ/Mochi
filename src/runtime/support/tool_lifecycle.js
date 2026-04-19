const DESTRUCTIVE_TOOL_NAMES = new Set([
  "delete_file",
  "delete_dir",
]);

const MUTATING_TOOL_NAMES = new Set([
  "write_file",
  "append_file",
  "make_dir",
  "delete_file",
  "delete_dir",
]);

function wrapToolsWithLifecycle(tools, options = {}) {
  const items = Array.isArray(tools) ? tools : [];
  const getRunState = options.getRunState || (() => null);
  const requestToolAccess = options.requestToolAccess || null;

  return items.map((tool) => wrapToolWithLifecycle(tool, { getRunState, requestToolAccess }));
}

function wrapToolWithLifecycle(tool, { getRunState, requestToolAccess }) {
  if (!tool || typeof tool.execute !== "function") {
    return tool;
  }

  const originalExecute = tool.execute;
  const toolName = tool.name || "tool";

  return {
    ...tool,
    execute: async (args, context) => {
      const runState = getRunState ? getRunState() : null;
      const preEvent = createPreToolUseEvent(toolName, args, runState);
      recordLifecycleEvent(runState, preEvent);
      const access = requestToolAccess
        ? requestToolAccess(toolName, args)
        : { allowed: true };

      if (access && access.allowed === false) {
        const blockedOutput = createToolBlockedOutput(toolName, args, access);
        recordLifecycleEvent(runState, createPostToolUseEvent(toolName, args, blockedOutput, null, runState));
        return blockedOutput;
      }

      try {
        const output = await originalExecute(args, context);
        recordLifecycleEvent(runState, createPostToolUseEvent(toolName, args, output, null, runState));
        return output;
      } catch (error) {
        recordLifecycleEvent(runState, createPostToolUseEvent(toolName, args, null, error, runState));
        throw error;
      }
    },
  };
}

function createToolBlockedOutput(toolName, args, access) {
  return {
    ok: false,
    kind: classifyTool(toolName),
    action: toolName,
    path: args && typeof args.relativePath === "string"
      ? args.relativePath
      : args && typeof args.cwd === "string"
        ? args.cwd
        : "",
    message:
      access && access.message
        ? access.message
        : "Tool use is temporarily blocked because another session is using tools.",
    summary:
      access && access.message
        ? access.message
        : "Tool use is temporarily blocked because another session is using tools.",
    data: {
      blockedByToolRun: true,
    },
  };
}

function createPreToolUseEvent(toolName, args, runState = null) {
  const category = classifyTool(toolName);
  const risk = classifyToolRisk(toolName, args);
  return {
    phase: "preToolUse",
    tool: toolName,
    baseSessionId: runState && runState.baseSessionId ? runState.baseSessionId : "",
    category,
    risk,
    at: new Date().toISOString(),
    args: sanitizeArgs(args),
    policy: evaluatePreToolPolicy(toolName, args, { category, risk }),
  };
}

function createPostToolUseEvent(toolName, args, output, error, runState = null) {
  const category = classifyTool(toolName);
  const risk = classifyToolRisk(toolName, args);
  const ok = error ? false : inferOutputOk(output);
  return {
    phase: "postToolUse",
    tool: toolName,
    baseSessionId: runState && runState.baseSessionId ? runState.baseSessionId : "",
    category,
    risk,
    at: new Date().toISOString(),
    ok,
    message: error ? error.message || String(error) : inferOutputMessage(output),
    policy: evaluatePostToolPolicy(toolName, output, error, { category, risk, ok }),
  };
}

function recordRunStop(trace) {
  if (!trace) {
    return null;
  }

  const lifecycleEvents = Array.isArray(trace.lifecycleEvents) ? trace.lifecycleEvents : [];
  const recordedPreToolEvents = lifecycleEvents.filter((event) => event.phase === "preToolUse");
  const recordedPostToolEvents = lifecycleEvents.filter((event) => event.phase === "postToolUse");
  const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
  const preToolEvents = recordedPreToolEvents.length
    ? recordedPreToolEvents
    : toolCalls.map(createFallbackPreToolUseEvent);
  const postToolEvents = recordedPostToolEvents.length
    ? recordedPostToolEvents
    : toolCalls.map(createFallbackPostToolUseEvent);
  const highRiskEvents = preToolEvents.filter((event) => event.risk === "high");
  const failedPostEvents = postToolEvents.filter((event) => event.ok === false);
  const approvalRequiredEvents = preToolEvents.filter(
    (event) => event.policy && event.policy.requiresApproval
  );
  const approvalDeniedEvents = postToolEvents.filter(
    (event) => event.policy && event.policy.approvalDenied
  );
  const mutationEvents = preToolEvents.filter(
    (event) => event.policy && event.policy.mutatesWorkspace
  );

  trace.lifecycle = {
    toolUseCount: preToolEvents.length,
    highRiskToolUseCount: highRiskEvents.length,
    mutationToolUseCount: mutationEvents.length,
    approvalRequiredToolUseCount: approvalRequiredEvents.length,
    approvalDeniedToolUseCount: approvalDeniedEvents.length,
    failedToolUseCount: failedPostEvents.length,
    verificationStatus:
      trace.verification && trace.verification.status ? trace.verification.status : "unknown",
    stoppedAt: new Date().toISOString(),
  };

  return trace.lifecycle;
}

function createFallbackPreToolUseEvent(toolCall) {
  const toolName = toolCall && toolCall.name ? toolCall.name : "tool";
  const args = parseToolArgs(toolCall && toolCall.args);
  const action = getToolAction(toolCall);
  const category = classifyTool(toolName);
  const risk = classifyToolRisk(action || toolName, args);
  return {
    phase: "preToolUse",
    tool: toolName,
    category,
    risk,
    policy: evaluatePreToolPolicy(action || toolName, args, { category, risk }),
  };
}

function createFallbackPostToolUseEvent(toolCall) {
  const toolName = toolCall && toolCall.name ? toolCall.name : "tool";
  const action = getToolAction(toolCall);
  const output = toolCall && toolCall.output ? toolCall.output : null;
  const ok =
    output && typeof output.ok === "boolean"
      ? output.ok
      : toolCall && toolCall.status
        ? toolCall.status !== "failed"
        : true;
  const risk = classifyToolRisk(action || toolName, parseToolArgs(toolCall && toolCall.args));
  return {
    phase: "postToolUse",
    tool: toolName,
    risk,
    ok,
    policy: evaluatePostToolPolicy(action || toolName, output, null, { risk, ok }),
  };
}

function getToolAction(toolCall) {
  if (toolCall && toolCall.output && typeof toolCall.output.action === "string" && toolCall.output.action) {
    return toolCall.output.action;
  }

  return toolCall && typeof toolCall.name === "string" ? toolCall.name : "";
}

function parseToolArgs(args) {
  if (!args) {
    return null;
  }

  if (typeof args === "object") {
    return args;
  }

  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch (error) {
      return null;
    }
  }

  return null;
}

function recordLifecycleEvent(runState, event) {
  const trace = runState && runState.trace ? runState.trace : null;
  if (!trace || !event) {
    return;
  }

  if (!Array.isArray(trace.lifecycleEvents)) {
    trace.lifecycleEvents = [];
  }

  trace.lifecycleEvents.push(event);
}

function classifyTool(toolName) {
  if (toolName === "run_command") {
    return "command";
  }

  if (toolName === "get_editor_context") {
    return "editor";
  }

  if (toolName === "get_workspace_root" || toolName === "list_files") {
    return "workspace";
  }

  return "file";
}

function classifyToolRisk(toolName, args) {
  if (DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return "high";
  }

  if (toolName === "run_command") {
    return "medium";
  }

  if (toolName === "write_file" && args && typeof args.content === "string" && args.content.length === 0) {
    return "high";
  }

  if (MUTATING_TOOL_NAMES.has(toolName)) {
    return "medium";
  }

  return "low";
}

function evaluatePreToolPolicy(toolName, args, { category, risk }) {
  const mutatesWorkspace = MUTATING_TOOL_NAMES.has(toolName);
  const requiresApproval = risk === "high" || toolName === "run_command";
  const requiresVerification = mutatesWorkspace;

  return {
    decision: "observe",
    category,
    risk,
    mutatesWorkspace,
    requiresApproval,
    requiresVerification,
    reason: getPolicyReason(toolName, args, { mutatesWorkspace, requiresApproval }),
  };
}

function evaluatePostToolPolicy(toolName, output, error, { risk, ok }) {
  const mutatesWorkspace = MUTATING_TOOL_NAMES.has(toolName);
  const approvalDenied = isApprovalDeniedOutput(output, error);

  return {
    decision: approvalDenied ? "denied" : ok ? "completed" : "failed",
    risk,
    mutatesWorkspace,
    approvalDenied,
    requiresVerification: mutatesWorkspace && ok,
  };
}

function getPolicyReason(toolName, args, { mutatesWorkspace, requiresApproval }) {
  if (toolName === "run_command") {
    return "command-execution-is-user-gated";
  }

  if (DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return "destructive-workspace-operation";
  }

  if (toolName === "write_file" && args && typeof args.content === "string" && args.content.length === 0) {
    return "clearing-existing-files-can-be-destructive";
  }

  if (mutatesWorkspace) {
    return requiresApproval ? "workspace-mutation-requires-approval" : "workspace-mutation";
  }

  return "read-only-tool";
}

function isApprovalDeniedOutput(output, error) {
  if (error) {
    return false;
  }

  if (!output || typeof output !== "object") {
    return false;
  }

  if (output.data && output.data.notRun) {
    return true;
  }

  const message = `${output.message || ""} ${output.summary || ""}`.toLowerCase();
  return /user denied|approval required|not approved|permission denied/.test(message);
}

function sanitizeArgs(args) {
  if (!args || typeof args !== "object") {
    return null;
  }

  const result = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "content") {
      result.contentBytes = Buffer.byteLength(String(value || ""), "utf8");
      continue;
    }

    result[key] = value;
  }

  return result;
}

function inferOutputOk(output) {
  if (output && typeof output === "object" && typeof output.ok === "boolean") {
    return output.ok;
  }

  return true;
}

function inferOutputMessage(output) {
  if (output && typeof output === "object") {
    return output.summary || output.message || "";
  }

  return typeof output === "string" ? output : "";
}

module.exports = {
  recordRunStop,
  wrapToolsWithLifecycle,
};
