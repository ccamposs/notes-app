import { Mark, mergeAttributes } from '@tiptap/core';

export interface BookmarkMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmarkMark: {
      setBookmark: (id: string) => ReturnType;
      unsetBookmark: () => ReturnType;
      removeBookmarkById: (id: string) => ReturnType;
    };
  }
}

export const BookmarkMark = Mark.create<BookmarkMarkOptions>({
  name: 'bookmarkMark',
  priority: 1001,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-bookmark-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { 'data-bookmark-id': attributes.id };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-bookmark-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      class: 'bookmark-highlight',
    }), 0];
  },

  addCommands() {
    return {
      setBookmark:
        (id: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { id });
        },
      unsetBookmark:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      removeBookmarkById:
        (id: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;
          const markType = state.schema.marks[this.name];
          if (!markType) return false;

          let found = false;
          doc.descendants((node, pos) => {
            if (!node.isText) return true;
            const marks = node.marks.filter(
              (m) => m.type === markType && m.attrs.id === id
            );
            if (marks.length > 0) {
              found = true;
              if (dispatch) {
                tr.removeMark(pos, pos + node.nodeSize, marks[0]);
              }
            }
            return true;
          });

          if (found && dispatch) {
            dispatch(tr);
          }
          return found;
        },
    };
  },
});
