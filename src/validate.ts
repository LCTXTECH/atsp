// ATSP v1.0 - Runtime Validation Functions
// https://agentsentry.net/protocol/atsp

import type { ATSPIntentDeclaration, ATSPValidationResult, ATSPAction } from './types'
import { ATSP_VERSION } from './types'

const MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const HASH_REGEX = /^[0-9a-f]{64}$/
const DECLARATION_TTL_MS = 60_000
const SLIPPAGE_REQUIRED: ATSPAction[] = ['SWAP', 'LP']

// Validates a declaration against ATSP v1.0 rules.
// Returns errors (blockers), warnings (advisory), and a risk score 0.0-1.0.
export function validateDeclaration(declaration: ATSPIntentDeclaration): ATSPValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let riskScore = 0.0

  if (!declaration.version || declaration.version !== ATSP_VERSION) {
    errors.push("version must be '1.0', got '" + declaration.version + "'")
  }

  if (!declaration.agentId || declaration.agentId.trim().length === 0) {
    errors.push('agentId is required and cannot be empty')
  }

  if (!declaration.proposerPubKey || !MINT_REGEX.test(declaration.proposerPubKey)) {
    errors.push('proposerPubKey must be a valid Solana public key (base58, 32-44 chars)')
  }

  if (!declaration.intentHash || !HASH_REGEX.test(declaration.intentHash)) {
    errors.push('intentHash must be a 64-character lowercase SHA-256 hex string')
  }

  if (typeof declaration.timestamp !== 'number' || declaration.timestamp <= 0) {
    errors.push('timestamp must be a positive Unix millisecond timestamp')
  } else {
    const ageMs = Date.now() - declaration.timestamp
    if (ageMs > DECLARATION_TTL_MS) {
      errors.push('declaration expired: ' + Math.round(ageMs / 1000) + 's old (TTL is 60s)')
    }
    if (ageMs < -5000) {
      errors.push('declaration timestamp is more than 5s in the future')
    }
  }

  const validActions: ATSPAction[] = ['SWAP', 'TRANSFER', 'LP', 'STAKE', 'UNSTAKE', 'VOTE']
  if (!declaration.action || !validActions.includes(declaration.action)) {
    errors.push('action must be one of: ' + validActions.join(', '))
  }

  if (typeof declaration.amount !== 'number' || declaration.amount <= 0) {
    errors.push('amount must be a positive number')
  } else {
    if (declaration.amount > 1_000_000) {
      riskScore += 0.5
      warnings.push('amount ' + declaration.amount + ' is very large — verify units are correct')
    } else if (declaration.amount > 10_000) {
      riskScore += 0.3
    } else if (declaration.amount > 1_000) {
      riskScore += 0.15
    }
  }

  if (!declaration.tokenMint || !MINT_REGEX.test(declaration.tokenMint)) {
    errors.push('tokenMint must be a valid Solana mint address (base58, 32-44 chars)')
  }

  if (!declaration.reasoning || declaration.reasoning.trim().length < 10) {
    errors.push('reasoning must be at least 10 characters')
  } else if (declaration.reasoning.trim().length < 25) {
    warnings.push('reasoning is very short — more detail improves the audit trail')
  }

  if (SLIPPAGE_REQUIRED.includes(declaration.action as ATSPAction)) {
    if (declaration.slippage === undefined || declaration.slippage === null) {
      errors.push('slippage is required for ' + declaration.action + ' actions')
    }
  }

  if (declaration.slippage !== undefined) {
    if (typeof declaration.slippage !== 'number' || declaration.slippage < 0 || declaration.slippage > 100) {
      errors.push('slippage must be a number between 0 and 100')
    } else if (declaration.slippage > 20) {
      errors.push('slippage ' + declaration.slippage + '% exceeds ATSP safety maximum of 20%')
      riskScore += 0.4
    } else if (declaration.slippage > 10) {
      warnings.push('slippage ' + declaration.slippage + '% is high — verify this is intentional')
      riskScore += 0.25
    } else if (declaration.slippage > 5) {
      riskScore += 0.1
    }
  }

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
      warnings.push('agent confidence ' + declaration.decisionTrace.confidence + ' is low — higher risk')
    }
    if (!declaration.decisionTrace.ipiCleared) {
      riskScore += 0.2
      warnings.push('ipiCleared is false — IPI scan was not performed on input context')
    }
    if (!declaration.decisionTrace.input || Object.keys(declaration.decisionTrace.input).length === 0) {
      warnings.push('decisionTrace.input is empty — record the data the agent acted on')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskScore: Math.min(1.0, riskScore),
  }
}

// Recomputes intentHash from declaration fields and compares to stored value.
// Returns false if fields were tampered with after hash creation.
// Middleware MUST call this before evaluating any policies.
export async function verifyIntentHash(declaration: ATSPIntentDeclaration): Promise<boolean> {
  if (!declaration.intentHash) return false
  const raw = declaration.agentId + ':' + declaration.action + ':' + declaration.amount + ':' + declaration.tokenMint + ':' + declaration.timestamp
  const expected = await sha256(raw)
  return expected === declaration.intentHash
}

// Returns true if the declaration has passed its 60-second TTL.
export function isExpired(declaration: ATSPIntentDeclaration, ttlMs: number = DECLARATION_TTL_MS): boolean {
  return Date.now() - declaration.timestamp > ttlMs
}

// Converts a numeric risk score to a named severity level.
export function riskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.8) return 'CRITICAL'
  if (score >= 0.5) return 'HIGH'
  if (score >= 0.25) return 'MEDIUM'
  return 'LOW'
}

// SHA-256 helper — works in Node.js, browser, Vercel Edge, Cloudflare Workers.
async function sha256(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(buf))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  const { createHash } = await import('crypto')
  return createHash('sha256').update(message).digest('hex')
}
