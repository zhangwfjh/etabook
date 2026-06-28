import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname, isAbsolute, resolve } from 'node:path'
import type { SnapshotContent, SnapshotMeta, SnapshotTrigger } from '../shared/ipc'

export type SnapshotService = {
  create(req: {
    filePath: string
    content: string
    trigger: SnapshotTrigger
    model?: string
    isAutosave: boolean
  }): SnapshotMeta
  list(filePath: string): SnapshotMeta[]
  get(id: string): SnapshotContent | null
  restore(id: string, opts: { createPreRestoreSnapshot: boolean }): SnapshotContent
}

export type SnapshotServiceOptions = {
  runtimeDir: string
  retention?: number
}

function fileHash(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 8)
}

function fileBucket(filePath: string): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(filePath)
  return createHash('sha256').update(abs, 'utf8').digest('hex').slice(0, 16)
}

function bucketDir(runtimeDir: string, bucket: string) {
  return join(runtimeDir, 'snapshots', bucket)
}

function metaPath(runtimeDir: string, bucket: string, id: string) {
  return join(bucketDir(runtimeDir, bucket), `${id}.json`)
}

export function createSnapshotService(opts: SnapshotServiceOptions): SnapshotService {
  const retention = opts.retention ?? 50
  if (!existsSync(opts.runtimeDir)) mkdirSync(opts.runtimeDir, { recursive: true })

  return {
    create({ filePath, content, trigger, model, isAutosave }) {
      const bucket = fileBucket(filePath)
      const dir = bucketDir(opts.runtimeDir, bucket)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      const id = `${Date.now()}-${fileHash(content)}`
      const byteSize = Buffer.byteLength(content, 'utf8')
      const meta: SnapshotMeta = {
        id, filePath, createdAt: Date.now(), trigger, model, byteSize, isAutosave,
      }
      const full: SnapshotContent = { ...meta, content }
      writeFileSync(metaPath(opts.runtimeDir, bucket, id), JSON.stringify(full, null, 2), 'utf8')

      const list = readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SnapshotContent)
        .sort((a, b) => a.createdAt - b.createdAt)
      while (list.length > retention) {
        const old = list.shift()!
        try { unlinkSync(join(dir, `${old.id}.json`)) } catch {}
      }
      return meta
    },

    list(filePath: string) {
      const dir = bucketDir(opts.runtimeDir, fileBucket(filePath))
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SnapshotContent)
        .sort((a, b) => b.createdAt - a.createdAt)
    },

    get(id: string): SnapshotContent | null {
      const snapDir = join(opts.runtimeDir, 'snapshots')
      if (!existsSync(snapDir)) return null
      const buckets = readdirSync(snapDir)
      for (const b of buckets) {
        const p = join(snapDir, b, `${id}.json`)
        if (existsSync(p)) {
          return JSON.parse(readFileSync(p, 'utf8')) as SnapshotContent
        }
      }
      return null
    },

    restore(id, { createPreRestoreSnapshot }) {
      const content = this.get(id)
      if (!content) throw new Error(`Snapshot not found: ${id}`)

      if (createPreRestoreSnapshot && existsSync(content.filePath)) {
        const current = readFileSync(content.filePath, 'utf8')
        this.create({
          filePath: content.filePath,
          content: current,
          trigger: 'pre-restore',
          isAutosave: false,
        })
      }

      if (!existsSync(dirname(content.filePath))) {
        mkdirSync(dirname(content.filePath), { recursive: true })
      }
      writeFileSync(content.filePath, content.content, 'utf8')
      return content
    },
  }
}
