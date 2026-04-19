const {
  getHistoryItemCallId,
  isFunctionCallItem,
  isFunctionCallResultItem,
  dropUnpairedToolHistoryItems,
} = require("./history_sanitizer");

const DEFAULT_CONTEXT_BUDGET = {
  maxHistoryItems: 8,
  maxHistoryChars: 12000,
  maxMemoryChars: 2400,
  maxProjectInstructionChars: 2400,
  maxRuntimeGuidanceChars: 800,
  maxEditorContextChars: 2200,
};

const DEFAULT_STORAGE_HISTORY_BUDGET = {
  maxHistoryItems: 80,
  maxHistoryChars: 80000,
};

function limitText(text, maxChars) {
  const value = String(text || "");
  if (!maxChars || value.length <= maxChars) {
    return value;
  }

  const suffix = "\n...[truncated]";
  const sliceLength = Math.max(maxChars - suffix.length, 0);
  return `${value.slice(0, sliceLength)}${suffix}`;
}

function stringifyHistoryItem(item) {
  try {
    return JSON.stringify(item);
  } catch (error) {
    return String(item || "");
  }
}

function budgetHistory(history, budget = DEFAULT_CONTEXT_BUDGET) {
  const items = dropUnpairedToolHistoryItems(Array.isArray(history) ? history : []);
  const maxItems = Math.max(Number(budget.maxHistoryItems) || 0, 1);
  const kept = [];
  let totalChars = 0;
  let scannedItems = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const serialized = stringifyHistoryItem(item);
    const callId = getHistoryItemCallId(item);
    const isResult = isFunctionCallResultItem(item);

    if (isResult && callId) {
      const matchingCallIndex = items.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex < index &&
          isFunctionCallItem(candidate) &&
          getHistoryItemCallId(candidate) === callId
      );
      const matchingCall =
        matchingCallIndex >= 0 ? items[matchingCallIndex] : null;
      const matchingCallSerialized = matchingCall ? stringifyHistoryItem(matchingCall) : "";
      const pairChars = serialized.length + matchingCallSerialized.length;

      if (!matchingCall || totalChars + pairChars > budget.maxHistoryChars) {
        break;
      }

      kept.unshift(item);
      kept.unshift(matchingCall);
      totalChars += pairChars;
      scannedItems += 2;
      index = matchingCallIndex;
      if (scannedItems >= maxItems) {
        break;
      }
      continue;
    }

    if (totalChars + serialized.length > budget.maxHistoryChars) {
      break;
    }

    kept.unshift(item);
    totalChars += serialized.length;
    scannedItems += 1;
    if (scannedItems >= maxItems) {
      break;
    }
  }

  return dropUnpairedToolHistoryItems(kept);
}

function budgetContextSections({
  memoryText,
  projectInstructionsText,
  runtimeGuidanceText,
  editorContext,
  budget = DEFAULT_CONTEXT_BUDGET,
}) {
  return {
    memoryText: limitText(memoryText, budget.maxMemoryChars),
    projectInstructionsText: limitText(
      projectInstructionsText,
      budget.maxProjectInstructionChars
    ),
    runtimeGuidanceText: limitText(
      runtimeGuidanceText,
      budget.maxRuntimeGuidanceChars
    ),
    editorContext: limitText(editorContext, budget.maxEditorContextChars),
  };
}

module.exports = {
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_STORAGE_HISTORY_BUDGET,
  limitText,
  budgetHistory,
  budgetContextSections,
};
