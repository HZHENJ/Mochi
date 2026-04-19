const { createToolResult } = require("./tool_result");

async function runWithApproval({
  approval,
  requestApproval,
  prompt,
  deniedResult,
  fallbackResult,
  run,
}) {
  if (!approval || approval.allowed) {
    return run();
  }

  if (!requestApproval || !approval.approvalRequest) {
    return typeof fallbackResult === "function" ? fallbackResult() : fallbackResult;
  }

  const approved = await requestApproval({
    ...approval.approvalRequest,
    prompt,
  });
  if (approved) {
    return run();
  }

  return typeof deniedResult === "function" ? deniedResult() : deniedResult;
}

function createApprovalDeniedResult({ kind, action, path, message, data = null }) {
  return createToolResult({
    ok: false,
    kind,
    action,
    path,
    message,
    data,
  });
}

module.exports = {
  createApprovalDeniedResult,
  runWithApproval,
};
