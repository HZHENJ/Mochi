const { extractPromptKeywords, isLikelyFollowUpPrompt, normalizePrompt } = require("./memory_utils");

const WORK_ACTION_TERMS = [
  "add",
  "analyze",
  "append",
  "build",
  "change",
  "create",
  "debug",
  "delete",
  "design",
  "edit",
  "explain",
  "fix",
  "generate",
  "implement",
  "improve",
  "list",
  "make",
  "modify",
  "optimize",
  "read",
  "refactor",
  "remove",
  "rename",
  "replace",
  "review",
  "rewrite",
  "run",
  "summarize",
  "update",
  "write",
  "分析",
  "优化",
  "修改",
  "删除",
  "创建",
  "加上",
  "完善",
  "实现",
  "总结",
  "编写",
  "美化",
  "解释",
  "设计",
  "调整",
  "读取",
  "运行",
  "重写",
  "重构",
  "修",
  "修复",
  "做",
  "写",
  "补上",
  "补充",
  "读",
  "运行",
];

const WORK_DOMAIN_TERMS = [
  "api",
  "app",
  "bug",
  "class",
  "code",
  "component",
  "css",
  "editor",
  "error",
  "file",
  "folder",
  "frontend",
  "function",
  "html",
  "interface",
  "module",
  "page",
  "project",
  "repo",
  "repository",
  "script",
  "selection",
  "style",
  "test",
  "tool",
  "ui",
  "workspace",
  "代码",
  "仓库",
  "前端",
  "函数",
  "工具",
  "工作区",
  "工程",
  "模块",
  "样式",
  "测试",
  "界面",
  "组件",
  "脚本",
  "文件",
  "文件夹",
  "项目",
  "页面",
  "选中",
  "选区",
  "错误",
  "报错",
];

const CONVERSATION_TERMS = [
  "bye",
  "hello",
  "hey",
  "hi",
  "thanks",
  "who are you",
  "why",
  "在吗",
  "好",
  "好的",
  "哈哈",
  "嗨",
  "在不在",
  "忘记",
  "怎么了",
  "您好",
  "是谁",
  "记得",
  "谢谢",
  "辛苦",
];

function countMatchedTerms(text, terms) {
  if (!text) {
    return 0;
  }

  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function classifyTurn({ prompt, currentTask }) {
  const normalized = normalizePrompt(prompt);
  const keywords = extractPromptKeywords(prompt);
  const hasCurrentTask = Boolean(currentTask);
  const followUpDetected = isLikelyFollowUpPrompt(prompt);
  const workActionScore = countMatchedTerms(normalized, WORK_ACTION_TERMS);
  const workDomainScore = countMatchedTerms(normalized, WORK_DOMAIN_TERMS);
  const conversationScore = countMatchedTerms(normalized, CONVERSATION_TERMS);
  const promptLength = normalized.length;

  const diagnostics = {
    promptLength,
    keywordCount: keywords.length,
    hasCurrentTask,
    followUpDetected,
    workActionScore,
    workDomainScore,
    conversationScore,
  };

  if (!normalized) {
    return {
      kind: "conversation",
      reason: "empty-turn",
      diagnostics,
    };
  }

  if (workActionScore > 0) {
    return {
      kind: "work",
      reason: "work-action-signal",
      diagnostics,
    };
  }

  if (workDomainScore >= 2) {
    return {
      kind: "work",
      reason: "strong-work-domain-signal",
      diagnostics,
    };
  }

  if (followUpDetected && hasCurrentTask && conversationScore === 0) {
    return {
      kind: "work",
      reason: "follow-up-to-active-work-item",
      diagnostics,
    };
  }

  if (conversationScore > 0 && workDomainScore === 0) {
    return {
      kind: "conversation",
      reason: "conversation-signal",
      diagnostics,
    };
  }

  if (promptLength <= 16 && workActionScore === 0 && workDomainScore === 0) {
    return {
      kind: "conversation",
      reason: "short-non-work-turn",
      diagnostics,
    };
  }

  if (workDomainScore > 0) {
    return {
      kind: "work",
      reason: "work-domain-signal",
      diagnostics,
    };
  }

  return {
    kind: hasCurrentTask ? "conversation" : "work",
    reason: hasCurrentTask ? "default-conversation-turn" : "default-work-turn",
    diagnostics,
  };
}

module.exports = {
  classifyTurn,
};
