const vscode = require("vscode");
const { ChatController } = require("./chat_controller");
const { OpenAIAgentsRuntime } = require("../runtime/openai_agents_runtime");
const { createCompactMemorySnapshot } = require("../runtime/support/compact_snapshot");
const { getWebviewHtml } = require("./webview_html");

const CHAT_VIEW_ID = "localAgent.chatView";

let chatView = null;
let lastReply = "";
let targetWorkspaceFolder = "";
let pendingPrefill = "";
let pendingReplies = [];
let pendingApprovals = [];
let pendingActivities = [];
let pendingReplyStream = "";
let activeBaseSessionId = "mochi-chat";
const pendingApprovalResolvers = new Map();
let chatController = null;

function activate(context) {
  activeBaseSessionId = context.globalState.get("localAgent.activeBaseSessionId", "mochi-chat");
  const runtime = new OpenAIAgentsRuntime({
    getWorkspaceRoot: getTargetWorkspaceFolder,
    getEditorContext,
    requestApproval: requestToolApproval,
    onActivity: (activity) => {
      if (chatController) {
        chatController.handleRuntimeActivity(activity);
        return;
      }
      pendingActivities = [...pendingActivities, activity];
    },
    onTextDelta: (event) => {
      const delta = event && event.delta ? event.delta : "";
      if (!delta) {
        return;
      }

      if (chatController) {
        chatController.handleRuntimeReplyDelta(event);
        return;
      }

      pendingReplyStream += delta;
    },
    onReplyControl: (control) => {
      if (chatController) {
        chatController.handleRuntimeReplyControl(control);
        return;
      }

      if (control && control.type === "clear_stream") {
        pendingReplyStream = "";
      }
    },
    memoryStorageRoot: context.globalStorageUri.fsPath,
    baseSessionId: activeBaseSessionId,
  });

  chatController = new ChatController({
    vscode,
    runtime,
    getWorkspaceDescription: describeWorkspaceTarget,
    getEditorContext,
    openChatView,
    postToChatView,
    getLastReply: () => lastReply,
    setLastReply: (value) => {
      lastReply = value;
    },
    getPendingPrefill: () => pendingPrefill,
    setPendingPrefill: (value) => {
      pendingPrefill = value;
    },
    getPendingReplies: () => pendingReplies,
    setPendingReplies: (value) => {
      pendingReplies = value;
    },
    getPendingApprovals: () => pendingApprovals,
    setPendingApprovals: (value) => {
      pendingApprovals = value;
    },
    resolveApprovalDecision,
    getPendingActivities: () => pendingActivities,
    setPendingActivities: (value) => {
      pendingActivities = value;
    },
    getPendingReplyStream: () => pendingReplyStream,
    setPendingReplyStream: (value) => {
      pendingReplyStream = value;
    },
    getSessionLabel: () => activeBaseSessionId,
    createNewSession: async () => {
      await createNewChatSession(context, runtime);
    },
    switchSession: async (baseSessionId) => {
      await switchChatSession(context, runtime, baseSessionId);
    },
    deleteSession: async (baseSessionId) => {
      await deleteChatSession(context, runtime, baseSessionId);
    },
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CHAT_VIEW_ID, {
      resolveWebviewView(webviewView) {
        chatView = webviewView;
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        };
        const logoUri = webviewView.webview.asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, "media", "mochi_logo.svg")
        );
        webviewView.webview.html = getWebviewHtml({
          logoUri: String(logoUri),
        });

        setTimeout(() => {
          chatController.flushPendingUiState().catch((error) => {
            vscode.window.showErrorMessage(error.message || String(error));
          });
        }, 50);

        webviewView.webview.onDidReceiveMessage(
          async (message) => {
            await chatController.handleWebviewMessage(message);
          },
          undefined,
          context.subscriptions
        );

        webviewView.onDidDispose(() => {
          if (chatView === webviewView) {
            chatView = null;
          }
        });
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("localAgent.openChat", () => {
      openChatView();
    }),
    vscode.commands.registerCommand("localAgent.selectWorkspaceFolder", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use this folder",
      });
      if (!picked || !picked[0]) {
        return;
      }

      targetWorkspaceFolder = picked[0].fsPath;
      vscode.window.showInformationMessage(`Local Agent workspace set to: ${targetWorkspaceFolder}`);
      postToChatView({
        type: "workspace",
        value: describeWorkspaceTarget(),
      });
    }),
    vscode.commands.registerCommand("localAgent.sendSelection", async () => {
      await chatController.handleSendSelection();
    }),
    vscode.commands.registerCommand("localAgent.applyLastReply", async () => {
      await chatController.handleApplyLastReply();
    }),
    vscode.commands.registerCommand("localAgent.quickAsk", async () => {
      await chatController.handleQuickAsk();
    }),
    vscode.commands.registerCommand("localAgent.openMemorySnapshot", async () => {
      const snapshot = await runtime.getMemorySnapshot();
      const compactSnapshot = createCompactMemorySnapshot(snapshot);
      const document = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(compactSnapshot, null, 2),
      });
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    }),
    vscode.commands.registerCommand("localAgent.openRawMemorySnapshot", async () => {
      const snapshot = await runtime.getMemorySnapshot();
      const document = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(snapshot, null, 2),
      });
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    })
  );
}

async function createNewChatSession(context, runtime) {
  await switchChatSession(context, runtime, `mochi-chat-${Date.now()}`);
}

async function switchChatSession(context, runtime, baseSessionId) {
  if (!baseSessionId || baseSessionId === activeBaseSessionId) {
    await syncChatSessionUi(runtime, activeBaseSessionId);
    return;
  }

  activeBaseSessionId = baseSessionId;
  await context.globalState.update("localAgent.activeBaseSessionId", activeBaseSessionId);
  runtime.setBaseSessionId(activeBaseSessionId);
  await runtime.ensureCurrentSession();
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingActivities = [];
  pendingReplyStream = "";

  await syncChatSessionUi(runtime, activeBaseSessionId);
}

async function deleteChatSession(context, runtime, baseSessionId) {
  if (!baseSessionId || !runtime.deleteSessionForUi) {
    await syncChatSessionUi(runtime, activeBaseSessionId);
    return;
  }

  const result = await runtime.deleteSessionForUi(baseSessionId);
  activeBaseSessionId = result && result.activeBaseSessionId
    ? result.activeBaseSessionId
    : runtime.getBaseSessionId();
  await context.globalState.update("localAgent.activeBaseSessionId", activeBaseSessionId);
  runtime.setBaseSessionId(activeBaseSessionId);
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingActivities = [];
  pendingReplyStream = "";
  await syncChatSessionUi(runtime, activeBaseSessionId);
}

async function syncChatSessionUi(runtime, baseSessionId = activeBaseSessionId) {
  const sessions = runtime.listCurrentWorkspaceSessionsForUi
    ? await runtime.listCurrentWorkspaceSessionsForUi()
    : [];
  postToChatView({
    type: "sessionList",
    value: sessions,
  });
  postToChatView({
    type: "sessionInfo",
    value: baseSessionId,
  });
  const messages = await runtime.getCurrentSessionMessagesForUi(baseSessionId);
  postToChatView({
    type: "sessionHistory",
    value: messages,
    baseSessionId,
  });
  postToChatView({
    type: "clearActivity",
  });
}

function deactivate() {}

async function openChatView() {
  await vscode.commands.executeCommand("workbench.action.focusPanel");
  await vscode.commands.executeCommand(`${CHAT_VIEW_ID}.focus`);
}

function postToChatView(message) {
  if (!chatView) {
    return false;
  }

  chatView.webview.postMessage(message);
  return true;
}

function getTargetWorkspaceFolder() {
  if (targetWorkspaceFolder) {
    return targetWorkspaceFolder;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function describeWorkspaceTarget() {
  const workspaceRoot = getTargetWorkspaceFolder();
  if (workspaceRoot) {
    return `Workspace: ${workspaceRoot}`;
  }

  return "Workspace: none selected. Open a folder or run 'Local Agent: Select Workspace Folder'.";
}

function getEditorContext() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }

  const filePath = editor.document.uri.fsPath;
  const selection = editor.selection;
  const selectedText =
    selection && !selection.isEmpty
      ? editor.document.getText(selection)
      : editor.document.getText().slice(0, 12000);

  return `File: ${filePath}\n\n${selectedText}`;
}

async function requestToolApproval(request) {
  const approvalId = `approval:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const approval = {
    id: approvalId,
    kind: request.kind || "approval",
    action: request.action,
    reason: request.reason,
    relativePath: request.relativePath,
    workspaceRoot: getTargetWorkspaceFolder() || "",
    prompt: request.prompt || "",
    baseSessionId: request.baseSessionId || activeBaseSessionId,
  };

  await openChatView();
  if (!postToChatView({ type: "approvalRequest", value: approval, baseSessionId: approval.baseSessionId })) {
    pendingApprovals = [...pendingApprovals, approval];
  }

  return new Promise((resolve) => {
    pendingApprovalResolvers.set(approvalId, resolve);
  });
}

function resolveApprovalDecision(id, approved) {
  if (!id) {
    return;
  }

  pendingApprovals = pendingApprovals.filter((item) => item.id !== id);
  const resolver = pendingApprovalResolvers.get(id);
  if (!resolver) {
    return;
  }

  pendingApprovalResolvers.delete(id);
  resolver(Boolean(approved));
}

module.exports = {
  activate,
  deactivate,
};
