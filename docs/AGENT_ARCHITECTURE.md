# Agentic Layer — Design Doc

> **Status:** Proposal / design sketch (nothing here is implemented yet).
> **Goal:** Add a conversational + autonomous "Swim Coach" agent to UBC Length Swim
> that orchestrates the app's *existing* capabilities, without rewriting the core.

---

## 1. Motivation

Today the app is a solid full-stack CRUD product: a React SPA over a Spring Boot
REST API that ingests the UBC Aquatic Centre schedule, lets users log swims, and
ranks a daily leaderboard. Everything is click-driven.

An **agentic layer** turns "click through tabs" into "just ask":

> *"Find me a 50 m lane after 6 pm this week and build a 2 km threshold set."*
> *"How's my volume trending vs last month?"*
> *"Remind me every Sunday which Length Swim slots are open."*

### Design principle

**The agent gets no new powers — it orchestrates the tools you already have.**
Every skill is a thin wrapper over an existing service (`UbcFeedService`,
`SwimRecordRepository`, leaderboard logic, user profile). This keeps the agent
thin, testable, safe, and cheap to extend.

---

## 2. High-level architecture

```mermaid
flowchart TB
    subgraph Client["React SPA (Vite + TS)"]
        UI["Existing tabs<br/>(Schedule · Pool · Ranking · Records)"]
        Coach["NEW: Coach tab<br/>chat + streaming + result cards"]
    end

    subgraph API["Spring Boot REST API"]
        direction TB
        Existing["Existing controllers<br/>Schedule · SwimRecord · Leaderboard · Auth"]
        subgraph Agent["NEW: com.annie.swim.agent"]
            AC["AgentController<br/>POST /api/agent/chat (SSE)"]
            ORCH["AgentOrchestrator<br/>the perceive→plan→act→observe loop"]
            ROUTER["Router / sub-agent dispatch"]
            REG["ToolRegistry + SkillRegistry"]
            GUARD["Guardrails<br/>budget · validation · safety"]
        end
        LLM["LlmClient (interface)<br/>Claude impl · swappable"]
    end

    subgraph Services["Domain services (reused as tools)"]
        FEED["UbcFeedService"]
        REC["SwimRecordRepository"]
        LB["Leaderboard logic"]
        PROF["User / profile"]
    end

    DB[("H2 / JPA<br/>+ conversation · agent_step · scheduled_agent")]
    MODEL(["Anthropic Claude API"])

    Coach -->|SSE| AC
    UI --> Existing
    AC --> ORCH
    ORCH --> ROUTER
    ROUTER --> REG
    ORCH --> GUARD
    ORCH --> LLM
    LLM --> MODEL
    REG -->|invokes| FEED & REC & LB & PROF
    Existing --> Services
    Services --> DB
    Agent --> DB
```

The agent lives entirely **inside the existing Spring Boot backend** as one new
package. It is guarded by a feature flag, so the app still builds and deploys
with the agent turned off — the CI/CD + single-branch deploy story is unchanged.

---

## 3. The agent loop

A classic **perceive → reason → act → observe** loop, running server-side and
streaming partial output to the client over Server-Sent Events.

```mermaid
sequenceDiagram
    participant U as User (Coach tab)
    participant A as AgentController (SSE)
    participant O as AgentOrchestrator
    participant G as Guardrails
    participant L as LlmClient (Claude)
    participant T as Skill / Tool
    participant D as DB (audit)

    U->>A: "Find a 50m lane after 6pm + build 2km set"
    A->>O: start(conversation, userCtx)
    Note over O: PERCEIVE — load profile, recent records, live schedule
    loop until goal met or step budget exhausted
        O->>L: plan(context, available tool schemas)
        L-->>O: tool_call(ScheduleSkill, {length:50, after:"18:00"})
        O->>G: validate(args) + budget check
        G-->>O: ok
        O->>T: execute(args)
        T-->>O: observation (open 50m slots)
        O->>D: log agent_step (plan, call, result)
        O-->>A: stream partial ("found 3 slots…")
        A-->>U: token / card stream
    end
    O-->>A: final typed answer (text + cards)
    A-->>U: render session cards + workout plan
```

**Guardrails** wrap every iteration:

- **Step budget** — hard cap on loop iterations / tool calls per turn.
- **Argument validation** — each tool call is checked against its JSON schema
  before execution.
- **Safety / domain constraints** — coaching, *not medical advice*; age-aware
  behaviour for minors; rate limiting per user.
- **Auditability** — every plan, tool call, and observation is persisted to
  `agent_step` for debugging and replay.

---

## 4. Skills — modular, drop-in capabilities

A **Skill** is a Spring bean implementing a tiny interface. The registry
auto-discovers all skill beans and exposes their metadata (name, description,
parameter schema) to the LLM. **Adding a capability = adding one class** — the
orchestrator never changes.

```java
public interface Skill {
    String name();                 // "schedule.find_sessions"
    String description();          // shown to the model for tool selection
    JsonSchema parameterSchema();  // validated before execute()
    SkillResult execute(SkillContext ctx, JsonNode args);
}
```

### Candidate skills (each wraps an existing service)

| Skill | What it does | Backed by |
|-------|--------------|-----------|
| **ScheduleSkill** | filter/search sessions, "next 50 m slot", detect openings | `UbcFeedService` |
| **WorkoutSkill** | generate a structured set (warm-up / main / cool-down) from level + goal | LLM + templates |
| **ProgressSkill** | weekly volume, PRs, streaks, trend lines over swim history | `SwimRecordRepository` |
| **LeaderboardSkill** | rank, compare to friends, motivational nudges | Leaderboard logic |
| **ReminderSkill** | schedule a notification / emit a calendar event | `scheduled_agent` table |
| **BookingSkill** *(future)* | reserve a lane (if UBC exposes an API) | external API |

Skills are independently unit-testable (mock the service, assert the result),
and the registry means the LLM's "toolbox" grows automatically.

---

## 5. Sub-agents — specialized delegates

An **Orchestrator/Router** classifies intent and delegates to focused
sub-agents, each owning a bundle of skills and its own small system prompt.
Small prompts + narrow tool sets = higher reliability and easier testing.

```mermaid
flowchart LR
    ORCH["Orchestrator / Router<br/>(intent → delegate)"]

    subgraph Subagents
        COACH["Coach sub-agent<br/>owns: WorkoutSkill"]
        ANALYST["Analyst sub-agent<br/>owns: ProgressSkill, LeaderboardSkill"]
        SCHED["Scheduler sub-agent<br/>owns: ScheduleSkill, ReminderSkill"]
        BRIEF["Briefing sub-agent<br/>(cron) owns: ScheduleSkill, ProgressSkill"]
    end

    ORCH --> COACH
    ORCH --> ANALYST
    ORCH --> SCHED
    CRON["@Scheduled trigger"] --> BRIEF
```

```java
public interface SubAgent {
    String name();                         // "coach"
    String systemPrompt();
    Set<String> skills();                  // skill names it may call
    boolean canHandle(Intent intent);
}
```

The **Briefing sub-agent** is the same machinery running autonomously: a
`@Scheduled` cron composes a "your Length Swim slots today" digest using the
same skills that power the interactive chat. One agent framework, two modes
(interactive + background).

---

## 6. Data model additions

| Table | Purpose |
|-------|---------|
| `conversation` | one row per chat thread (userId, createdAt, title) |
| `conversation_message` | user/assistant turns for context + history |
| `agent_step` | audit log: plan, tool name, args, result, latency, tokens |
| `scheduled_agent` | recurring agents (userId, cron, subAgent, params, enabled) |

`agent_step` doubles as an **observability layer** — you can replay any decision
the agent made, which is invaluable for debugging non-deterministic loops.

---

## 7. Frontend integration

- A new **Coach tab** sits alongside Schedule / Pool / Ranking / Records.
- Chat panel with **streaming** responses (SSE), suggestion chips, and a
  typed-output contract so the agent can return **structured cards** that reuse
  existing components (session cards, records, leaderboard rows, a workout plan).
- No redesign of the core app — the agent renders *into* the existing design
  system.

---

## 8. Extensibility & the MCP angle

- **Drop-in skills / sub-agents:** both are just beans; the registries wire
  them in at startup. New capability → new class → done.
- **Swappable model:** `LlmClient` is an interface; Claude today, anything
  tomorrow, configured in `application.properties`.
- **Feature-flagged:** `app.agent.enabled=false` keeps the core app fully
  functional and deployable without an LLM key.
- **MCP server *(stretch goal)*:** expose the same tool registry as a
  [Model Context Protocol](https://modelcontextprotocol.io) server so *external*
  agents (Claude Desktop, Cursor, etc.) can use "UBC Swim" as a tool. This turns
  the app from a product into a **platform**.

```mermaid
flowchart LR
    subgraph swim["UBC Swim backend"]
        REG["ToolRegistry / SkillRegistry"]
        MCPS["MCP server adapter<br/>(exposes skills as MCP tools)"]
        REG --> MCPS
    end
    EXT1["Claude Desktop"] --> MCPS
    EXT2["Cursor / other agents"] --> MCPS
    OWN["Own Coach tab"] --> REG
```

---

## 9. Suggested phasing

| Phase | Scope |
|-------|-------|
| **MVP** | single-agent loop · `ScheduleSkill` + `ProgressSkill` · Coach chat tab · SSE streaming · `agent_step` audit log · feature flag |
| **v2** | Orchestrator + sub-agents · `WorkoutSkill` · guardrails hardening · scheduled daily **Briefing** agent |
| **v3** | MCP server · `ReminderSkill` / calendar · per-user memory of goals & preferences |

---

## 10. Non-goals / risks

- **Not** a medical or safety-critical coach — advice is general fitness only,
  with explicit guardrails and age-appropriate behaviour.
- LLM calls are **non-deterministic and cost money** — hence the step budget,
  caching of tool results within a turn, and the feature flag.
- Keep tools **read-mostly** first; any write/booking action must be explicitly
  confirmed by the user before execution.

---

## 11. Why it's worth building

- **Usability:** natural-language *find + plan + remind* beats tab-clicking.
- **Extensibility:** skills/sub-agents are drop-in beans; the loop is stable.
- **Architecture story:** a tool/skill registry, sub-agent orchestration, an
  LLM abstraction, guardrails, an audit/observability layer, and an optional MCP
  integration — a genuinely differentiated, modern agentic system built on top
  of a clean REST core.
