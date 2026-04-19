const DEFAULT_LIMITS = {
  repo_guide: 1800,
  coding: 2200,
  plan_reviewer: 1800,
  review: 2000,
  default: 1600,
};

function selectSubagentMemory({ agentKey, memoryState, projectInstructionsText = "" }) {
  const key = agentKey || "default";
  const slices = memoryState && memoryState.memorySlices ? memoryState.memorySlices : {};
  const sections = [];

  if (key === "repo_guide") {
    pushSection(sections, "Workspace memory", slices.workspace);
    pushSection(sections, "Task memory", slices.task);
    pushSection(sections, "Session summary", slices.session);
    pushSection(sections, "User memory", slices.user);
    pushSection(sections, "Project instructions", projectInstructionsText);
    return buildSelection(key, sections);
  }

  if (key === "coding") {
    pushSection(sections, "Task memory", slices.task);
    pushSection(sections, "Workspace memory", slices.workspace);
    pushSection(sections, "Session summary", slices.session);
    pushSection(sections, "Referenced task summaries", slices.referencedTasks);
    pushSection(sections, "User memory", slices.user);
    pushSection(sections, "Project instructions", projectInstructionsText);
    return buildSelection(key, sections);
  }

  if (key === "plan_reviewer") {
    pushSection(sections, "Task memory", slices.task);
    pushSection(sections, "Workspace memory", slices.workspace);
    pushSection(sections, "Session summary", slices.session);
    pushSection(sections, "Referenced task summaries", slices.referencedTasks);
    pushSection(sections, "User memory", slices.user);
    pushSection(sections, "Project instructions", projectInstructionsText);
    return buildSelection(key, sections);
  }

  if (key === "review") {
    pushSection(sections, "Task memory", slices.task);
    pushSection(sections, "Workspace memory", slices.workspace);
    pushSection(sections, "Session summary", slices.session);
    pushSection(sections, "Referenced task summaries", slices.referencedTasks);
    pushSection(sections, "Project instructions", projectInstructionsText);
    return buildSelection(key, sections);
  }

  pushSection(sections, "Task memory", slices.task);
  pushSection(sections, "Workspace memory", slices.workspace);
  pushSection(sections, "User memory", slices.user);
  return buildSelection(key, sections);
}

function buildSelection(agentKey, sections) {
  const limit = DEFAULT_LIMITS[agentKey] || DEFAULT_LIMITS.default;
  const included = [];
  let remaining = limit;
  const output = [];

  for (const section of sections) {
    if (!section || !section.text || remaining <= 0) {
      continue;
    }

    const prefix = section.title ? `${section.title}:\n` : "";
    const budget = Math.max(0, remaining - prefix.length - 2);
    if (budget <= 0) {
      break;
    }

    const body = limitText(section.text, budget);
    output.push(`${prefix}${body}`);
    included.push(section.title || "memory");
    remaining -= prefix.length + body.length + 2;
  }

  return {
    text: output.length
      ? ["Selected memory for delegated agent", ...output].join("\n\n")
      : "",
    metadata: {
      agentKey,
      included,
      limit,
    },
  };
}

function pushSection(sections, title, text) {
  const value = String(text || "").trim();
  if (!value) {
    return;
  }

  sections.push({ title, text: value });
}

function limitText(value, maxChars) {
  const text = String(value || "");
  if (!maxChars || text.length <= maxChars) {
    return text;
  }

  const suffix = "\n...[truncated]";
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

module.exports = {
  selectSubagentMemory,
};
