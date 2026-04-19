const EXPLORATION_SIGNALS = [
  "architecture",
  "architectural",
  "structure",
  "overview",
  "map",
  "trace",
  "analyze",
  "investigate",
  "where",
  "which files",
  "code path",
  "梳理",
  "架构",
  "结构",
  "摸排",
  "分析",
  "看看",
  "审视",
  "定位",
  "哪些文件",
  "代码路径",
];

const CODING_SIGNALS = [
  "implement",
  "fix",
  "debug",
  "refactor",
  "change",
  "modify",
  "add",
  "build",
  "delete",
  "remove",
  "update",
  "write",
  "edit",
  "实现",
  "修复",
  "调试",
  "重构",
  "修改",
  "新增",
  "添加",
  "删除",
  "更新",
  "改",
  "改一下",
  "做一下",
];

const COMPLEXITY_SIGNALS = [
  "complex",
  "multi-file",
  "multiple files",
  "pipeline",
  "workflow",
  "lifecycle",
  "agent",
  "tool",
  "runtime",
  "memory",
  "session",
  "task",
  "file",
  "code",
  "机制",
  "流程",
  "生命周期",
  "工具",
  "记忆",
  "会话",
  "任务",
  "文件",
  "代码",
  "相关",
  "复杂",
  "多文件",
  "完整",
  "整体",
  "系统",
];

const PLAN_REVIEW_SIGNALS = [
  "plan review",
  "review the plan",
  "validate the plan",
  "方案检查",
  "检查方案",
  "审查方案",
  "验证方案",
  "看看方案",
];

const REVIEW_SIGNALS = [
  "code review",
  "review changes",
  "review diff",
  "review",
  "audit",
  "regression",
  "risk",
  "检查改动",
  "审查改动",
  "代码审查",
  "风险",
  "回归",
];

function classifyDelegation(prompt) {
  const text = String(prompt || "").toLowerCase();
  const explorationScore = scoreSignals(text, EXPLORATION_SIGNALS);
  const codingScore = scoreSignals(text, CODING_SIGNALS);
  const complexityScore = scoreSignals(text, COMPLEXITY_SIGNALS);
  const planReviewScore = scoreSignals(text, PLAN_REVIEW_SIGNALS);
  const reviewScore = scoreSignals(text, REVIEW_SIGNALS);
  const isLongPrompt = text.length >= 120;
  const isShortPrompt = text.length <= 24;
  const shouldDelegate =
    planReviewScore > 0 ||
    reviewScore > 0 ||
    (!isShortPrompt &&
    (
      complexityScore >= 2 ||
      (isLongPrompt && (explorationScore > 0 || codingScore > 0 || complexityScore > 0)) ||
    explorationScore >= 2 ||
      (codingScore >= 2 && (complexityScore > 0 || isLongPrompt)) ||
      (explorationScore > 0 && codingScore > 0 && complexityScore > 0)
    ));

  if (!shouldDelegate) {
    return {
      route: "direct",
      suggestedAgent: "",
      confidence: "low",
      reason: "The request appears small enough for the root agent to handle directly.",
    };
  }

  if (planReviewScore > 0) {
    return {
      route: "subagent",
      suggestedAgent: "plan_reviewer",
      confidence: "high",
      reason:
        "The request explicitly asks to validate or review an implementation plan before editing.",
    };
  }

  if (reviewScore > 0) {
    return {
      route: "subagent",
      suggestedAgent: "review",
      confidence: complexityScore > 0 || isLongPrompt ? "high" : "medium",
      reason:
        "The request appears to ask for code review, regression checking, or risk analysis.",
    };
  }

  if (codingScore > explorationScore) {
    return {
      route: "subagent",
      suggestedAgent: "coding",
      confidence: complexityScore >= 2 || isLongPrompt ? "high" : "medium",
      reason:
        "The request appears to involve complex implementation, debugging, refactoring, or workspace edits.",
    };
  }

  return {
    route: "subagent",
    suggestedAgent: "repo_guide",
    confidence: complexityScore >= 2 || isLongPrompt ? "high" : "medium",
    reason:
      "The request appears to benefit from repository exploration or architecture mapping before answering.",
  };
}

function buildDelegationGuidance(policy) {
  if (!policy || policy.route !== "subagent" || !policy.suggestedAgent) {
    return "";
  }

  return [
    "Runtime delegation guidance:",
    `- Suggested subagent: ${policy.suggestedAgent}`,
    `- Confidence: ${policy.confidence}`,
    `- Reason: ${policy.reason}`,
    "- This is a suggestion, not a requirement.",
    "- Prefer direct workspace tools when the task can be handled by reading or editing one or two files.",
    "- Call run_subagent only when delegation will materially reduce uncertainty or improve the result.",
  ].join("\n");
}

function scoreSignals(text, signals) {
  return signals.reduce((count, signal) => {
    return text.includes(signal.toLowerCase()) ? count + 1 : count;
  }, 0);
}

module.exports = {
  classifyDelegation,
  buildDelegationGuidance,
};
