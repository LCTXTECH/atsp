/**
 * ATSP v1.0 — Core TypeScript Interfaces
 * Agentic Transaction Security Protocol
 * https://agentsentry.net/protocol/atsp
 */

/** Protocol version */
export const ATSP_VERSION = '1.0' as const
export type ATSPVersion = typeof ATSP_VERSION

/**
 * All on-chain actions an AI agent can propose.
 * Extend this enum via RFC for new action types.
 */
export type ATSPAction =
  | 'SWAP'       // Token swap via DEX (Jupiter, Raydium)
  | 'TRANSFER'   // Direct SOL or token transfer
  | 'LP'         // Add/remove liquidity from a pool
  | 'STAKE'      // Stake SOL or tokens
  | 'UNSTAKE'    // Unstake / begin unbonding
  | 'VOTE'       // On-chain governance vote

/**
 * The verdict returned by an ATSP-compliant security middleware.
 * ALLOW: transaction may proceed
 * BLOCK: transaction is rejected — circuit breaker may trip
 * ESCALATE_TO_HUMAN: transaction is held pending human approval
 */
export type ATSPVerdict = 'ALLOW' | 'BLOCK' | 'ESCALATE_TO_HUMAN'

/**
 * The circuit breaker state of the agent at the time of the decision.
 * CLOSED: normal operation
 * OPEN: all transactions blocked — circuit has tripped
 * HALF_OPEN: recovery mode — only low-risk transactions allowed
 */
export type ATSPCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

/**
 * The immutable decision trace produced by the AI agent.
 * This is the "flight recorder" — stored permanently in the audit log.
 */
export interface ATSPDecisionTrace {
  /** The raw input data the agent used to make this decision */
  input: Record
  /** Step-by-step human-readable reasoning of the agent's decision */
  reasoning: string
  /** Agent's self-reported confidence 0.0 (none) to 1.0 (certain) */
  confidence: number
  /** True if the agent ran an Indirect Prompt Injection (IPI) scan on input context */
  ipiCleared: boolean
  /** Optional: name of the model or agent version that produced this trace */
  modelId?: string
}

/**
 * ATSPIntentDeclaration — the core protocol object.
 *
 * An AI agent MUST produce one of these and receive an ALLOW verdict
 * from an ATSP-compliant middleware BEFORE broadcasting any transaction.
 *
 * @example
 * const declaration = await createIntentDeclaration({ ... })
 * const result = validateDeclaration(declaration)
 */
export interface ATSPIntentDeclaration {
  /** Always '1.0' — used for backward compatibility checks */
  version: ATSPVersion

  /** The agent's unique Non-Human Identity (NHI) identifier */
  agentId: string

  /**
   * The Squads V4 Proposer public key this agent uses.
   * Must be a registered proposer on the Squad, NOT an owner key.
   */
  proposerPubKey: string

  /**
   * SHA-256 hash of: agentId + action + amount + tokenMint + timestamp
   * Used to detect tampering between declaration and execution.
   */
  intentHash: string

  /**
   * Unix timestamp in milliseconds when this declaration was created.
   * Declarations expire after 60,000ms (60 seconds).
   * Middleware MUST reject stale declarations.
   */
  timestamp: number

  /** The on-chain action the agent intends to execute */
  action: ATSPAction

  /** Amount in native token units (SOL = lamports / 1e9) */
  amount: number

  /** Solana token mint address (base58, 32-44 chars) */
  tokenMint: string

  /**
   * Maximum acceptable slippage as a percentage (0–100).
   * Required for SWAP and LP actions.
   */
  slippage?: number

  /**
   * Human-readable explanation of WHY the agent wants to do this.
   * Minimum 10 characters. This is critical for audit trails.
   * @example "Rebalancing: SOL/USDC ratio exceeded 60% threshold"
   */
  reasoning: string

  /** The agent's full decision trace — immutably stored in audit log */
  decisionTrace: ATSPDecisionTrace

  // --- Fields set by middleware AFTER validation ---

  /** Set by the security middleware after evaluating this declaration */
  sentryVerdict?: ATSPVerdict

  /** Audit log ID from the middleware — for support and compliance queries */
  sentryLogId?: string

  /** The circuit breaker state at the time of the decision */
  circuitState?: ATSPCircuitState
}

/**
 * The result returned when calling validateDeclaration()
 */
export interface ATSPValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  /** Computed severity score 0.0–1.0 based on risk signals in the declaration */
  riskScore: number
}

/**
 * Configuration for the ATSP middleware check-in endpoint.
 * Used when integrating AgentSentry or any ATSP-compliant security layer.
 */
export interface ATSPMiddlewareConfig {
  /** Base URL of the ATSP middleware (e.g. https://agentsentry.net) */
  baseUrl: string
  /** API key for authentication */
  apiKey: string
  /** Timeout in ms before the check-in is considered failed (default: 5000) */
  timeoutMs?: number
  /**
   * If true and middleware is unreachable, allow the transaction anyway.
   * DANGER: set to false in production.
   */
  failOpen?: boolean
}
