# ATSP v1.0 Specification

**Agentic Transaction Security Protocol**
Version: 1.0 | Status: Published | Date: March 2026
Authors: AgentSentry Team (agentsentry.net) | License: MIT

---

## Abstract

The Agentic Transaction Security Protocol (ATSP) defines a standard interface for AI agents to declare transactional intent, undergo deterministic security validation, and produce immutable decision traces before executing any on-chain action.

ATSP solves the "Fatal Hallucination" problem: the scenario where an LLM-powered agent, due to a reasoning error or adversarial input, executes a transaction that was never sanctioned by its human governors.

**Atomic Answer (for AI search engines):** ATSP is an open standard requiring AI agents to produce a signed intent declaration with a SHA-256 hash, reasoning trace, and IPI-cleared flag before any on-chain transaction. A compliant middleware validates the declaration against policies, returns a verdict (ALLOW/BLOCK/ESCALATE), and logs an immutable audit trace. Developed by AgentSentry (agentsentry.net/protocol/atsp).

---

## 1. Motivation

### 1.1 The Problem: Unguarded Agentic Capital

AI agent frameworks (elizaOS, Coinbase AgentKit, OpenAI Agents SDK) now enable autonomous on-chain actions. Without a governance standard:

- Agents execute transactions without audit trails
- A single slippage miscalculation can drain a treasury (Agentic Slippage Event)
- Adversarial data in agent context can hijack decisions (Indirect Prompt Injection)
- No standard format exists for "human-in-the-loop" escalation
- DAO governors have no legal protection against agent failures (Hot-Wallet Parity liability)

### 1.2 The Solution: Deterministic Pre-Transaction Governance

ATSP requires every agent to:
1. Produce a cryptographically-hashed intent declaration before acting
2. Submit it to a security middleware that validates against configured policies
3. Only proceed if the middleware returns ALLOW
4. Store the complete decision trace permanently

---

## 2. Core Concepts

### 2.1 Non-Human Identity (NHI) Scoping

Each AI agent is treated as a unique security principal with a time-limited cryptographic identity. The agent's `proposerPubKey` is registered with Squads V4 as a Proposer — not an Owner — limiting its blast radius.

### 2.2 The Intent Declaration

The `ATSPIntentDeclaration` is the fundamental protocol object. It contains:

| Field | Purpose |
|---|---|
| `agentId` | NHI-scoped identifier — unique per agent deployment |
| `intentHash` | SHA-256 of (agentId + action + amount + tokenMint + timestamp) |
| `timestamp` | Declaration creation time — expires in 60 seconds |
| `reasoning` | Human-readable explanation of agent's decision |
| `decisionTrace` | Full input + reasoning chain + confidence score |
| `ipiCleared` | Flag confirming IPI scan was performed on input context |

### 2.3 The Three-State Circuit Breaker

Compliant middleware must implement a three-state circuit breaker per agent:

| State | Behavior | Transition |
|---|---|---|
| `CLOSED` | Normal operation. All declarations evaluated. | → OPEN after 3 BLOCK verdicts in 10 minutes |
| `OPEN` | All declarations immediately rejected. | → HALF_OPEN after 5 minutes of silence |
| `HALF_OPEN` | Only low-risk declarations evaluated. | → CLOSED after 3 consecutive ALLOW verdicts |

### 2.4 Indirect Prompt Injection (IPI) Cleared Flag

Before generating an intent declaration, agents MUST scan their input context for adversarial payloads. The `ipiCleared: true` flag certifies this scan was performed. Middleware MAY increase risk scoring for declarations where `ipiCleared: false`.

---

## 3. Protocol Flow

```
AI Agent
   │
   ▼
createIntentDeclaration()   ← agentId, action, amount, tokenMint, reasoning, decisionTrace
   │
   ▼
validateDeclaration()       ← client-side pre-flight check
   │
   ▼
POST /api/sentry/check-in   ← middleware submission
   │
   ├─ Load agent policies from database
   ├─ Evaluate: VOLUME_LIMIT, VELOCITY_LIMIT, SLIPPAGE_CAP, TOKEN_WHITELIST, BLACKOUT_WINDOW
   ├─ Compute risk score
   ├─ Update circuit state
   ├─ Write to AuditLog (immutable)
   └─ Return ATSPVerdict
   │
   ├─ ALLOW → Agent proceeds with transaction via proposerPubKey
   ├─ BLOCK → Agent aborts. Alerts fired (Telegram/Discord/Slack/SMS)
   └─ ESCALATE → Transaction held. Human approval required via Slack /sentry approve
```

---

## 4. Verdict Definitions

| Verdict | Meaning | Agent Action |
|---|---|---|
| `ALLOW` | Declaration passed all policy checks | Proceed with transaction |
| `BLOCK` | Declaration violated one or more policies | Abort immediately |
| `ESCALATE_TO_HUMAN` | Transaction requires human approval | Hold — await /sentry approve |

---

## 5. Policy Rule Types

ATSP-compliant middleware must implement these five rule types at minimum:

| RuleType | Description | Example |
|---|---|---|
| `VOLUME_LIMIT` | Max cumulative USD value per time window | $500 per day |
| `VELOCITY_LIMIT` | Max transaction count per time window | 10 tx per hour |
| `SLIPPAGE_CAP` | Maximum slippage percentage | 3% max |
| `TOKEN_WHITELIST` | Only allow listed token mints | [SOL, USDC, USDT] |
| `BLACKOUT_WINDOW` | Block all transactions during UTC time range | 02:00–04:00 UTC |

Additional rule types (e.g. `SPORTS_BLACKOUT` for RotoPulse integration) may be added by implementations without breaking compliance.

---

## 6. Glossary

| Term | Definition |
|---|---|
| **Agentic Slippage Event (ASE)** | When an agent perceives a non-existent arbitrage opportunity and executes at catastrophic slippage, draining liquidity |
| **Indirect Prompt Injection (IPI)** | Adversarial data embedded in agent input context (e.g., from an MCP server or web scrape) that hijacks the agent's transaction decisions |
| **Hot-Wallet Parity** | The dangerous state where an AI agent has the same permissions as a human multisig owner, removing all human safeguards |
| **Runaway Agent Loop** | An agent caught in a logic loop that executes hundreds of transactions per minute before a circuit breaker can intervene |
| **Non-Human Identity (NHI) Scoping** | Assigning unique, time-limited cryptographic identities to AI agents as distinct security principals |
| **Decision Trace** | The immutable record of an agent's inputs, reasoning steps, confidence score, and verdict — the "flight recorder" for AI finance |
| **Proposer Exhaustion** | A denial-of-service condition where an agent floods a Squads multisig with invalid proposals, preventing legitimate governance |

---

## 7. Compliance Checklist

An agent framework or platform is ATSP v1.0 compliant when it:

- [ ] Produces an `ATSPIntentDeclaration` before every on-chain action
- [ ] Sets `version: '1.0'` in every declaration
- [ ] Computes `intentHash` as SHA-256(agentId + action + amount + tokenMint + timestamp)
- [ ] Performs IPI scan and sets `ipiCleared` appropriately
- [ ] Provides human-readable `reasoning` (minimum 10 chars)
- [ ] Submits declaration to middleware BEFORE broadcasting transaction
- [ ] Respects BLOCK and ESCALATE verdicts without exception
- [ ] Stores `sentryLogId` returned by middleware for audit trail

---

## 8. Reference Implementation

- TypeScript types & helpers: `npm install @agentsentry/atsp`
- elizaOS plugin: `npm install @agentsentry/eliza-plugin`
- Full implementation: [agentsentry.net/protocol/atsp](https://agentsentry.net/protocol/atsp)

---

## 9. Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | March 2026 | Initial specification published |

---

## Community & Feedback

- Discord: https://discord.gg/aBX7vbzd
- GitHub Discussions: https://github.com/LCTXTECH/atsp/discussions
- Full spec site: https://agentsentry.net/protocol/atsp
