const {
  describeToolOutput,
  getStreamToolCallId,
  recordAgentUpdate,
  recordApprovalRequested,
  recordToolCalled,
  recordToolOutput,
} = require("./run_trace_recorder");

function extractTextDelta(event) {
  if (!event || event.type !== "raw_model_stream_event" || !event.data) {
    return "";
  }

  if (event.data.type === "output_text_delta" && typeof event.data.delta === "string") {
    return event.data.delta;
  }

  return "";
}

function mapStreamEventToActivity(event, options = {}) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const getTrace = options.getTrace || (() => null);
  const clearClarificationDraftBeforeTool =
    options.clearClarificationDraftBeforeTool || (() => {});

  if (event.type === "agent_updated_stream_event") {
    const agentName = event.agent && event.agent.name ? event.agent.name : "Agent";
    recordAgentUpdate(getTrace(), agentName);
    return {
      kind: "agent",
      text: `${agentName} is now active.`,
    };
  }

  if (event.type !== "run_item_stream_event") {
    return null;
  }

  const item = event.item || {};
  const rawItem = item.rawItem || {};
  const toolName = rawItem.name || item.name || "tool";

  if (event.name === "tool_called") {
    clearClarificationDraftBeforeTool(toolName);
    recordToolCalled(getTrace(), {
      toolName,
      callId: getStreamToolCallId(item, rawItem),
      args: rawItem.arguments || null,
    });
    return {
      kind: "tool",
      text: `Calling ${toolName}...`,
    };
  }

  if (event.name === "tool_output") {
    const outputText = describeToolOutput(item.output);
    recordToolOutput(getTrace(), {
      toolName,
      callId: getStreamToolCallId(item, rawItem),
      output: item.output,
    });
    return {
      kind: "tool",
      text: outputText ? `${toolName} finished: ${outputText}` : `${toolName} finished.`,
    };
  }

  if (event.name === "tool_approval_requested") {
    recordApprovalRequested(getTrace(), toolName);
    return {
      kind: "approval",
      text: `Waiting for approval before ${toolName} can continue.`,
    };
  }

  if (event.name === "handoff_requested" || event.name === "handoff_occurred") {
    return {
      kind: "agent",
      text: "Switching to a specialized agent...",
    };
  }

  if (event.name === "reasoning_item_created") {
    return {
      kind: "reasoning",
      text: "Evaluating the next step...",
    };
  }

  if (event.name === "message_output_created") {
    return {
      kind: "status",
      text: "Drafting the response...",
    };
  }

  return null;
}

module.exports = {
  extractTextDelta,
  mapStreamEventToActivity,
};
