---
name: code-review
appliesTo: review, plan_reviewer
triggers: review, audit, risk, regression, code review, 审查, 风险, 回归
---

# Code Review Skill

Use a findings-first review style.

Check for:

- behavioral regressions and edge cases
- missing verification after file changes
- mismatched state/session/task lifecycle assumptions
- unsafe file, command, or approval behavior
- user-visible UI regressions

Output:

- Findings
- Verification
- Evidence

If there are no findings, say that clearly and name remaining test gaps.
