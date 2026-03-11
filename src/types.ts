/**
 * ATSP v1.0 — Core TypeScript Interfaces
 * https://agentsentry.net/protocol/atsp
 */

export const ATSP_VERSION = '1.0' as const
export type ATSPVersion = typeof ATSP_VERSION

export type ATSPAction =
  | 'SWAP'
  | 'TRANSFER'
  | 'LP'
  | 'STAKE'
  | 'UNSTAKE'
  | 'VOTE'

export type ATSPVerdict = 'ALLOW' | 'BLOCK' | 'ESCALATE_TO_HUMAN'

export type ATSPCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface ATSPDecisionTrace {
  /** The raw input data the agent used to make this decision */
  input: Record<string, unknown>
  /** Step-by-step human-readable reasoning */
  reasoning: string
  /** Agent self-reported confidence 0.0–1.0 */
  confidence: number
  /** True if agent ran an IPI scan on input context */
  ipiCleared: boolean
  /** Optional: model or agent version identifier */
  modelId?: string
}

export interface ATSPIntentDeclaration {
  version: ATSPVersion
  agentId: string
  proposerPubKey: string
  intentHash: string
  timestamp: number
  action: ATSPAction
  amount: number
  tokenMint: string
  slippage?: number
  reasoning: string
  decisionTrace: ATSPDecisionTrace
  sentryVerdict?: ATSPVerdict
  sentryLogId?: string
  circuitState?: ATSPCircuitState
}

export interface ATSPValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  riskScore: number
}

export interface ATSPMiddlewareConfig {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
  failOpen?: boolean
}
