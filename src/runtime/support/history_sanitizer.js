const LEGACY_CONTEXT_MARKERS = [
  "\n\n---\nMemory context",
  "\n\n---\nWorkspace folder:",
  "\n\n---\nEditor context:",
];

function getHistoryItemCallId(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  return item.callId || item.call_id || null;
}

function isFunctionCallItem(item) {
  return Boolean(item && item.type === "function_call");
}

function isFunctionCallResultItem(item) {
  return Boolean(item && item.type === "function_call_result");
}

function stripLegacyInjectedContext(text) {
  const source = String(text || "");
  if (!source) {
    return "";
  }

  let cutoff = source.length;

  for (const marker of LEGACY_CONTEXT_MARKERS) {
    const index = source.indexOf(marker);
    if (index >= 0 && index < cutoff) {
      cutoff = index;
    }
  }

  return source.slice(0, cutoff).trimEnd();
}

function sanitizeHistoryItem(item) {
  if (!item || item.type !== "message" || item.role !== "user" || !Array.isArray(item.content)) {
    return item;
  }

  let changed = false;
  const content = item.content.map((part) => {
    if (!part || typeof part.text !== "string") {
      return part;
    }

    const sanitizedText = stripLegacyInjectedContext(part.text);
    if (sanitizedText === part.text) {
      return part;
    }

    changed = true;
    return {
      ...part,
      text: sanitizedText,
    };
  });

  return changed
    ? {
        ...item,
        content,
      }
    : item;
}

function dropUnpairedToolHistoryItems(history) {
  const items = Array.isArray(history) ? history : [];
  const callIdsWithCalls = new Set();
  const callIdsWithResults = new Set();

  for (const item of items) {
    const callId = getHistoryItemCallId(item);
    if (!callId) {
      continue;
    }

    if (isFunctionCallItem(item)) {
      callIdsWithCalls.add(callId);
    } else if (isFunctionCallResultItem(item)) {
      callIdsWithResults.add(callId);
    }
  }

  return items.filter((item) => {
    const callId = getHistoryItemCallId(item);
    if (!callId) {
      return true;
    }

    if (isFunctionCallItem(item)) {
      return callIdsWithResults.has(callId);
    }

    if (isFunctionCallResultItem(item)) {
      return callIdsWithCalls.has(callId);
    }

    return true;
  });
}

function sanitizeStoredHistory(history) {
  const items = Array.isArray(history) ? history : [];
  const pairedItems = dropUnpairedToolHistoryItems(items);
  let changed = false;
  if (pairedItems.length !== items.length) {
    changed = true;
  }

  const sanitized = pairedItems.map((item) => {
    const nextItem = sanitizeHistoryItem(item);
    if (nextItem !== item) {
      changed = true;
    }
    return nextItem;
  });

  return {
    history: sanitized,
    changed,
  };
}

module.exports = {
  getHistoryItemCallId,
  isFunctionCallItem,
  isFunctionCallResultItem,
  stripLegacyInjectedContext,
  sanitizeHistoryItem,
  dropUnpairedToolHistoryItems,
  sanitizeStoredHistory,
};
