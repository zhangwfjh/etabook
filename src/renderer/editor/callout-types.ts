export type CalloutKind = {
  canonical: string
  aliases?: string[]
  icon: string
  label: string
  colorVar: string
  math?: boolean
}

export const CALLOUT_TYPES: CalloutKind[] = [
  // ── Obsidian 13
  { canonical: 'note',      icon: 'ℹ',  label: 'Note',      colorVar: 'note' },
  { canonical: 'abstract',  aliases: ['summary', 'tldr'], icon: '📋', label: 'Abstract', colorVar: 'abstract' },
  { canonical: 'info',      icon: 'ℹ',  label: 'Info',      colorVar: 'info' },
  { canonical: 'todo',      icon: '☑',  label: 'To Do',     colorVar: 'todo' },
  { canonical: 'tip',       aliases: ['hint', 'important'], icon: '💡', label: 'Tip', colorVar: 'tip' },
  { canonical: 'success',   aliases: ['check', 'done'], icon: '✓', label: 'Success', colorVar: 'success' },
  { canonical: 'question',  aliases: ['help', 'faq'], icon: '?', label: 'Question', colorVar: 'question' },
  { canonical: 'warning',   aliases: ['caution', 'attention'], icon: '⚠', label: 'Warning', colorVar: 'warning' },
  { canonical: 'failure',   aliases: ['fail', 'missing'], icon: '✕', label: 'Failure', colorVar: 'failure' },
  { canonical: 'danger',    aliases: ['error'], icon: '⚡', label: 'Danger', colorVar: 'danger' },
  { canonical: 'bug',       icon: '🐛', label: 'Bug',       colorVar: 'bug' },
  { canonical: 'example',   icon: '📖', label: 'Example',   colorVar: 'example' },
  { canonical: 'quote',     aliases: ['cite'], icon: '“', label: 'Quote', colorVar: 'quote' },
  // ── Math 8
  { canonical: 'theorem',     icon: '★', label: 'Theorem',     colorVar: 'theorem',     math: true },
  { canonical: 'lemma',       icon: '★', label: 'Lemma',       colorVar: 'lemma',       math: true },
  { canonical: 'corollary',   icon: '★', label: 'Corollary',   colorVar: 'corollary',   math: true },
  { canonical: 'proposition', icon: '★', label: 'Proposition', colorVar: 'proposition', math: true },
  { canonical: 'definition',  icon: '≡', label: 'Definition',  colorVar: 'definition',  math: true },
  { canonical: 'proof',       icon: '∎', label: 'Proof',       colorVar: 'proof',       math: true },
  { canonical: 'remark',      icon: '·', label: 'Remark',      colorVar: 'remark',      math: true },
  { canonical: 'algorithm',   icon: '⌗', label: 'Algorithm',   colorVar: 'algorithm',   math: true },
]

const lookup = new Map<string, CalloutKind>()
for (const kind of CALLOUT_TYPES) {
  lookup.set(kind.canonical.toLowerCase(), kind)
  for (const alias of kind.aliases ?? []) {
    lookup.set(alias.toLowerCase(), kind)
  }
}

export type ResolvedCalloutType = {
  kind: CalloutKind | null
  canonical: string
  rawType: string
}

export function resolveCalloutType(raw: string): ResolvedCalloutType {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  const kind = lookup.get(lower) ?? null
  return {
    kind,
    canonical: kind?.canonical ?? 'note',
    rawType: trimmed,
  }
}
