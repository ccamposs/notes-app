import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Extensão TipTap para links entre notas com sintaxe [[título da nota]].
 * Renderiza como <a> com classe especial para estilização.
 */
export const NoteLinkMark = Mark.create({
  name: 'noteLink',

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-id'),
        renderHTML: (attributes) => {
          if (!attributes.noteId) return {};
          return { 'data-note-id': attributes.noteId };
        },
      },
      noteTitle: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-title'),
        renderHTML: (attributes) => {
          if (!attributes.noteTitle) return {};
          return { 'data-note-title': attributes.noteTitle };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-note-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'note-link', href: '#' }), 0];
  },
});
