/**
 * @agentsentry/atsp
 * Agentic Transaction Security Protocol v1.0
 *
 * The open standard for AI agent on-chain governance.
 * https://agentsentry.net/protocol/atsp
 *
 * @example
 * import { createIntentDeclaration, validateDeclaration } from '@agentsentry/atsp'
 */

// Re-export all types
export type {
  ATSPVersion,
  ATSPAction,
  ATSPVerdict,
  ATSPCircuitState,
  ATSPDecisionTrace,
  ATSPIntentDeclaration,
  ATSPValidationResult,
  ATSPMiddlewareConfig,
} from './types'

export { ATSP_VERSION } from './types'

// Re-export validation functions
export {
  validateDeclaration,
  isExpired,
  computeRiskScore,
} from './validate'

// -------------------------------------------------------
// createIntentDeclaration — the main developer-facing API
// -------------------------------------------------------

import type { ATSPIntentDeclaration, ATSPAction, ATSPDecisionTrace } from './types'
import { ATSP_VERSION } from './types'

/**
 * Input for createIntentDeclaration — everything the developer provides.
 * The function computes intentHash and timestamp automatically.
 */
export interface CreateIntentInput {
  agentId: string
  proposerPubKey: string
  action: ATSPAction
  amount: number
  tokenMint: string
  slippage?: number
  reasoning: string
  decisionTrace: Omit & { ipiCleared: boolean }
}

/**
 * Creates a fully-formed ATSPIntentDeclaration ready for middleware submission.
 *
 * Computes the intentHash automatically using the Web Crypto API (browser/Edge)
 * or Node.js crypto (server). Works in both environments.
 *
 * @param input - The intent details from the AI agent
 * @returns A complete ATSPIntentDeclaration with intentHash and timestamp set
 *
 * @example
 * const declaration = await createIntentDeclaration({
 *   agentId: 'eliza-agent-001',
 *   proposerPubKey: 'YOUR_PROPOSER_KEY',
 *   action: 'SWAP',
 *   amount: 10.5,
 *   tokenMint: 'So11111111111111111111111111111111111111112',
 *   slippage: 1.5,
 *   reasoning: 'Rebalancing: SOL/USDC exceeded 60% threshold',
 *   decisionTrace: {
 *     input: { price: 145.2, ratio: 0.63 },
 *     reasoning: '1. Check ratio. 2. Threshold exceeded. 3. Propose rebalance.',
 *     confidence: 0.87,
 *     ipiCleared: true,
 *   },
 * })
 */
export async function createIntentDeclaration(
  input: CreateIntentInput
): Promise {
  const timestamp = Date.now()

  // Compute intentHash: SHA-256 of the immutable fields
  const hashInput = `${input.agentId}:${input.action}:${input.amount}:${input.tokenMint}:${timestamp}`
  const intentHash = await sha256(hashInput)

  return {
    version: ATSP_VERSION,
    agentId: input.agentId,
    proposerPubKey: input.proposerPubKey,
    intentHash,
    timestamp,
    action: input.action,
    amount: input.amount,
    tokenMint: input.tokenMint,
    slippage: input.slippage,
    reasoning: input.reasoning,
    decisionTrace: input.decisionTrace,
  }
}

/**
 * Cross-environment SHA-256.
 * Uses SubtleCrypto in browser/Edge, Node crypto in server.
 */
async function sha256(message: string): Promise {
  const encoded = new TextEncoder().encode(message)

  // Browser / Edge runtime (Vercel Edge Functions, Cloudflare Workers)
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Node.js runtime (API routes, scripts)
  const { createHash } = await import('crypto')
  return createHash('sha256').update(message).digest('hex')
}
