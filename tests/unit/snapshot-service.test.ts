import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSnapshotService } from '../../src/main/snapshot-service'

describe('snapshot-service', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'etabook-snap-')) })

  it('creates, lists, reads, and restores snapshots with retention', () => {
    const svc = createSnapshotService({ runtimeDir: join(root, '.etabook') })
    const filePath = join(root, 'a.md')

    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      writeFileSync(filePath, `v${i}`)
      const s = svc.create({ filePath, content: `v${i}`, trigger: 'manual', isAutosave: false })
      ids.push(s.id)
    }
    const list = svc.list(filePath)
    expect(list.length).toBe(3)
    expect(list[0]!.id).toBe(ids[2])

    const restored = svc.restore(ids[0]!, { createPreRestoreSnapshot: false })
    expect(restored.content).toBe('v0')
    rmSync(root, { recursive: true, force: true })
  })

  it('enforces retention by pruning oldest autosaves', () => {
    const svc = createSnapshotService({ runtimeDir: join(root, '.etabook'), retention: 5 })
    const filePath = join(root, 'a.md')
    for (let i = 0; i < 7; i++) {
      writeFileSync(filePath, `v${i}`)
      svc.create({ filePath, content: `v${i}`, trigger: 'manual', isAutosave: true })
    }
    expect(svc.list(filePath).length).toBe(5)
    rmSync(root, { recursive: true, force: true })
  })

  it('writeSnapshotFile + readSnapshotFile round-trip', () => {
    const svc = createSnapshotService({ runtimeDir: join(root, '.etabook') })
    const filePath = join(root, 'a.md')
    const s = svc.create({ filePath, content: 'hello', trigger: 'manual', isAutosave: false })
    const meta = svc.get(s.id)
    expect(meta?.content).toBe('hello')
    rmSync(root, { recursive: true, force: true })
  })
})
