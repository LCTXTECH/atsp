# Agentic Transaction Security Protocol (ATSP)

[![ATSP v1.0 Compliant](https://img.shields.io/badge/ATSP-v1.0%20Compliant-00FF88?style=flat-square&labelColor=010408)](https://agentsentry.net/protocol/atsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee?style=flat-square&labelColor=010408)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&labelColor=010408&logo=discord&logoColor=white)](https://discord.gg/aBX7vbzd)
[![npm](https://img.shields.io/badge/npm-%40agentsentry%2Fatsp-f59e0b?style=flat-square&labelColor=010408)](https://www.npmjs.com/package/@agentsentry/atsp)

> The open standard for how AI agents declare intent, validate context, and produce immutable decision traces before executing any on-chain transaction.

**Published by [AgentSentry](https://agentsentry.net) · Houston, TX · Bayou City Blockchain**

---

## What Is ATSP?

ATSP (Agentic Transaction Security Protocol) defines a standard interface that any AI agent framework (elizaOS, Coinbase AgentKit, OpenAI Agents SDK) must implement before executing on-chain transactions.

**The problem it solves:** AI agents managing real capital (Solana treasuries, DeFi positions, DAO vaults) have no standard for declaring *why* they want to execute a transaction before they do it. Without this, a single LLM hallucination can drain a treasury in seconds.

**ATSP is the fix.** It forces agents to:
1. Declare intent with a cryptographic hash before any on-chain action
2. Pass through a security middleware (like AgentSentry) that validates the intent
3. Produce an immutable decision trace that survives the transaction

---

## Quick Install

```bash
npm install @agentsentry/atsp
# or
pnpm add @agentsentry/atsp
```

---

## Core Usage

```typescript
import { createIntentDeclaration, validateDeclaration, ATSPVersion } from '@agentsentry/atsp'

// Step 1: Agent declares its intent BEFORE executing
const declaration = await createIntentDeclaration({
  agentId: 'eliza-agent-001',
  proposerPubKey: 'YOUR_PROPOSER_PUBLIC_KEY',
  action: 'SWAP',
  amount: 10.5,
  tokenMint: 'So11111111111111111111111111111111111111112',
  slippage: 1.5,
  reasoning: 'Rebalancing portfolio: SOL/USDC ratio exceeded 60% threshold',
  ipiCleared: true,
})

// Step 2: Validate the declaration
const result = validateDeclaration(declaration)
if (!result.valid) {
  throw new Error(`ATSP validation failed: ${result.errors.join(', ')}`)
}

// Step 3: Send to AgentSentry (or any ATSP-compliant middleware)
const verdict = await fetch('https://agentsentry.net/api/sentry/check-in', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer YOUR_API_KEY' },
  body: JSON.stringify(declaration),
})

const { sentryVerdict } = await verdict.json()

// Step 4: Only execute if ALLOW
if (sentryVerdict === 'ALLOW') {
  // proceed with transaction
}
```

---

## Core Interfaces

```typescript
interface ATSPIntentDeclaration {
  version: '1.0'
  agentId: string           // NHI-scoped principal identifier
  proposerPubKey: string    // Squads V4 proposer key
  intentHash: string        // SHA-256 of (agentId + action + amount + tokenMint + timestamp)
  timestamp: number         // Unix ms — declarations expire after 60 seconds
  action: ATSPAction        // 'SWAP' | 'TRANSFER' | 'LP' | 'STAKE' | 'UNSTAKE' | 'VOTE'
  amount: number            // In native token units
  tokenMint: string         // Solana token mint address
  slippage?: number         // Max acceptable slippage %
  reasoning: string         // Human-readable agent reasoning (min 10 chars)
  ipiCleared: boolean       // Confirms IPI scan was performed on input context
  decisionTrace: {
    input: Record   // The raw data the agent acted on
    reasoning: string                // Step-by-step decision logic
    confidence: number               // 0.0 – 1.0
  }
  sentryVerdict?: ATSPVerdict        // Set by middleware after validation
  sentryLogId?: string               // Audit log reference
}

type ATSPVerdict = 'ALLOW' | 'BLOCK' | 'ESCALATE_TO_HUMAN'
type ATSPAction  = 'SWAP' | 'TRANSFER' | 'LP' | 'STAKE' | 'UNSTAKE' | 'VOTE'
```

---

## ATSP Compliance Badge

Add this to your project's README to signal ATSP compliance:

```markdown
[![ATSP v1.0 Compliant](https://img.shields.io/badge/ATSP-v1.0%20Compliant-00FF88?style=flat-square&labelColor=010408)](https://agentsentry.net/protocol/atsp)
```

---

## Key Concepts

| Concept | Definition |
|---|---|
| **Agentic Slippage Event (ASE)** | When an agent perceives a non-existent arbitrage opportunity and executes at catastrophic slippage |
| **Indirect Prompt Injection (IPI)** | Adversarial data in agent input context that hijacks transaction decisions |
| **Hot-Wallet Parity** | Dangerous state where agent has same permissions as a human multisig owner |
| **Runaway Agent Loop** | Agent caught in logic loop executing hundreds of transactions before circuit trips |
| **Non-Human Identity (NHI) Scoping** | Assigning unique, time-limited cryptographic identities to agents via Squads Proposer roles |

---

## Links

- 📄 **Full Protocol Spec:** [agentsentry.net/protocol/atsp](https://agentsentry.net/protocol/atsp)
- 🛡️ **AgentSentry Dashboard:** [agentsentry.net/dashboard](https://agentsentry.net/dashboard)
- 📦 **elizaOS Plugin:** [npmjs.com/@agentsentry/eliza-plugin](https://npmjs.com/package/@agentsentry/eliza-plugin)
- 📚 **Docs:** [agentsentry.net/docs](https://agentsentry.net/docs)
- 💬 **Discord:** [discord.gg/aBX7vbzd](https://discord.gg/aBX7vbzd)

---

## License

MIT © 2026 AgentSentry / Bayou City Blockchain · Houston, TX
