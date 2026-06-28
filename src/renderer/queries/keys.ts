export const keys = {
  workspace: ['workspace'] as const,
  tree:      (ws: string) => ['tree', ws] as const,
  file:      (p: string) => ['file', p] as const,
  snapshots: (p: string) => ['snapshots', p] as const,
  snapshot:  (id: string) => ['snapshot', id] as const,
  settings:  ['settings'] as const,
  providers: ['providers'] as const,
}
