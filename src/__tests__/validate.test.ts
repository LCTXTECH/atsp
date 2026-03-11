/**
 * ATSP v1.0 — Validation Test Suite
 * Tests for validateDeclaration() and verifyIntentHash()
 */

import { validateDeclaration, verifyIntentHash, isExpired, riskLevel } from '../validate'
import { createIntentDeclaration } from '../index'
import type { ATSPIntentDeclaration } from '../types'

// ─── Shared valid base declaration ───────────────────────────────────────────

const VALID_AGENT_ID   = 'eliza-agent-001'
const VALID_PROPOSER   = 'So11111111111111111111111111111111111111112'
const VALID_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
const VALID_HASH       = 'a'.repeat(64) // 64-char hex placeholder

function makeValid(overrides: Partial<ATSPIntentDeclaration> = {}): ATSPIntentDeclaration {
  return {
    version: '1.0',
    agentId: VALID_AGENT_ID,
    proposerPubKey: VALID_PROPOSER,
    intentHash: VALID_HASH,
    timestamp: Date.now(),
    action: 'SWAP',
    amount: 10.5,
    tokenMint: VALID_TOKEN_MINT,
    slippage: 1.5,
    reasoning: 'Rebalancing portfolio: SOL/USDC ratio exceeded 60% threshold',
    decisionTrace: {
      input: { price: 145.2, ratio: 0.63 },
      reasoning: 'Step 1: check ratio. Step 2: threshold exceeded. Step 3: propose swap.',
      confidence: 0.87,
      ipiCleared: true,
    },
    ...overrides,
  }
}

// ─── validateDeclaration ─────────────────────────────────────────────────────

describe('validateDeclaration', () => {

  test('valid declaration passes with no errors', () => {
    const result = validateDeclaration(makeValid())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('wrong version returns error', () => {
    const result = validateDeclaration(makeValid({ version: '2.0' as '1.0' }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/version must be/)
  })

  test('empty agentId returns error', () => {
    const result = validateDeclaration(makeValid({ agentId: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/agentId/)
  })

  test('invalid proposerPubKey returns error', () => {
    const result = validateDeclaration(makeValid({ proposerPubKey: 'not-a-key' }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/proposerPubKey/)
  })

  test('malformed intentHash returns error', () => {
    const result = validateDeclaration(makeValid({ intentHash: 'tooshort' }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/intentHash/)
  })

  test('expired declaration returns error', () => {
    const result = validateDeclaration(
      makeValid({ timestamp: Date.now() - 120_000 }) // 2 minutes ago
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/expired/)
  })

  test('SWAP without slippage returns error', () => {
    const { slippage: _, ...rest } = makeValid()
    const result = validateDeclaration(rest as ATSPIntentDeclaration)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/slippage is required/)
  })

  test('TRANSFER without slippage is valid', () => {
    const { slippage: _, ...rest } = makeValid({ action: 'TRANSFER' })
    const result = validateDeclaration(rest as ATSPIntentDeclaration)
    expect(result.valid).toBe(true)
  })

  test('slippage > 20% returns error', () => {
    const result = validateDeclaration(makeValid({ slippage: 25 }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/exceeds ATSP safety maximum/)
  })

  test('slippage > 10% adds warning and increases riskScore', () => {
    // 15% is between 10-20% — warning only, not a blocking error
    const result = validateDeclaration(makeValid({ slippage: 15 }))
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('high'))).toBe(true)
    expect(result.riskScore).toBeGreaterThan(0)
  })
    const result = validateDeclaration(
      makeValid({ decisionTrace: { ...makeValid().decisionTrace, ipiCleared: false } })
    )
    expect(result.valid).toBe(true) // warning, not error
    expect(result.warnings.some(w => w.includes('ipiCleared'))).toBe(true)
    expect(result.riskScore).toBeGreaterThan(0)
  })

  test('low confidence adds warning', () => {
    const result = validateDeclaration(
      makeValid({ decisionTrace: { ...makeValid().decisionTrace, confidence: 0.3 } })
    )
    expect(result.warnings.some(w => w.includes('confidence'))).toBe(true)
  })

  test('missing decisionTrace returns error', () => {
    const result = validateDeclaration(
      makeValid({ decisionTrace: undefined as never })
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/decisionTrace/)
  })

  test('riskScore is capped at 1.0', () => {
    const result = validateDeclaration(
      makeValid({
        amount: 999_999,
        slippage: 12,
        decisionTrace: { ...makeValid().decisionTrace, ipiCleared: false, confidence: 0.2 },
      })
    )
    expect(result.riskScore).toBeLessThanOrEqual(1.0)
  })

})

// ─── verifyIntentHash ────────────────────────────────────────────────────────

describe('verifyIntentHash', () => {

  test('valid declaration verifies correctly', async () => {
    const declaration = await createIntentDeclaration({
      agentId: VALID_AGENT_ID,
      proposerPubKey: VALID_PROPOSER,
      action: 'SWAP',
      amount: 10.5,
      tokenMint: VALID_TOKEN_MINT,
      slippage: 1.5,
      reasoning: 'Test reasoning for hash verification',
      decisionTrace: {
        input: { test: true },
        reasoning: 'Test trace reasoning here',
        confidence: 0.9,
        ipiCleared: true,
      },
    })
    const valid = await verifyIntentHash(declaration)
    expect(valid).toBe(true)
  })

  test('tampered amount fails hash verification', async () => {
    const declaration = await createIntentDeclaration({
      agentId: VALID_AGENT_ID,
      proposerPubKey: VALID_PROPOSER,
      action: 'SWAP',
      amount: 10.5,
      tokenMint: VALID_TOKEN_MINT,
      slippage: 1.5,
      reasoning: 'Test reasoning for tampering test',
      decisionTrace: {
        input: {},
        reasoning: 'Trace for tamper test',
        confidence: 0.9,
        ipiCleared: true,
      },
    })
    // Tamper with amount after hash was computed
    const tampered = { ...declaration, amount: 999999 }
    const valid = await verifyIntentHash(tampered)
    expect(valid).toBe(false)
  })

})

// ─── isExpired ───────────────────────────────────────────────────────────────

describe('isExpired', () => {
  test('fresh declaration is not expired', () => {
    expect(isExpired(makeValid())).toBe(false)
  })
  test('old declaration is expired', () => {
    expect(isExpired(makeValid({ timestamp: Date.now() - 90_000 }))).toBe(true)
  })
  test('custom TTL works', () => {
    expect(isExpired(makeValid({ timestamp: Date.now() - 5_000 }), 3_000)).toBe(true)
  })
})

// ─── riskLevel ───────────────────────────────────────────────────────────────

describe('riskLevel', () => {
  test('0.0 = LOW', ()  => expect(riskLevel(0.0)).toBe('LOW'))
  test('0.3 = MEDIUM',  () => expect(riskLevel(0.3)).toBe('MEDIUM'))
  test('0.6 = HIGH',    () => expect(riskLevel(0.6)).toBe('HIGH'))
  test('0.9 = CRITICAL',() => expect(riskLevel(0.9)).toBe('CRITICAL'))
})
