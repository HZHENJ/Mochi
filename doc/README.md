# Mochi Docs

This folder keeps the project development log and the current product/runtime notes so we can continue building without losing context.

## Files

- `development-log.md`: timeline-style log of what has been built and changed so far.
- `current-architecture.md`: current code structure, runtime boundaries, and major design decisions.
- `current-features-and-usage.md`: what is currently usable, how to run it, and known limits.
- `ultimate-goal.md`: long-term vision, target system layers, and staged evolution path.
- `roadmap.md`: practical staged plan for what should be built next and what should wait.
- `commands-and-capabilities.md`: all current commands and the practical capability each one provides.

## Current Documentation Focus

The docs currently reflect these recent project upgrades:

- the VS Code extension now runs on the JavaScript OpenAI Agents SDK path
- tools are split into workspace, file, and editor groups
- layered memory now includes session, task, workspace, and user stores
- memory snapshots can be opened directly from VS Code
- the memory flow now separates conversation turns from work-item routing
- task routing now supports continue, create, and reactivate decisions for work-like turns
- persisted history is slimmer because runtime-only scaffolding is filtered before storage
- work tasks are now committed only after a successful run, which avoids half-created active tasks after failures
- legacy injected scaffold text is now cleaned out of stored user history during session reads and writes
- assistant replies now stream progressively in the VS Code chat panel
- the chat UI is now lighter, with a minimal Mochi header, inline thinking state, and simplified approval cards
- prompt instructions now bias more strongly toward directly executing clearly actionable requests

## Reading Order

If you are new to the repo, the most useful order is:

1. `current-features-and-usage.md`
2. `current-architecture.md`
3. `commands-and-capabilities.md`
4. `roadmap.md`
5. `ultimate-goal.md`
6. `development-log.md`

## Update Rule

When Mochi gains a meaningful new capability, update:

1. `development-log.md`
2. `current-architecture.md` if structure or boundaries changed
3. `current-features-and-usage.md` if user-facing behavior changed
4. `commands-and-capabilities.md` if command surface or practical runtime capability changed
5. `roadmap.md` if the next most important work changed
