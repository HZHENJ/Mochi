const FILE_MUTATION_ACTIONS = new Set([
  "write_file",
  "append_file",
  "delete_file",
  "delete_dir",
  "make_dir",
]);

function analyzeRunVerification(trace) {
  const toolCalls = Array.isArray(trace && trace.toolCalls) ? trace.toolCalls : [];
  const changedPaths = collectChangedPaths(toolCalls);
  const commandCalls = toolCalls.filter(
    (toolCall) => toolCall && getToolAction(toolCall) === "run_command"
  );

  if (!changedPaths.length) {
    return {
      needed: false,
      status: "not_needed",
      changedPaths: [],
      commands: summarizeCommandCalls(commandCalls),
      message: "No file changes were made during this run.",
    };
  }

  if (!commandCalls.length) {
    return {
      needed: true,
      status: "not_run",
      changedPaths,
      commands: [],
      message: "File changes were made, but no verification command was run.",
    };
  }

  const commandSummary = summarizeCommandCalls(commandCalls);
  const executedCommands = commandCalls.filter((toolCall) => isCommandExecuted(toolCall));

  if (!executedCommands.length) {
    return {
      needed: true,
      status: "denied",
      changedPaths,
      commands: commandSummary,
      message: "Verification was attempted, but command execution was not approved.",
    };
  }

  if (executedCommands.some((toolCall) => isCommandFailure(toolCall))) {
    return {
      needed: true,
      status: "failed",
      changedPaths,
      commands: commandSummary,
      message: "Verification ran after file changes, but at least one command failed.",
    };
  }

  return {
    needed: true,
    status: "passed",
    changedPaths,
    commands: commandSummary,
    message: "Verification ran successfully after file changes.",
  };
}

function collectChangedPaths(toolCalls) {
  const uniquePaths = new Set();

  for (const toolCall of toolCalls) {
    if (!toolCall || toolCall.status !== "completed") {
      continue;
    }

    if (!FILE_MUTATION_ACTIONS.has(getToolAction(toolCall))) {
      continue;
    }

    const toolPath =
      typeof toolCall.path === "string" && toolCall.path
        ? toolCall.path
        : toolCall.output && typeof toolCall.output.path === "string"
          ? toolCall.output.path
          : "";

    if (toolPath) {
      uniquePaths.add(toolPath);
    }
  }

  return Array.from(uniquePaths);
}

function summarizeCommandCalls(commandCalls) {
  return commandCalls.map((toolCall) => {
    const data = toolCall && toolCall.output && toolCall.output.data ? toolCall.output.data : null;
    const command = data && data.command ? formatCommand(data.command, data.args) : "";

    return {
      command,
      status: classifyCommandStatus(toolCall),
      exitCode:
        data && Object.prototype.hasOwnProperty.call(data, "exitCode") ? data.exitCode : null,
      timedOut: Boolean(data && data.timedOut),
      stdoutPreview: data && data.stdoutPreview ? data.stdoutPreview : "",
      stderrPreview: data && data.stderrPreview ? data.stderrPreview : "",
    };
  });
}

function classifyCommandStatus(toolCall) {
  if (!toolCall) {
    return "unknown";
  }

  if (!isCommandExecuted(toolCall)) {
    return "not_run";
  }

  return isCommandFailure(toolCall) ? "failed" : "passed";
}

function isCommandExecuted(toolCall) {
  return !(toolCall && toolCall.output && toolCall.output.data && toolCall.output.data.notRun);
}

function isCommandFailure(toolCall) {
  if (!toolCall || toolCall.status !== "failed") {
    return false;
  }

  return isCommandExecuted(toolCall);
}

function getToolAction(toolCall) {
  if (!toolCall) {
    return "";
  }

  if (toolCall.output && typeof toolCall.output.action === "string" && toolCall.output.action) {
    return toolCall.output.action;
  }

  return typeof toolCall.name === "string" ? toolCall.name : "";
}

function formatCommand(command, args = []) {
  const suffix = Array.isArray(args) && args.length ? ` ${args.join(" ")}` : "";
  return `${command}${suffix}`;
}

module.exports = {
  analyzeRunVerification,
};
