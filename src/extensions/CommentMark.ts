import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentMarkOptions { HTMLAttributes: Record<string, unknown>; }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setComment: (threadId: string, color?: string) => ReturnType;
      removeComment: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: 'commentMark',
  priority: 1002,
  addOptions() { return { HTMLAttributes: {} }; },
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-thread-id'),
        renderHTML: (attributes) => attributes.threadId ? { 'data-comment-thread-id': attributes.threadId } : {},
      },
      color: {
        default: '#60a5fa',
        parseHTML: (element) => element.getAttribute('data-comment-color') || '#60a5fa',
        renderHTML: (attributes) => ({ 'data-comment-color': attributes.color || '#60a5fa', style: `--comment-color: ${attributes.color || '#60a5fa'}` }),
      },
    };
  },
  parseHTML() { return [{ tag: 'mark[data-comment-thread-id]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'comment-highlight' }), 0];
  },
  addCommands() {
    return {
      setComment: (threadId, color = '#60a5fa') => ({ commands }) => commands.setMark(this.name, { threadId, color }),
      removeComment: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});