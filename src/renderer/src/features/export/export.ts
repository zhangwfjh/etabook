import { api } from '@renderer/lib/ipc'
import { serializeToHtml, wrapExportDocument } from '@renderer/markdown/serialize'
import { basename } from '@renderer/lib/fs'
import type { Doc } from '@renderer/lib/store'

export async function exportMarkdown(doc: Doc): Promise<void> {
  const defaultName = doc.path ? basename(doc.path) : doc.name
  const savePath = await api().pickSavePath(defaultName.endsWith('.md') ? defaultName : defaultName + '.md')
  if (!savePath) return
  await api().writeFile(savePath, doc.content)
}

export async function exportHtml(doc: Doc, dark: boolean): Promise<string | null> {
  const body = await serializeToHtml(doc.content, dark)
  const html = wrapExportDocument(body, dark)
  const defaultName = (doc.path ? basename(doc.path) : doc.name).replace(/\.[^.]+$/, '') + '.html'
  const savePath = await api().pickSavePath(defaultName)
  if (!savePath) return null
  await api().exportHtml(html, savePath)
  return savePath
}

export async function exportPdf(doc: Doc, dark: boolean): Promise<string | null> {
  const body = await serializeToHtml(doc.content, dark)
  const html = wrapExportDocument(body, dark)
  return api().exportPdf(html)
}
