/**
 * GFM table helpers shared by the editor's table widget and the export
 * serializer, so column alignment renders identically on every surface.
 */

export type ColumnAlign = 'left' | 'center' | 'right'

/** Parse a delimiter row (`| :--- | :--: | --: |`) into per-column alignment. */
export function tableAlignments(delimiterLine: string): ColumnAlign[] {
  return delimiterLine
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => {
      const c = cell.trim()
      const left = c.startsWith(':')
      const right = c.endsWith(':')
      if (left && right) return 'center'
      if (right) return 'right'
      return 'left'
    })
}

/** `style` attribute for a cell with the given alignment (empty for left). */
export function alignStyle(align: ColumnAlign | undefined): string {
  return align && align !== 'left' ? ` style="text-align:${align}"` : ''
}
