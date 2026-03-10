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

/** Valid Solana base58 mint address: 32–44 alphanumeric chars */
const MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** ATSP declarations expire after 60 seconds */
const DECLARATION_TTL_MS = 60_000

/** Actions that require slippage to be specified */
const SLIPPAGE_REQUIRED: ATSPAction[] = ['SWAP', 'LP']

/**
 * Validates an ATSPIntentDeclaration against the v1.0 protocol rules.
 *
 * This is a client-side pre-flight check. The middleware performs
 * its own independent validation including policy enforcement.
 *
 * @param declaration - The declaration to validate
 * @returns ATSPValidationResult with errors, warnings, and a risk score
 *
 * @example
 * const result = validateDeclaration(myDeclaration)
 * if (!result.valid) throw new Error(result.errors.join(', '))
 */
export function validateDeclaration(
  declaration: ATSPIntentDeclaration
): ATSPValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let riskScore = 0.0

  // --- Required field checks ---
  if (!declaration.version || declaration.version !== ATSP_VERSION) {
    errors.push(`version must be '${ATSP_VERSION}', got '${declaration.version}'`)
  }

  if (!declaration.agentId || declaration.agentId.trim().length === 0) {
    errors.push('agentId is required')
  }

  if (!declaration.proposerPubKey || !MINT_REGEX.test(declaration.proposerPubKey)) {
    errors.push('proposerPubKey must be a valid Solana public key (base58, 32–44 chars)')
  }

  if (!declaration.intentHash || declaration.intentHash.length !== 64) {
    errors.push('intentHash must be a 64-character SHA-256 hex string')
  }

  if (typeof declaration.timestamp !== 'number' || declaration.timestamp <= 0) {
    errors.push('timestamp must be a positive Unix millisecond timestamp')
  } else {
    const age = Date.now() - declaration.timestamp
    if (age > DECLARATION_TTL_MS) {
      errors.push(`declaration is expired: ${Math.round(age / 1000)}s old (max 60s)`)
    }
    if (age < 0) {
      errors.push('declaration timestamp is in the future — clock skew detected')
    }
  }

  if (!declaration.action) {
    errors.push('action is required')
  }

  if (typeof declaration.amount !== 'number' || declaration.amount <= 0) {
    errors.push('amount must be a positive number')
  } else {
    // Risk score: large amounts increase risk
    if (declaration.amount > 10000) riskScore += 0.4
    else if (declaration.amount > 1000) riskScore += 0.2
    else if (declaration.amount > 100) riskScore += 0.1
  }

  if (!declaration.tokenMint || !MINT_REGEX.test(declaration.tokenMint)) {
    errors.push('tokenMint must be a valid Solana mint address (base58, 32–44 chars)')
  }

  if (!declaration.reasoning || declaration.reasoning.trim().length < 10) {
    errors.push('reasoning must be at least 10 characters — agents must explain their intent')
  }

  // --- Slippage checks ---
  if (SLIPPAGE_REQUIRED.includes(declaration.action as ATSPAction)) {
    if (declaration.slippage === undefined || declaration.slippage === null) {
      errors.push(`slippage is required for ${declaration.action} actions`)
    }
  }

  if (declaration.slippage !== undefined) {
    if (declaration.slippage < 0 || declaration.slippage > 100) {
      errors.push('slippage must be between 0 and 100')
    }
    if (declaration.slippage > 10) {
      riskScore += 0.3
      warnings.push(`slippage of ${declaration.slippage}% is unusually high — verify intent`)
    }
    if (declaration.slippage > 20) {
      errors.push(`slippage of ${declaration.slippage}% exceeds ATSP safety threshold of 20%`)
    }
  }

  // --- Decision trace checks ---
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
    }
    if (!declaration.decisionTrace.ipiCleared) {
      riskScore += 0.2
      warnings.push('ipiCleared is false — IPI scan was not performed on input context')
    }
  }

  // Cap risk score at 1.0
  riskScore = Math.min(1.0, riskScore)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskScore,
  }
}

/**
 * Checks if an ATSP declaration has expired.
 * Middleware MUST call this before processing any declaration.
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
 * Computes a simple risk score (0.0–1.0) from a declaration.
 * Used by middleware to determine alert severity.
 *
 * @param declaration - The declaration to score
 * @returns number between 0.0 (low risk) and 1.0 (critical)
 */
export function computeRiskScore(declaration: ATSPIntentDeclaration): number {
  return validateDeclaration(declaration).riskScore
}
