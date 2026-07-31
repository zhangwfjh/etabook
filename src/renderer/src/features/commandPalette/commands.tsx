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
  Keyboard
} from 'lucide-react'

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
    { id: 'settings', title: 'Settings', icon: <SettingsIcon size={15} />, run: o.onOpenSettings },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: <Keyboard size={15} />, keywords: 'help', run: o.onOpenShortcuts },
    { id: 'export-md', title: 'Export Markdown', icon: <FileDown size={15} />, run: o.onExportMd },
    { id: 'export-html', title: 'Export HTML', icon: <FileCode size={15} />, run: o.onExportHtml },
    { id: 'export-pdf', title: 'Export PDF', icon: <Printer size={15} />, run: o.onExportPdf }
  ]
}

void Moon
