// Ambient declarations for non-TS asset imports in the renderer.
declare module '*.css'
declare module '*.scss'
declare module '*.svg'
declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.gif'
declare module '*.webp'

// Fontsource per-weight CSS imports.
declare module '@fontsource-variable/*'
declare module '@fontsource/*/400.css'
declare module '@fontsource/*/500.css'
declare module '@fontsource/*/600.css'
declare module '@fontsource/*/700.css'
declare module '@fontsource/*'

// KaTeX stylesheet.
declare module 'katex/dist/katex.min.css'

// markdown-it plugins without bundled types.
declare module 'markdown-it-footnote'
declare module 'markdown-it-task-lists'
