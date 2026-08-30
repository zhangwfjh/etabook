import { type ReactElement } from 'react'
import {
  FilePlus,
  FolderOpen,
  Save,
  Eye,
  BookOpen,
  Code,
  Sun,
  Moon,
  PanelLeft,
  Settings as SettingsIcon,
  FileDown,
  FileCode,
  Printer,
  Search,
  Keyboard,
  Table as TableIcon,
  Columns2,
  FileSearch
} from 'lucide-react'
import { getActiveEditorView } from '@renderer/lib/activeView'
import { tableCommands, openTableShapePicker } from '@renderer/editor/extensions/table'

export type CommandAction = {
  id: string
  title: string
  icon?: ReactElement
  keywords?: string
  run: () => void
}

type BuildOpts = {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onModeSource: () => void
  onModeLive: () => void
  onModeReading: () => void
  onToggleTheme: () => void
  onToggleSidebar: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onFind: () => void
  onExportMd: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onToggleSplit: () => void
  onQuickOpen: () => void
}

export function buildCommands(o: BuildOpts): CommandAction[] {
  return [
    { id: 'new', title: 'New File', icon: <FilePlus size={15} />, keywords: 'create', run: o.onNew },
    { id: 'open', title: 'Open File…', icon: <FolderOpen size={15} />, run: o.onOpen },
    { id: 'save', title: 'Save', icon: <Save size={15} />, keywords: 'write', run: o.onSave },
    { id: 'save-as', title: 'Save As…', icon: <Save size={15} />, run: o.onSaveAs },
    { id: 'mode-source', title: 'View: Source', icon: <Code size={15} />, run: o.onModeSource },
    { id: 'mode-live', title: 'View: Live Preview', icon: <Eye size={15} />, run: o.onModeLive },
    { id: 'mode-reading', title: 'View: Reading', icon: <BookOpen size={15} />, run: o.onModeReading },
    { id: 'theme', title: 'Toggle Theme', icon: <Sun size={15} />, keywords: 'dark light', run: o.onToggleTheme },
    { id: 'sidebar', title: 'Toggle Sidebar', icon: <PanelLeft size={15} />, run: o.onToggleSidebar },
    { id: 'find', title: 'Find', icon: <Search size={15} />, keywords: 'search', run: o.onFind },
    { id: 'split', title: 'View: Toggle Split Editor', icon: <Columns2 size={15} />, keywords: 'split pane side editor two columns', run: o.onToggleSplit },
    { id: 'quick-open', title: 'Go to File…', icon: <FileSearch size={15} />, keywords: 'quick open file fuzzy find switch', run: o.onQuickOpen },
    { id: 'settings', title: 'Settings', icon: <SettingsIcon size={15} />, run: o.onOpenSettings },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: <Keyboard size={15} />, keywords: 'help', run: o.onOpenShortcuts },
    { id: 'export-md', title: 'Export Markdown', icon: <FileDown size={15} />, run: o.onExportMd },
    { id: 'export-html', title: 'Export HTML', icon: <FileCode size={15} />, run: o.onExportHtml },
    { id: 'export-pdf', title: 'Export PDF', icon: <Printer size={15} />, run: o.onExportPdf },
    ...tableCommandEntries()
  ]
}

/** Table commands operate on the active editor view; they no-op outside a
 * table (except insert, which opens the shape picker). */
function tableCommandEntries(): CommandAction[] {
  type V = import('@codemirror/view').EditorView
  const t = (id: string, title: string, fn: (v: V) => boolean): CommandAction => ({
    id,
    title,
    icon: <TableIcon size={15} />,
    keywords: 'table cell row column',
    run: () => {
      const v = getActiveEditorView()
      if (v) fn(v)
    }
  })
  return [
    t('table-insert', 'Table: Insert table…', (v) => {
      openTableShapePicker(v)
      return true
    }),
    t('table-row-above', 'Table: Insert row above', tableCommands.insertRowAbove),
    t('table-row-below', 'Table: Insert row below', tableCommands.insertRowBelow),
    t('table-row-delete', 'Table: Delete row', tableCommands.deleteRow),
    t('table-col-left', 'Table: Insert column left', tableCommands.insertColLeft),
    t('table-col-right', 'Table: Insert column right', tableCommands.insertColRight),
    t('table-col-delete', 'Table: Delete column', tableCommands.deleteCol),
    t('table-row-up', 'Table: Move row up', tableCommands.moveRowUp),
    t('table-row-down', 'Table: Move row down', tableCommands.moveRowDown),
    t('table-col-left-move', 'Table: Move column left', tableCommands.moveColLeft),
    t('table-col-right-move', 'Table: Move column right', tableCommands.moveColRight),
    t('table-align-left', 'Table: Align column left', (v) => tableCommands.alignColumn(v, 'left')),
    t('table-align-center', 'Table: Align column center', (v) => tableCommands.alignColumn(v, 'center')),
    t('table-align-right', 'Table: Align column right', (v) => tableCommands.alignColumn(v, 'right')),
    t('table-format', 'Table: Format table', tableCommands.formatTable)
  ]
}

void Moon
