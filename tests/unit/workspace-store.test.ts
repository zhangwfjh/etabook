import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspace } from '../../src/renderer/state/store'

describe('workspace store — timeline state', () => {
  beforeEach(() => {
    // Reset to a known baseline between cases.
    useWorkspace.setState({
      timelineOpen: false,
      previewSnapshotId: null,
      activeFilePath: null,
    })
  })

  it('toggles the timeline panel open/closed', () => {
    expect(useWorkspace.getState().timelineOpen).toBe(false)
    useWorkspace.getState().setTimelineOpen(true)
    expect(useWorkspace.getState().timelineOpen).toBe(true)
    useWorkspace.getState().setTimelineOpen(false)
    expect(useWorkspace.getState().timelineOpen).toBe(false)
  })

  it('selects and clears a snapshot preview', () => {
    expect(useWorkspace.getState().previewSnapshotId).toBeNull()
    useWorkspace.getState().setPreviewSnapshotId('snap-1')
    expect(useWorkspace.getState().previewSnapshotId).toBe('snap-1')
    useWorkspace.getState().setPreviewSnapshotId(null)
    expect(useWorkspace.getState().previewSnapshotId).toBeNull()
  })

  it('keeps timeline open and preview independent', () => {
    useWorkspace.getState().setTimelineOpen(true)
    useWorkspace.getState().setPreviewSnapshotId('snap-2')
    // Closing preview does not force-close the panel, and vice versa.
    useWorkspace.getState().setPreviewSnapshotId(null)
    expect(useWorkspace.getState().timelineOpen).toBe(true)
    useWorkspace.getState().setTimelineOpen(false)
    expect(useWorkspace.getState().previewSnapshotId).toBeNull()
  })
})
