/**
 * @agentsentry/atsp
 * Agentic Transaction Security Protocol v1.0
 * https://agentsentry.net/protocol/atsp
 */

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

export {
  validateDeclaration,
  verifyIntentHash,
  isExpired,
  riskLevel,
} from './validate'

import type { ATSPIntentDeclaration, ATSPAction, ATSPDecisionTrace } from './types'
import { ATSP_VERSION } from './types'

export interface CreateIntentInput {
  agentId: string
  proposerPubKey: string
  action: ATSPAction
  amount: number
  tokenMint: string
  slippage?: number
  reasoning: string
  decisionTrace: ATSPDecisionTrace
}

/**
 * Creates a fully-formed ATSPIntentDeclaration ready for middleware submission.
 * Computes intentHash automatically using SHA-256.
 * Works in Node.js, browser, Vercel Edge, and Cloudflare Workers.
 */
export async function createIntentDeclaration(
  input: CreateIntentInput
): Promise<ATSPIntentDeclaration> {
  const timestamp = Date.now()
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

async function sha256(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message)
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    globalThis.crypto.subtle
  ) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  const { createHash } = await import('crypto')
  return createHash('sha256').update(message).digest('hex')
}
