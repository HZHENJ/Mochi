const CLARIFICATION_PATTERNS = [
  /请(确认|问|告诉|补充|选择|提供)/,
  /确认一下/,
  /是否(需要|要|确认|可以)/,
  /需要.*吗/,
  /要不要/,
  /你想/,
  /你希望/,
  /please confirm/i,
  /could you (confirm|provide|clarify|choose)/i,
  /would you like/i,
  /do you want/i,
  /which .* would you/i,
  /what .* would you/i,
];

function looksLikeClarification(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }

  return CLARIFICATION_PATTERNS.some((pattern) => pattern.test(value));
}

function removeClarificationBeforeToolExecution(history) {
  const items = Array.isArray(history) ? history : [];
  const filtered = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (
      isAssistantMessage(item) &&
      looksLikeClarification(extractMessageText(item)) &&
      hasFollowingToolCallBeforeNextUser(items, index + 1)
    ) {
      continue;
    }

    filtered.push(item);
  }

  return filtered;
}

function hasFollowingToolCallBeforeNextUser(items, startIndex) {
  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index];
    if (item && item.type === "message" && item.role === "user") {
      return false;
    }
    if (item && item.type === "function_call") {
      return true;
    }
  }

  return false;
}

function isAssistantMessage(item) {
  return item && item.type === "message" && item.role === "assistant";
}

function extractMessageText(item) {
  if (!item || !Array.isArray(item.content)) {
    return "";
  }

  return item.content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  looksLikeClarification,
  removeClarificationBeforeToolExecution,
};
