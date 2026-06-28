import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const vendorPath = fileURLToPath(
  new URL('../../src/renderer/editor/vendor/drag-handle.ts', import.meta.url),
)

describe('vendored drag-handle — view-mode support', () => {
  const src = readFileSync(vendorPath, 'utf8')

  it('captures and restores editable around a drag (Edit 3)', () => {
    expect(src).toContain('preDragEditable')
    expect((src.match(/editor\.setEditable/g) ?? []).length).toBe(2)
  })

  it('restored !editor.isEditable guards so handles only show in edit mode', () => {
    // showHandle() guards, update() hides, onDragStart captures — three
    // runtime reads plus the one in the modification comment header.
    const matches = src.match(/editor\.isEditable/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })
})
