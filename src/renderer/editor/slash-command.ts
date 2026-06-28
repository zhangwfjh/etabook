import { Extension } from '@tiptap/core'
import { Suggestion } from '@tiptap/suggestion'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { createRoot, type Root } from 'react-dom/client'
import { SlashCommandMenu, type SlashCommandMenuRef } from './SlashCommandMenu'
import React from 'react'

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range })
        },
        items: () => [],
        render: () => {
          let component: Root | null = null
          let popup: TippyInstance | null = null
          let menuRef: SlashCommandMenuRef | null = null

          return {
            onStart: (props: any) => {
              const el = document.createElement('div')
              component = createRoot(el)
              component.render(
                React.createElement(SlashCommandMenu, {
                  ...props,
                  ref: (ref: SlashCommandMenuRef | null) => { menuRef = ref },
                })
              )
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: el,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })?.[0] ?? null
              if (popup) popup.show()
            },
            onUpdate(props: any) {
              component?.render(
                React.createElement(SlashCommandMenu, {
                  ...props,
                  ref: (ref: SlashCommandMenuRef | null) => { menuRef = ref },
                })
              )
              popup?.setProps({ getReferenceClientRect: props.clientRect })
            },
            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                props.event.preventDefault()
                popup?.hide()
                return true
              }
              return menuRef?.onKeyDown(props) ?? false
            },
            onExit() {
              popup?.destroy()
              component?.unmount()
              component = null
              popup = null
              menuRef = null
            },
          }
        },
      }),
    ]
  },
})
