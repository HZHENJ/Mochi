---
name: vscode-extension-dev
appliesTo: root, repo_guide, coding, review, plan_reviewer
triggers: vscode, extension, webview, command, activation, package.json, VS Code
---

# VS Code Extension Development Skill

Prefer the existing extension/runtime boundary:

- `src/extension` owns VS Code APIs, commands, webview, and UI bridge
- `src/runtime` owns agents, tools, prompts, memory, and OpenAI SDK orchestration
- avoid calling VS Code APIs from runtime modules
- keep webview HTML self-contained unless a build step is introduced

Check `package.json` when commands, activation events, views, icons, or extension metadata are affected.
