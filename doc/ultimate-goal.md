# Ultimate Goal

## Vision

Mochi is intended to evolve from a local VS Code coding assistant into a larger system that combines:

- a coder product
- a programmable agent runtime
- multi-agent orchestration
- eventually a distributed execution system

The long-term goal is not only to chat about code, but to build a platform that can understand tasks, coordinate specialized agents, execute work safely, and scale from local development workflows toward more serious orchestration scenarios.

## End-State Direction

The eventual target can be described as:

`distributed orchestration system + coder + custom runtime`

That means Mochi would ultimately include several layers:

1. an excellent coding assistant experience
2. a local runtime for tools, memory, tasks, and agent coordination
3. a workflow and orchestration layer for multi-agent execution
4. a distributed worker layer for remote or parallel execution
5. a control plane for visibility, policy, and system coordination

## What Mochi Is Today

Today, Mochi is still in the early local-runtime phase.

It already has:

- a VS Code chat interface
- a JavaScript OpenAI Agents SDK runtime
- workspace-aware tools
- a layered memory foundation
- a session-first memory flow that separates conversational turns from work-item routing
- project-level instruction loading similar in spirit to Codex `AGENTS.md` and Claude Code `CLAUDE.md`
- early multi-agent structure
- task routing with continue / create / reactivate behavior
- inspectable memory snapshots for local observability

This is not yet the final platform, but it is a legitimate foundation for it.

## What Mochi Must Become

To reach the long-term goal, Mochi will likely need to evolve through the following system layers.

### Layer 1: Product Layer

This is the visible user experience:

- VS Code integration
- chat UX
- code editing workflows
- explain, refactor, review, and generate flows
- task visibility and feedback

This layer must remain strong because the orchestration system only matters if the product experience is useful.

### Layer 2: Local Runtime Layer

This is the local execution core:

- agent registry
- tool registry
- prompt and identity management
- memory manager
- task manager
- streaming and cancellation
- handoff rules

Important implementation principle:

- generic runtime mechanisms should use official primitives where they fit well
- Mochi-specific product behavior should remain Mochi-owned
- the goal is not to rewrite generic infrastructure for its own sake, but also not to give up product control
- conversational thread memory and work-item coordination should stay distinct rather than collapsing into one bucket

This layer is the current core of the project.

### Layer 3: Orchestration Layer

This is where Mochi becomes more than a single assistant:

- planner and executor roles
- reviewer and repo guide roles
- task routing
- handoffs between agents
- approval steps
- retries and resumable execution
- structured task state

This is the next major strategic layer after the current memory/runtime work.

### Layer 4: Distributed Execution Layer

This is where Mochi starts becoming a true distributed system:

- remote workers
- queued jobs
- task leasing
- run recovery
- event logs
- shared durable state
- cross-process coordination
- parallel execution across machines

This layer is not needed immediately, but it is part of the long-term destination.

### Layer 5: Control Plane Layer

This is where Mochi becomes a managed system:

- run history
- observability
- permissions and policy
- project registry
- debugging and replay
- quotas and governance

This layer is only worth building once orchestration and distributed execution are mature enough.

## Strategic Development Path

The project should evolve in stages rather than trying to jump directly to the distributed-system end state.

### Stage 1: Strong Local Coder

Goal:

- make Mochi a reliable local coding assistant inside VS Code

Focus:

- runtime stability
- good tools
- clear identity
- practical coding workflows

### Stage 2: Strong Local Runtime

Goal:

- establish Mochi as a reusable local execution core

Focus:

- modular runtime design
- memory layers
- task state
- tool boundaries
- agent registration model

### Stage 3: Multi-Agent Orchestration

Goal:

- move from one assistant to coordinated specialized roles

Focus:

- planner / coding / repo guide / review roles
- agent-specific memory slices
- routing and handoffs
- structured task progression

### Stage 4: Durable Orchestration

Goal:

- support longer-running workflows and resumable runs

Focus:

- durable task state
- checkpoints
- approvals
- replay and recovery

### Stage 5: Distributed Execution

Goal:

- execute work across multiple workers or machines

Focus:

- job queue
- remote worker contracts
- failure recovery
- distributed scheduling

### Stage 6: Control Plane

Goal:

- make Mochi operable as a larger platform

Focus:

- observability
- management
- governance
- policy

## Current Position In The Roadmap

Mochi is currently between Stage 1 and Stage 2.

What has already been established:

- the local product shell exists
- the local runtime exists
- the first structured memory layer exists

What is next:

- better multi-agent role separation
- task-aware runtime behavior
- agent-specific memory usage
- clearer execution boundaries
- richer task routing signals and observability
- safer destructive tool workflows

## Important Principle

Mochi should not prematurely optimize for distributed infrastructure before the local runtime and orchestration model are genuinely strong.

The local system must become trustworthy before it is expanded into a distributed one.

That means:

- product usefulness comes first
- runtime clarity comes second
- orchestration maturity comes third
- distributed execution comes later

## Success Criteria

Mochi is moving in the right direction if, over time, it becomes:

- better at coding work
- better at remembering context
- better at decomposing tasks
- better at coordinating roles
- better at executing safely
- easier to observe and control

The project does not need to look like a distributed orchestration platform today.
It needs to be built in a way that can credibly become one.
