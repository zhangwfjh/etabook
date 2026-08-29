import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { EditorMode } from '@shared/types'
import { nextUntitledName } from './fs'

export type Doc = {
  id: string
  path?: string
  name: string
  content: string
  dirty: boolean
  /** Serialized editor state so inactive tabs restore cursor/scroll. */
  savedContent: string
  selection: { from: number; to: number } | null
  scroll: number
}

export type AppState = {
  docs: Doc[]
  activeId: string | null
  mode: EditorMode
  sidebarOpen: boolean
  workspace?: string
  paletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

export type Action =
  | { type: 'new-doc'; doc?: Doc }
  | { type: 'open-doc'; path: string; content: string }
  | { type: 'close-doc'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'set-content'; id: string; content: string }
  | { type: 'mark-clean'; id: string; path?: string }
  | { type: 'set-mode'; mode: EditorMode }
  | { type: 'set-sidebar'; open: boolean }
  | { type: 'set-workspace'; workspace?: string }
  | { type: 'palette'; open: boolean }
  | { type: 'settings'; open: boolean }
  | { type: 'shortcuts'; open: boolean }
  | { type: 'save-status'; status: AppState['saveStatus'] }
  | { type: 'rename-doc'; id: string; path: string }

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function initial(): AppState {
  // The welcome doc starts clean: its baseline is its own content, so an
  // edit followed by a full undo returns to "Saved" (it has no path, so
  // nothing but an explicit save can ever re-baseline it).
  const content = welcomeContent()
  const first: Doc = {
    id: genId(),
    name: nextUntitledName(),
    content,
    dirty: false,
    savedContent: content,
    selection: null,
    scroll: 0
  }
  return {
    docs: [first],
    activeId: first.id,
    mode: 'live',
    sidebarOpen: true,
    paletteOpen: false,
    settingsOpen: false,
    shortcutsOpen: false,
    saveStatus: 'idle'
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'new-doc': {
      const doc: Doc =
        action.doc ?? {
          id: genId(),
          name: nextUntitledName(),
          content: '',
          dirty: false,
          savedContent: '',
          selection: null,
          scroll: 0
        }
      return { ...state, docs: [...state.docs, doc], activeId: doc.id }
    }
    case 'open-doc': {
      // If already open, just activate.
      const existing = state.docs.find((d) => d.path === action.path)
      if (existing) return { ...state, activeId: existing.id }
      // Replace an empty, untouched untitled doc if it's the only one.
      let docs = state.docs
      if (
        state.docs.length === 1 &&
        !state.docs[0].path &&
        !state.docs[0].dirty &&
        state.docs[0].content === ''
      ) {
        docs = []
      }
      const name = action.path.split(/[\\/]/).pop() ?? action.path
      const doc: Doc = {
        id: genId(),
        path: action.path,
        name,
        content: action.content,
        savedContent: action.content,
        dirty: false,
        selection: null,
        scroll: 0
      }
      return { ...state, docs: [...docs, doc], activeId: doc.id }
    }
    case 'close-doc': {
      const idx = state.docs.findIndex((d) => d.id === action.id)
      const docs = state.docs.filter((d) => d.id !== action.id)
      let activeId = state.activeId
      if (state.activeId === action.id) {
        if (docs.length === 0) {
          const blank: Doc = {
            id: genId(),
            name: nextUntitledName(),
            content: '',
            dirty: false,
            savedContent: '',
            selection: null,
            scroll: 0
          }
          return { ...state, docs: [blank], activeId: blank.id }
        }
        const next = docs[Math.min(idx, docs.length - 1)]
        activeId = next.id
      }
      return { ...state, docs, activeId }
    }
    case 'activate':
      return { ...state, activeId: action.id }
    case 'set-content':
      return {
        ...state,
        docs: state.docs.map((d) =>
          d.id === action.id
            ? { ...d, content: action.content, dirty: action.content !== d.savedContent }
            : d
        )
      }
    case 'mark-clean':
      return {
        ...state,
        saveStatus: 'saved',
        docs: state.docs.map((d) =>
          d.id === action.id
            ? { ...d, dirty: false, savedContent: d.content, path: action.path ?? d.path }
            : d
        )
      }
    case 'rename-doc':
      return {
        ...state,
        docs: state.docs.map((d) =>
          d.id === action.id
            ? {
                ...d,
                path: action.path,
                name: action.path.split(/[\\/]/).pop() ?? d.name,
                savedContent: d.content,
                dirty: false
              }
            : d
        )
      }
    case 'set-mode':
      return { ...state, mode: action.mode }
    case 'set-sidebar':
      return { ...state, sidebarOpen: action.open }
    case 'set-workspace':
      return { ...state, workspace: action.workspace }
    case 'palette':
      return { ...state, paletteOpen: action.open }
    case 'settings':
      return { ...state, settingsOpen: action.open }
    case 'shortcuts':
      return { ...state, shortcutsOpen: action.open }
    case 'save-status':
      return { ...state, saveStatus: action.status }
    default:
      return state
  }
}

function welcomeContent(): string {
  return `# Welcome to etabook

A modern **WYSIWYG** Markdown editor. This is *Live Preview* mode — your
markup renders in place as you type, just like Obsidian or Typora.

## Try these

- [ ] A task you can click to toggle
- Bullet points and **bold**, *italic*, ~~strike~~ and \`inline code\`
- > A blockquote for side notes

\`\`\`js
// Fenced code with syntax highlighting
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

| Mode | What it shows |
| --- | --- |
| Source | Raw markdown |
| Live | Rendered in place |
| Reading | Fully rendered prose |

Switch modes with \`Ctrl/Cmd+Alt+1/2/3\`. Open the command palette with \`Ctrl/Cmd+K\`.
`
}

const StoreContext = createContext<{
  state: AppState
  dispatch: Dispatch<Action>
} | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial)
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export function useStore(): { state: AppState; dispatch: Dispatch<Action> } {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export function useActiveDoc(): Doc | null {
  const { state } = useStore()
  return state.docs.find((d) => d.id === state.activeId) ?? null
}
