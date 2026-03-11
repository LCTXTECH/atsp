/**
 * ATSP v1.0 — Runtime Validation Functions
 * Validates ATSPIntentDeclaration objects before middleware submission.
 */

import type {
  ATSPIntentDeclaration,
  ATSPValidationResult,
  ATSPAction,
} from './types'
import { ATSP_VERSION } from './types'

/** Valid Solana base58 mint address: 32–44 alphanumeric chars, no 0/O/I/l */
const MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Valid 64-char lowercase hex string (SHA-256 output) */
const HASH_REGEX = /^[0-9a-f]{64}$/

/** ATSP declarations expire after 60 seconds */
const DECLARATION_TTL_MS = 60_000

/** Actions that require slippage to be specified */
const SLIPPAGE_REQUIRED: ATSPAction[] = ['SWAP', 'LP']

/**
 * Validates an ATSPIntentDeclaration against the v1.0 protocol rules.
 * This is a client-side pre-flight check. The middleware performs
 * its own independent validation including policy enforcement.
 *
 * @param declaration - The declaration to validate
 * @returns ATSPValidationResult with errors, warnings, and a risk score
 */
export function validateDeclaration(
  declaration: ATSPIntentDeclaration
): ATSPValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let riskScore = 0.0

  // version
  if (!declaration.version || declaration.version !== ATSP_VERSION) {
    errors.push(`version must be '${ATSP_VERSION}', got '${declaration.version}'`)
  }

  // agentId
  if (!declaration.agentId || declaration.agentId.trim().length === 0) {
    errors.push('agentId is required and cannot be empty')
  }

  // proposerPubKey
  if (!declaration.proposerPubKey || !MINT_REGEX.test(declaration.proposerPubKey)) {
    errors.push('proposerPubKey must be a valid Solana public key (base58, 32–44 chars)')
  }

  // intentHash — format check only here; use verifyIntentHash() for integrity check
  if (!declaration.intentHash || !HASH_REGEX.test(declaration.intentHash)) {
    errors.push('intentHash must be a 64-character lowercase SHA-256 hex string')
  }

  // timestamp
  if (typeof declaration.timestamp !== 'number' || declaration.timestamp <= 0) {
    errors.push('timestamp must be a positive Unix millisecond timestamp')
  } else {
    const ageMs = Date.now() - declaration.timestamp
    if (ageMs > DECLARATION_TTL_MS) {
      errors.push(
        `declaration expired: ${Math.round(ageMs / 1000)}s old (TTL is ${DECLARATION_TTL_MS / 1000}s)`
      )
    }
    if (ageMs < -5000) {
      // allow 5s clock skew
      errors.push('declaration timestamp is more than 5s in the future — check system clock')
    }
  }

  // action
  const validActions: ATSPAction[] = ['SWAP', 'TRANSFER', 'LP', 'STAKE', 'UNSTAKE', 'VOTE']
  if (!declaration.action || !validActions.includes(declaration.action)) {
    errors.push(`action must be one of: ${validActions.join(', ')}`)
  }

  // amount
  if (typeof declaration.amount !== 'number' || declaration.amount <= 0) {
    errors.push('amount must be a positive number')
  } else {
    if (declaration.amount > 1_000_000) {
      riskScore += 0.5
      warnings.push(`amount ${declaration.amount} is very large — verify this is in native token units, not USD`)
    } else if (declaration.amount > 10_000) {
      riskScore += 0.3
    } else if (declaration.amount > 1_000) {
      riskScore += 0.15
    }
  }

  // tokenMint
  if (!declaration.tokenMint || !MINT_REGEX.test(declaration.tokenMint)) {
    errors.push('tokenMint must be a valid Solana mint address (base58, 32–44 chars)')
  }

  // reasoning
  if (!declaration.reasoning || declaration.reasoning.trim().length < 10) {
    errors.push('reasoning must be at least 10 characters — agents must explain their intent')
  } else if (declaration.reasoning.trim().length < 25) {
    warnings.push('reasoning is very short — more detail improves audit trail quality')
  }

  // slippage
  if (SLIPPAGE_REQUIRED.includes(declaration.action as ATSPAction)) {
    if (declaration.slippage === undefined || declaration.slippage === null) {
      errors.push(`slippage is required for ${declaration.action} actions`)
    }
  }
  if (declaration.slippage !== undefined) {
    if (typeof declaration.slippage !== 'number' || declaration.slippage < 0 || declaration.slippage > 100) {
      errors.push('slippage must be a number between 0 and 100')
    } else if (declaration.slippage > 20) {
      errors.push(`slippage ${declaration.slippage}% exceeds ATSP safety maximum of 20%`)
      riskScore += 0.4
    } else if (declaration.slippage > 10) {
      warnings.push(`slippage ${declaration.slippage}% is high — verify this is intentional`)
      riskScore += 0.25
    } else if (declaration.slippage > 5) {
      riskScore += 0.1
    }
  }

  // decisionTrace
  if (!declaration.decisionTrace) {
    errors.push('decisionTrace is required — agents must record their reasoning')
  } else {
    if (!declaration.decisionTrace.reasoning || declaration.decisionTrace.reasoning.trim().length < 10) {
      errors.push('decisionTrace.reasoning must be at least 10 characters')
    }
    if (
      typeof declaration.decisionTrace.confidence !== 'number' ||
      declaration.decisionTrace.confidence < 0 ||
      declaration.decisionTrace.confidence > 1
    ) {
      errors.push('decisionTrace.confidence must be a number between 0.0 and 1.0')
    } else if (declaration.decisionTrace.confidence < 0.5) {
      riskScore += 0.15
      warnings.push(
        `agent confidence is ${declaration.decisionTrace.confidence} — low confidence transactions carry higher risk`
      )
    }
    if (!declaration.decisionTrace.ipiCleared) {
      riskScore += 0.2
      warnings.push('ipiCleared is false — Indirect Prompt Injection scan was not performed')
    }
    if (!declaration.decisionTrace.input || Object.keys(declaration.decisionTrace.input).length === 0) {
      warnings.push('decisionTrace.input is empty — agents should record the data they acted on')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskScore: Math.min(1.0, riskScore),
  }
}

/**
 * Recomputes and verifies the intentHash of a declaration.
 *
 * The intentHash is computed as SHA-256(agentId:action:amount:tokenMint:timestamp).
 * This function recomputes it from the declaration fields and compares
 * to the stored intentHash to detect tampering.
 *
 * IMPORTANT: Always call this in middleware BEFORE evaluating policies.
 * A failed hash verification means the declaration was modified after creation
 * and should be rejected regardless of policy checks.
 *
 * @param declaration - The declaration to verify
 * @returns true if intentHash matches the recomputed hash, false if tampered
 *
 * @example
 * const trusted = await verifyIntentHash(declaration)
 * if (!trusted) throw new Error('ATSP: intentHash mismatch — declaration may be tampered')
 */
export async function verifyIntentHash(
  declaration: ATSPIntentDeclaration
export async function verifyIntentHash(
  declaration: ATSPIntentDeclaration,
): Promise {
  if (!declaration.intentHash) return false
  const hashInput = `${declaration.agentId}:${declaration.action}:${declaration.amount}:${declaration.tokenMint}:${declaration.timestamp}`
  const expected = await sha256(hashInput)
  return expected === declaration.intentHash
}

/**
 * Checks if an ATSP declaration has expired.
 *
 * @param declaration - Declaration to check
 * @param ttlMs - Time to live in ms (default: 60000)
 */
export function isExpired(
  declaration: ATSPIntentDeclaration,
  ttlMs = DECLARATION_TTL_MS
): boolean {
  return Date.now() - declaration.timestamp > ttlMs
}

/**
 * Returns a severity level string from a risk score.
 * Useful for display in dashboards and alerts.
 */
export function riskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.8) return 'CRITICAL'
  if (score >= 0.5) return 'HIGH'
  if (score >= 0.25) return 'MEDIUM'
  return 'LOW'
}

/**
 * Cross-environment SHA-256.
 * Works in Node.js, browser, Vercel Edge, Cloudflare Workers.
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
