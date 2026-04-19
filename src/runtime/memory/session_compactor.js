const { dropUnpairedToolHistoryItems } = require("../support/history_sanitizer");
const { limitText } = require("../support/context_budget");
const { nowIso } = require("./memory_utils");

const DEFAULT_SESSION_COMPACTION_POLICY = {
  compactWhenHistoryItemsOver: 60,
  keepRecentHistoryItems: 24,
  maxSessionSummaryChars: 3000,
  maxCompactedItemChars: 220,
};

function compactSessionHistory(session, policy = DEFAULT_SESSION_COMPACTION_POLICY) {
  if (!session || !Array.isArray(session.history)) {
    return {
      changed: false,
      session,
    };
  }

  const settings = {
    ...DEFAULT_SESSION_COMPACTION_POLICY,
    ...(policy || {}),
  };
  const history = dropUnpairedToolHistoryItems(session.history);
  const threshold = Math.max(Number(settings.compactWhenHistoryItemsOver) || 0, 1);

  if (history.length <= threshold) {
    session.history = history;
    session.messageCount = history.length;
    return {
      changed: false,
      session,
    };
  }

  const keepRecent = Math.max(Number(settings.keepRecentHistoryItems) || 0, 1);
  const boundary = findCompactionBoundary(history, keepRecent);
  const compactedItems = history.slice(0, boundary);
  const recentHistory = dropUnpairedToolHistoryItems(history.slice(boundary));

  if (!compactedItems.length || !recentHistory.length) {
    session.history = history;
    session.messageCount = history.length;
    return {
      changed: false,
      session,
    };
  }

  const previousSummary = normalizeSummary(session.summary);
  const nextSummary = buildSessionSummary({
    previousSummary,
    compactedItems,
    maxChars: settings.maxSessionSummaryChars,
    maxItemChars: settings.maxCompactedItemChars,
  });
  const compactedAt = nowIso();

  session.summary = nextSummary;
  session.summaryUpdatedAt = compactedAt;
  session.compactedAt = compactedAt;
  session.compaction = {
    compactedAt,
    compactedItemCount: (session.compaction && session.compaction.compactedItemCount || 0) +
      compactedItems.length,
    recentItemCount: recentHistory.length,
    policy: {
      compactWhenHistoryItemsOver: threshold,
      keepRecentHistoryItems: keepRecent,
      maxSessionSummaryChars: settings.maxSessionSummaryChars,
    },
  };
  session.history = recentHistory;
  session.messageCount = recentHistory.length;

  return {
    changed: true,
    session,
    compactedItems,
  };
}

function findCompactionBoundary(history, keepRecent) {
  const items = Array.isArray(history) ? history : [];
  let boundary = Math.max(items.length - keepRecent, 0);

  while (
    boundary > 0 &&
    boundary < items.length &&
    isToolResult(items[boundary]) &&
    isToolCall(items[boundary - 1])
  ) {
    boundary -= 1;
  }

  while (
    boundary > 0 &&
    boundary < items.length &&
    isToolCall(items[boundary]) &&
    isToolResult(items[boundary - 1])
  ) {
    boundary -= 1;
  }

  return boundary;
}

function buildSessionSummary({ previousSummary, compactedItems, maxChars, maxItemChars }) {
  const lines = [];
  if (previousSummary) {
    lines.push(previousSummary);
  }

  const itemLines = summarizeHistoryItems(compactedItems, maxItemChars);
  if (itemLines.length) {
    lines.push("Compacted earlier conversation:");
    lines.push(...itemLines.map((line) => `- ${line}`));
  }

  return limitText(lines.join("\n"), maxChars).trim();
}

function summarizeHistoryItems(items, maxItemChars) {
  const lines = [];

  for (const item of items) {
    const line = summarizeHistoryItem(item, maxItemChars);
    if (line) {
      lines.push(line);
    }
  }

  return lines;
}

function summarizeHistoryItem(item, maxItemChars) {
  if (!item || typeof item !== "object") {
    return "";
  }

  if (item.type === "message") {
    const text = extractMessageText(item);
    if (!text) {
      return "";
    }
    const role = item.role === "assistant" ? "Assistant" : item.role === "user" ? "User" : item.role || "Message";
    return `${role}: ${limitText(collapseWhitespace(text), maxItemChars)}`;
  }

  if (item.type === "function_call") {
    return `Tool call: ${item.name || item.toolName || "tool"}`;
  }

  if (item.type === "function_call_result") {
    const output = summarizeToolOutput(item.output);
    return output ? `Tool result: ${limitText(output, maxItemChars)}` : "Tool result recorded.";
  }

  return "";
}

function summarizeToolOutput(output) {
  if (!output) {
    return "";
  }

  if (typeof output === "string") {
    return collapseWhitespace(output);
  }

  if (typeof output === "object") {
    if (typeof output.summary === "string" && output.summary) {
      return collapseWhitespace(output.summary);
    }
    if (typeof output.message === "string" && output.message) {
      return collapseWhitespace(output.message);
    }
    if (output.data && typeof output.data === "object") {
      if (typeof output.data.preview === "string" && output.data.preview) {
        return collapseWhitespace(output.data.preview);
      }
      if (typeof output.data.stdoutPreview === "string" && output.data.stdoutPreview) {
        return collapseWhitespace(output.data.stdoutPreview);
      }
    }
  }

  return "";
}

function extractMessageText(item) {
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      if (typeof part.input_text === "string") {
        return part.input_text;
      }
      if (typeof part.output_text === "string") {
        return part.output_text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeSummary(summary) {
  return String(summary || "").trim();
}

function collapseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isToolCall(item) {
  return Boolean(item && item.type === "function_call");
}

function isToolResult(item) {
  return Boolean(item && item.type === "function_call_result");
}

module.exports = {
  DEFAULT_SESSION_COMPACTION_POLICY,
  compactSessionHistory,
};
