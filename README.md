# Etabook

Eat a book with high efficiency η. Etabook is an agentic knowledge kaleidoscope — a local-first Electron app for writing with AI-powered planning, version snapshots, and a rich Markdown editor.

## Tech Stack

- **Electron** + **electron-vite** + **React** + **TypeScript**
- **Tiptap** rich text editor with Markdown support
- **Zustand** for state management
- **TanStack Query** for async data
- **shadcn/ui** + **Tailwind CSS v4** for UI
- **Sonner** for toast notifications
- **AI SDK** for LLM streaming (Anthropic, OpenAI, Ollama)

## Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | Start dev server with hot reload |
| `bun run test` | Run tests |
| `bun run typecheck` | Type-check all TypeScript |
| `bun run package` | Build and package for Windows |

## Architecture

- `src/main/` — Electron main process
- `src/preload/` — Preload bridge (context isolation)
- `src/renderer/` — React renderer (UI, editor, queries, state)
- `src/shared/` — Shared types between processes
- `tests/` — Unit tests
