import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './tabs'

describe('nextTabIndex', () => {
  it('moves with the arrow keys and wraps at both ends', () => {
    expect(nextTabIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0)
    expect(nextTabIndex(1, 'ArrowLeft', 3)).toBe(0)
    expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2)
  })

  it('jumps to the first and last tab with Home and End', () => {
    expect(nextTabIndex(1, 'Home', 3)).toBe(0)
    expect(nextTabIndex(0, 'End', 3)).toBe(2)
  })

  it('leaves every other key and an empty list alone', () => {
    expect(nextTabIndex(0, 'Enter', 3)).toBeNull()
    expect(nextTabIndex(0, 'ArrowDown', 3)).toBeNull()
    expect(nextTabIndex(0, 'ArrowRight', 0)).toBeNull()
  })
})
