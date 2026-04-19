function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EXPLICIT_APPROVAL_PATTERNS = [
  /\bi confirm\b/,
  /\bconfirm (delete|overwrite|clear|remove)\b/,
  /\bgo ahead and (delete|overwrite|clear|remove)\b/,
  /\byes,? (delete|overwrite|clear|remove)\b/,
  /\bplease (delete|overwrite|clear|remove)\b/,
  /我确认/,
  /确认(删除|覆盖|清空|移除)/,
  /请直接(删除|覆盖|清空|移除)/,
  /允许(删除|覆盖|清空|移除)/,
  /可以直接(删除|覆盖|清空|移除)/,
];

function hasExplicitDestructiveApproval(prompt) {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return false;
  }

  return EXPLICIT_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildApprovalMessage({ action, relativePath, hint }) {
  return [
    `Approval required before ${action} can modify \`${relativePath}\`.`,
    "Ask the user for explicit confirmation and then retry.",
    hint ||
      'Examples: "我确认删除这个文件", "确认清空这个文件", or "I confirm you can delete this file".',
  ].join(" ");
}

function buildApprovalRequest({ action, relativePath, reason }) {
  return {
    kind: "destructive-file-operation",
    action,
    relativePath,
    reason,
  };
}

function evaluateFileOperationApproval({
  action,
  relativePath,
  prompt,
  targetExists,
  existingContent,
  nextContent,
}) {
  const explicitApproval = hasExplicitDestructiveApproval(prompt);

  if (action === "delete_file") {
    if (!explicitApproval) {
      return {
        allowed: false,
        reason: "explicit-confirmation-required-for-delete",
        approvalRequest: buildApprovalRequest({
          action: "delete_file",
          relativePath,
          reason: "delete-file",
        }),
        message: buildApprovalMessage({
          action: "delete_file",
          relativePath,
        }),
      };
    }

    return {
      allowed: true,
      reason: "delete-confirmed",
    };
  }

  if (action === "delete_dir") {
    if (!explicitApproval) {
      return {
        allowed: false,
        reason: "explicit-confirmation-required-for-directory-delete",
        approvalRequest: buildApprovalRequest({
          action: "delete_dir",
          relativePath,
          reason: "delete-directory",
        }),
        message: buildApprovalMessage({
          action: "delete_dir",
          relativePath,
          hint:
            'Examples: "我确认删除这个文件夹", "确认删除目录", or "I confirm you can delete this folder".',
        }),
      };
    }

    return {
      allowed: true,
      reason: "directory-delete-confirmed",
    };
  }

  if (action === "write_file" && targetExists) {
    const currentText = String(existingContent || "");
    const nextText = String(nextContent || "");
    const isClear = currentText.length > 0 && nextText.length === 0;

    if (isClear && !explicitApproval) {
      return {
        allowed: false,
        reason: "explicit-confirmation-required-for-clear",
        approvalRequest: buildApprovalRequest({
          action: "write_file",
          relativePath,
          reason: "clear-file",
        }),
        message: buildApprovalMessage({
          action: "write_file",
          relativePath,
          hint:
            'Examples: "我确认清空这个文件", "确认覆盖为空内容", or "I confirm you can clear this file".',
        }),
      };
    }
  }

  return {
    allowed: true,
    reason: "not-destructive-or-confirmed",
  };
}

module.exports = {
  hasExplicitDestructiveApproval,
  evaluateFileOperationApproval,
};
