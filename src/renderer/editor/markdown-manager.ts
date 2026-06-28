import { MarkdownManager } from '@tiptap/markdown'
import { buildExtensions } from './extensions'
import { patchSerializerEscape } from './markdown-serializer-patch'

// Apply the escape-preserving patch once at module load. The stock
// @tiptap/markdown (v3.26.0) unconditionally HTML-encodes (`&`→`&amp;`) and
// backslash-escapes `[`,`]`,`*`,`_`,`` ` ``,`~`,`\` in *every* text node via
// private methods with no override hook — mangling raw markdown on round-trip
// (e.g. `[[wikilink]]`→`\[\[wikilink\]\]`, `Tom & Jerry`→`Tom &amp; Jerry`).
// Both methods are private, so we swap them on the prototype before any
// instance is created. See markdown-serializer-patch.ts for the full rationale.
patchSerializerEscape(MarkdownManager)

let cached: MarkdownManager | null = null

export function getMarkdownManager(): MarkdownManager {
  if (cached) return cached
  const exts = buildExtensions()
  cached = new MarkdownManager({ extensions: exts })
  return cached
}
