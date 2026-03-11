import { validateDeclaration, verifyIntentHash, isExpired, riskLevel } from '../validate'
import { createIntentDeclaration } from '../index'
import type { ATSPIntentDeclaration } from '../types'

const VALID_PROPOSER   = 'So11111111111111111111111111111111111111112'
const VALID_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const VALID_HASH       = 'a'.repeat(64)

function makeValid(overrides: Partial<ATSPIntentDeclaration> = {}): ATSPIntentDeclaration {
  return {
    version: '1.0',
    agentId: 'eliza-agent-001',
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
    const result = validateDeclaration(makeValid({ timestamp: Date.now() - 120_000 }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/expired/)
  })

  test('SWAP without slippage returns error', () => {
    const base = makeValid()
    const { slippage: _removed, ...rest } = base
    const result = validateDeclaration(rest as ATSPIntentDeclaration)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/slippage is required/)
  })

  test('TRANSFER without slippage is valid', () => {
    const base = makeValid({ action: 'TRANSFER' })
    const { slippage: _removed, ...rest } = base
    const result = validateDeclaration(rest as ATSPIntentDeclaration)
    expect(result.valid).toBe(true)
  })

  test('slippage > 20% returns error', () => {
    const result = validateDeclaration(makeValid({ slippage: 25 }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/exceeds ATSP safety maximum/)
  })

  test('slippage between 10-20% is a warning not an error', () => {
    const result = validateDeclaration(makeValid({ slippage: 15 }))
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes('high'))).toBe(true)
    expect(result.riskScore).toBeGreaterThan(0)
  })

  test('ipiCleared false adds warning and increases riskScore', () => {
    const trace = { ...makeValid().decisionTrace, ipiCleared: false }
    const result = validateDeclaration(makeValid({ decisionTrace: trace }))
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes('ipiCleared'))).toBe(true)
    expect(result.riskScore).toBeGreaterThan(0)
  })

  test('low confidence adds warning', () => {
    const trace = { ...makeValid().decisionTrace, confidence: 0.3 }
    const result = validateDeclaration(makeValid({ decisionTrace: trace }))
    expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true)
  })

  test('missing decisionTrace returns error', () => {
    const result = validateDeclaration(makeValid({ decisionTrace: undefined as never }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/decisionTrace/)
  })

  test('riskScore is capped at 1.0', () => {
    const trace = { ...makeValid().decisionTrace, ipiCleared: false, confidence: 0.2 }
    const result = validateDeclaration(makeValid({ amount: 999_999, slippage: 15, decisionTrace: trace }))
    expect(result.riskScore).toBeLessThanOrEqual(1.0)
  })

})

describe('verifyIntentHash', () => {

  test('valid declaration verifies correctly', async () => {
    const declaration = await createIntentDeclaration({
      agentId: 'eliza-agent-001',
      proposerPubKey: VALID_PROPOSER,
      action: 'SWAP',
      amount: 10.5,
      tokenMint: VALID_TOKEN_MINT,
      slippage: 1.5,
      reasoning: 'Test reasoning for hash verification',
      decisionTrace: {
        input: { test: true },
        reasoning: 'Test trace reasoning here for the test suite',
        confidence: 0.9,
        ipiCleared: true,
      },
    })
    expect(await verifyIntentHash(declaration)).toBe(true)
  })

  test('tampered amount fails hash verification', async () => {
    const declaration = await createIntentDeclaration({
      agentId: 'eliza-agent-001',
      proposerPubKey: VALID_PROPOSER,
      action: 'SWAP',
      amount: 10.5,
      tokenMint: VALID_TOKEN_MINT,
      slippage: 1.5,
      reasoning: 'Test reasoning for tampering detection test',
      decisionTrace: {
        input: {},
        reasoning: 'Trace for tamper detection test suite',
        confidence: 0.9,
        ipiCleared: true,
      },
    })
    const tampered = { ...declaration, amount: 999999 }
    expect(await verifyIntentHash(tampered)).toBe(false)
  })

})

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

describe('riskLevel', () => {
  test('0.0 = LOW',      () => expect(riskLevel(0.0)).toBe('LOW'))
  test('0.3 = MEDIUM',   () => expect(riskLevel(0.3)).toBe('MEDIUM'))
  test('0.6 = HIGH',     () => expect(riskLevel(0.6)).toBe('HIGH'))
  test('0.9 = CRITICAL', () => expect(riskLevel(0.9)).toBe('CRITICAL'))
})
