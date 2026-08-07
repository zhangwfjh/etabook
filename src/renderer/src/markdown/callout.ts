/**
 * Callout metadata — shared by the live-preview widget and the export serializer.
 *
 * Type → Lucide icon + default title, matching Obsidian's built-in callout set.
 * Icon SVGs use `stroke="currentColor"` so they inherit the per-type accent
 * color from CSS (`.lp-callout-${type}` / `.ofm-callout-${type}` sets `color`).
 *
 * Lucide path data extracted from lucide-react@0.544.0 (ISC).
 */

function iconSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

const ICONS = {
  info: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  pencil: iconSvg('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
  check: iconSvg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  question: iconSvg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  warning: iconSvg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  danger: iconSvg('<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>'),
  bug: iconSvg('<path d="M12 20v-9"/><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/><path d="M14.12 3.88 16 2"/><path d="M21 21a4 4 0 0 0-3.81-4"/><path d="M21 5a4 4 0 0 1-3.55 3.97"/><path d="M22 13h-4"/><path d="M3 21a4 4 0 0 1 3.81-4"/><path d="M3 5a4 4 0 0 0 3.55 3.97"/><path d="M6 13H2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/>'),
  flame: iconSvg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  example: iconSvg('<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>'),
  quote: iconSvg('<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'),
  abstract: iconSvg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  bookmark: iconSvg('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>')
}

/** type → [iconKey, defaultTitle] */
const TYPE_MAP: Record<string, readonly [keyof typeof ICONS, string]> = {
  note: ['pencil', 'Note'],
  info: ['info', 'Info'],
  abstract: ['abstract', 'Abstract'],
  summary: ['abstract', 'Summary'],
  tldr: ['abstract', 'TL;DR'],
  todo: ['check', 'To-Do'],
  tip: ['flame', 'Tip'],
  hint: ['flame', 'Hint'],
  important: ['flame', 'Important'],
  success: ['check', 'Success'],
  check: ['check', 'Check'],
  done: ['check', 'Done'],
  question: ['question', 'Question'],
  help: ['question', 'Help'],
  faq: ['question', 'FAQ'],
  warning: ['warning', 'Warning'],
  caution: ['warning', 'Caution'],
  attention: ['warning', 'Attention'],
  danger: ['danger', 'Danger'],
  error: ['danger', 'Error'],
  failure: ['danger', 'Failure'],
  fail: ['danger', 'Fail'],
  missing: ['danger', 'Missing'],
  bug: ['bug', 'Bug'],
  example: ['example', 'Example'],
  quote: ['quote', 'Quote'],
  cite: ['quote', 'Cite'],
  seealso: ['bookmark', 'See Also']
}

export interface CalloutMeta {
  type: string
  defaultTitle: string
  icon: string
}

export function calloutMeta(type: string): CalloutMeta {
  const lower = type.toLowerCase()
  const entry = TYPE_MAP[lower]
  if (entry) {
    return { type: lower, defaultTitle: entry[1], icon: ICONS[entry[0]] }
  }
  // Unknown type: info icon + capitalized type name.
  const title = type.charAt(0).toUpperCase() + type.slice(1)
  return { type: lower, defaultTitle: title, icon: ICONS.info }
}
