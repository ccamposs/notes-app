import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Mark TipTap para texto oculto (spoiler).
 * Renderiza como <span> com classe especial para aplicar blur via CSS.
 * Suporta proteção por senha (hash + conteúdo criptografado).
 */
export const SpoilerText = Mark.create({
  name: 'spoilerText',

  addAttributes() {
    return {
      'data-spoiler': {
        default: 'true',
        parseHTML: (element) => element.getAttribute('data-spoiler') || 'true',
        renderHTML: (attributes) => ({ 'data-spoiler': attributes['data-spoiler'] || 'true' }),
      },
      'data-protected': {
        default: 'false',
        parseHTML: (element) => element.getAttribute('data-protected') || 'false',
        renderHTML: (attributes) => ({ 'data-protected': attributes['data-protected'] || 'false' }),
      },
      'data-password-hash': {
        default: '',
        parseHTML: (element) => element.getAttribute('data-password-hash') || '',
        renderHTML: (attributes) => {
          if (!attributes['data-password-hash']) return {};
          return { 'data-password-hash': attributes['data-password-hash'] };
        },
      },
      'data-hint': {
        default: '',
        parseHTML: (element) => element.getAttribute('data-hint') || '',
        renderHTML: (attributes) => {
          if (!attributes['data-hint']) return {};
          return { 'data-hint': attributes['data-hint'] };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-spoiler-text]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-spoiler-text': '', class: 'spoiler-text' }), 0];
  },
});
