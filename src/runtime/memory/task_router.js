const {
  findBestTaskMatch,
  isLikelyFollowUpPrompt,
  scorePromptOverlap,
} = require("./memory_utils");
const { DEFAULT_TASK_POLICY } = require("./task_policy");

function scoreTaskAgainstPrompt(task, prompt) {
  if (!task) {
    return 0;
  }

  return Math.max(
    scorePromptOverlap(prompt, task.goal),
    scorePromptOverlap(prompt, task.lastUserPrompt)
  );
}

function decideTaskRoute({ currentTask, inactiveTasks, prompt, policy = DEFAULT_TASK_POLICY }) {
  const diagnostics = {
    currentTaskId: currentTask ? currentTask.id : null,
    inactiveTaskCount: Array.isArray(inactiveTasks) ? inactiveTasks.length : 0,
    followUpDetected: isLikelyFollowUpPrompt(prompt),
    currentTaskScore: currentTask ? scoreTaskAgainstPrompt(currentTask, prompt) : 0,
    matchedInactiveTaskId: null,
    matchedInactiveTaskScore: 0,
    thresholds: {
      newTaskThreshold: policy.newTaskThreshold,
      reactivationThreshold: policy.reactivationThreshold,
    },
  };

  if (currentTask && currentTask.turnCount === 0) {
    return {
      action: "continue",
      reason: "fresh-active-task",
      targetTask: currentTask,
      score: 1,
      diagnostics: {
        ...diagnostics,
        currentTaskScore: 1,
      },
    };
  }

  if (currentTask && diagnostics.followUpDetected) {
    return {
      action: "continue",
      reason: "follow-up-prompt",
      targetTask: currentTask,
      score: 1,
      diagnostics: {
        ...diagnostics,
        currentTaskScore: 1,
      },
    };
  }

  if (currentTask && diagnostics.currentTaskScore >= policy.newTaskThreshold) {
    return {
      action: "continue",
      reason: "matches-active-task",
      targetTask: currentTask,
      score: diagnostics.currentTaskScore,
      diagnostics,
    };
  }

  const match = findBestTaskMatch(inactiveTasks, prompt);
  diagnostics.matchedInactiveTaskId = match.task ? match.task.id : null;
  diagnostics.matchedInactiveTaskScore = match.score;

  if (match.task && match.score >= policy.reactivationThreshold) {
    return {
      action: "reactivate",
      reason: currentTask ? "matches-previous-task" : "matches-workspace-task",
      targetTask: match.task,
      score: match.score,
      diagnostics,
    };
  }

  return {
    action: "create",
    reason: currentTask ? "new-user-goal" : "no-active-task",
    targetTask: null,
    score: diagnostics.currentTaskScore,
    diagnostics,
  };
}

module.exports = {
  decideTaskRoute,
  scoreTaskAgainstPrompt,
};
