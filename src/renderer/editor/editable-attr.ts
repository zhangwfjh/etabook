import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Reflects `editor.isEditable` onto the editor's root DOM as
 * `data-editable="true"|"false"` on every view update (including the
 * initial mount and every `setEditable()` dispatch). This lets CSS key
 * mode-conditional rules — notably Comment mark visibility — without React
 * re-rendering the whole editor surface.
 */
export const EditableAttr = Extension.create({
  name: 'editableAttr',

  addProseMirrorPlugins() {
    const key = new PluginKey('editableAttr')
    return [
      new Plugin({
        key,
        view: (editorView) => {
          const sync = () => {
            editorView.dom.setAttribute(
              'data-editable',
              editorView.editable ? 'true' : 'false',
            )
          }
          sync()
          return { update: sync }
        },
      }),
    ]
  },
})
