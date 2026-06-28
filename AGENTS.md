# Repository Guidelines

## Project Overview

Etabook — **local-first, AI-native desktop knowledge editor** ("agentic knowledge kaleidoscope"). Electron + React 19 + TipTap 3.x. Workspaces = local directories; docs + history live on disk as Markdown. Features multi-model LLM streaming (`@earendil-works/pi-ai` + Ollama), AI-plan nodes, OFM callouts, math/mermaid/code blocks, snapshot restore timeline.

## Architecture

Four-process Electron app; one IPC contract.

```
src/shared/ipc.ts ── channel names + payload types (imported by all processes via relative paths)
        │
   ┌────┴───────────────────────────────────────┐
   ▼                                              ▼
MAIN (node)                                    RENDERER (web/React)
  registerIpc() owns services                    App + TipTap editor
    ├─ file-service.ts  (fs + sha256 + atomic)     ├─ Zustand stores
    ├─ snapshot-service.ts (checkpoints/restore)   ├─ TanStack Query (window.api.*)
    ├─ config-store.ts (config.json + safeStorage) └─ MarkdownManager singleton
    ├─ llm-gateway.ts (@earendil-works/pi-ai)
    └─ chokidar watchers
        │  ipcMain.handle / webContents.send        ▲  window.api.* (contextBridge)
        └──────────── PRELOAD (CJS) ────────────────┘
```

**IPC has two modes:** request/response (`invoke`↔`handle`) and push events (`broadcast()`→`webContents.send`; `IpcEventChannel` = the 7 `*:on*` channels).

**Error sentinel:** `handle()` never rejects — catches throws, returns `{ __etabook_error: message }`; preload `invoke()` detects it and re-throws. Errors cross IPC as values.

**Key flows:**
- **Files:** `write` takes optional `baseHash` (optimistic concurrency; mismatch throws). Atomic via `.etabook-tmp` + `renameSync`. `readFile` caps 5 MiB.
- **Snapshots:** per-file JSON under `<userData>/.etabook/snapshots/<bucket>/`, LRU-pruned (default 50).
- **LLM stream:** keyed by `abortKey`; main runs fire-and-forget, broadcasts chunk/end/error tagged with `abortKey`. Aborted streams swallow errors.
- **External changes:** chokidar compares hash vs `lastSeenHash`; self-writes update it to dedupe.

## Key Directories

|Path|Purpose|
|---|---|
|`src/main/`|Main process: lifecycle, IPC handlers, all backend services.|
|`src/preload/`|CJS contextBridge — `api.ts` exposes the frozen `window.api`.|
|`src/renderer/`|React 19 SPA: editor, components, state, queries, hooks, styles.|
|`src/shared/`|`ipc.ts` (channels + types) + `shortcuts.ts`.|
|`tests/unit/`|Vitest specs on real source over a tmp filesystem.|

## Development Commands

> **Bun** (`bun@1.1.0`) — not npm/yarn. Bun is dev-time only; shipped app is an Electron 33 binary.

```bash
bun install                  # install deps
bun run dev                  # electron-vite dev
bun run build                # build all 3 targets (main → preload → renderer)
bun run typecheck            # tsc --noEmit on tsconfig.{node,web}.json
bun run test                 # vitest run
bun run test:watch           # vitest watch
bun run package              # build + electron-builder -wml --dir (unpackaged dirs under dist/)
```

## Conventions

- **Named exports**; default only for root `App`. PascalCase components (`EditorPane.tsx`); kebab-case hooks/stores/lib (`use-llm-stream.ts`, `file-service.ts`).
- **`@/*` → `src/renderer/*` is renderer-only** (in `tsconfig.web.json`). Main/preload/shared use relative imports. Never duplicate a shared type — import from `../../shared/ipc`.
- **IPC:** edit `src/shared/ipc.ts` first, then wire `handle()` in main + `invoke()`/`on()` in preload. No runtime validation.
- **State:** Zustand (`useWorkspace`, `useAIPlanStream`), no middleware. TanStack Query — always use the `queries/keys.ts` factory; imperative IPC (streams, listeners) is **not** a query.
- **TipTap:** `buildExtensions()` (`editor/extensions.ts`); markdown round-trip via the `MarkdownManager` singleton — never hand-roll serialization. No `@tiptap-pro/*`.
- **LLM:** `useLlmStream()` (`hooks/use-llm-stream.ts`); **SDK is `@earendil-works/pi-ai`** (not `@ai-sdk/*`).
- **Errors:** let `handle()` catch; optimistic concurrency via `baseHash`; secrets via `safeStorage` → `.aiProvider-<id>.enc` (never `config.json`).

## Important Files

|File|Role|
|---|---|
|`src/shared/ipc.ts`|**IPC contract — edit here first.**|
|`src/main/index.ts`|Lifecycle; contextIsolation on, nodeIntegration off, sandbox off, frameless titlebar.|
|`src/main/register-ipc.ts`|Service factory + non-LLM handlers; owns chokidar watchers.|
|`src/main/ipc-helpers.ts`|`handle()` (error sentinel), `broadcast()`, `pickDirectory()`.|
|`src/main/file-service.ts`|`listTree`, `readFile` (5 MiB cap), optimistic atomic `writeFile`.|
|`src/main/config-store.ts`|`AppConfig` → `config.json` + secrets; injectable for tests.|
|`src/main/llm-gateway.ts`|`@earendil-works/pi-ai` streaming.|
|`src/preload/api.ts`|The `window.api` bridge; re-throws `__etabook_error`.|
|`src/renderer/editor/extensions.ts`|TipTap extension array.|
|`src/renderer/editor/markdown-manager.ts`|Singleton `MarkdownManager` (md ↔ doc).|
|`src/renderer/themes/index.ts`|`ThemeName`, `THEME_LABELS`, `applyTheme`/`loadInitialTheme`.|

## Tooling

- **Build:** `electron-vite`, three targets. Preload **must** be CJS. Main externalizes `electron`, `chokidar`, `@earendil-works/pi-ai`.
- **TypeScript:** strict, `isolatedModules`, `moduleResolution: Bundler`. Two leaf configs (`tsconfig.node.json` = main/preload/shared, no DOM, no `@`; `tsconfig.web.json` = renderer + shared, owns `@/*`). `typecheck` invokes both explicitly so `src/shared` is checked in each context.
- **Tailwind v4:** zero-config — no `tailwind.config.js`/`postcss.config.*`. Config in CSS (`styles/tokens.css` `@theme`). Wired via `@tailwindcss/vite`.
- **shadcn/ui** (new-york) on `radix-ui` + `cva` + `lucide-react`. `cn()` = `twMerge(clsx(...))` in `lib/utils.ts`.
- **Packaging:** `electron-builder -wml --dir` → unpackaged dirs under `dist/`, **not installers**. No signing.

## Styling — "Warm Paper Study"

Scholarly aesthetic: parchment/charcoal, sepia ink, amber accent, serif editor body. Fonts via Google Fonts CDN (Source Serif 4 / Figtree / JetBrains Mono).

**Themes are attribute-switched** (`data-theme` on `<html>`), **not** `dark:` classes. Two: `paper-light` ("Warm Paper", default) / `paper-dark` ("Warm Manuscript"). The IDs are the **stable identifier across the whole stack** — `AppConfig.theme`, `config.json`, `localStorage`, CSS `[data-theme]`, `themes/index.ts`.

`body::before` = low-opacity SVG fractal-noise grain. AI utilities in `globals.css`: `.ai-shimmer`, `.ai-breathing-dot`, `.ai-surface`, `.ai-streaming-glow`.

## Testing & QA

- **Vitest**, `environment: 'node'`, globals **not** enabled (import per spec). No coverage config.
- **Mocks:** `tests/setup.ts` globally `vi.mock('electron')` + `vi.mock('chokidar')`. **Source modules are not mocked** — services run for real.
- **Pattern:** AAA layout. Each spec makes a real OS tmpdir in `beforeEach` (`mkdtempSync`), tears down with `rmSync(recursive)`. Static imports (dynamic `await import` is rare). `@` alias resolves to `src/renderer`.

**Known gaps:** `snapshot-service.get(id)` is O(buckets); `sandbox:false` required for the CJS preload's requires; snapshots are full-content per entry (no diffing/compaction).
