---
name: memory-architecture
appliesTo: root, repo_guide, coding, review, plan_reviewer
triggers: memory, session, task, tracy, trace, compaction, 记忆, 会话, 任务, 压缩
---

# Memory Architecture Skill

Preserve the current ownership model:

- root/session memory is long-lived
- subagents receive selected memory slices, not direct long-term memory access
- Tracy/run trace records execution evidence
- session compaction keeps old conversation context bounded
- task memory carries cross-session work continuity

When changing memory behavior, check lifecycle timing:

- prepareRun
- run/subagent execution
- finalizeRun
- snapshot/trace visibility
