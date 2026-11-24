import { describe, expect, it } from 'vitest'
import { isEnabled } from './account'

describe('account settings values (ADR-026)', () => {
  it('only an explicit off turns the assistant off', () => {
    for (const off of [false, 0, '0']) expect(isEnabled(off)).toBe(false)
    for (const on of [true, 1, undefined, null]) expect(isEnabled(on)).toBe(true)
  })
})
