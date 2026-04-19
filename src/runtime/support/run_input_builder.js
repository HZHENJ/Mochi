const {
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_STORAGE_HISTORY_BUDGET,
  budgetContextSections,
  budgetHistory,
} = require("./context_budget");
const { sanitizeStoredHistory } = require("./history_sanitizer");
const { removeClarificationBeforeToolExecution } = require("./clarification_gate");

function buildRunInput({
  sdk,
  prompt,
  options = {},
  history = [],
  memoryText = "",
  projectInstructionsText = "",
  runtimeGuidanceText = "",
  getWorkspaceRoot = () => "",
  getEditorContext = () => "",
  contextBudget = DEFAULT_CONTEXT_BUDGET,
}) {
  const workspaceRoot = getWorkspaceRoot();
  const includeEditorContext = options.includeEditorContext !== false;
  const editorContext = includeEditorContext ? getEditorContext() : "";
  const sanitizedHistory = sanitizeStoredHistory(history).history;
  const budgetedHistory = budgetHistory(sanitizedHistory, contextBudget);
  const budgetedSections = budgetContextSections({
    memoryText,
    projectInstructionsText,
    runtimeGuidanceText,
    editorContext,
    budget: contextBudget,
  });
  const input = [...budgetedHistory];

  if (budgetedSections.projectInstructionsText) {
    input.push(sdk.system(budgetedSections.projectInstructionsText));
  }

  if (budgetedSections.memoryText) {
    input.push(sdk.system(budgetedSections.memoryText));
  }

  if (budgetedSections.runtimeGuidanceText) {
    input.push(sdk.system(budgetedSections.runtimeGuidanceText));
  }

  if (workspaceRoot) {
    input.push(sdk.system(`Workspace folder: ${workspaceRoot}`));
  }

  if (budgetedSections.editorContext) {
    input.push(sdk.system(`Editor context:\n${budgetedSections.editorContext}`));
  }

  input.push(sdk.user(prompt));
  return input;
}

function slimHistoryForStorage(history, storageBudget = DEFAULT_STORAGE_HISTORY_BUDGET) {
  const items = Array.isArray(history) ? history : [];
  const persistedItems = items.filter(
    (item) => !(item && item.type === "message" && item.role === "system")
  );
  const repairedItems = removeClarificationBeforeToolExecution(persistedItems);
  const sanitizedHistory = sanitizeStoredHistory(repairedItems).history;
  return budgetHistory(sanitizedHistory, storageBudget);
}

module.exports = {
  buildRunInput,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_STORAGE_HISTORY_BUDGET,
  slimHistoryForStorage,
};
