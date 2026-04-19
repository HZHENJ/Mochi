function createToolResult({
  ok,
  action,
  path = "",
  kind = "workspace",
  message = "",
  summary = "",
  data = null,
}) {
  return {
    ok: Boolean(ok),
    kind,
    action,
    path,
    message,
    summary: summary || message,
    data,
  };
}

function truncateText(value, maxLength = 400) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 15))}...[truncated]`;
}

module.exports = {
  createToolResult,
  truncateText,
};
