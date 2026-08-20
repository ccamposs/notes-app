import { Node, mergeAttributes } from '@tiptap/core';

export interface CollapsibleOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      setCollapsible: (title?: string) => ReturnType;
    };
  }
}

export const CollapsibleNode = Node.create<CollapsibleOptions>({
  name: 'collapsible',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      title: {
        default: 'Clique para expandir',
      },
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => {
          if (attributes.open) {
            return { open: '' };
          }
          return {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const summary = el.querySelector('summary');
          return {
            title: summary?.textContent || 'Clique para expandir',
            open: el.hasAttribute('open'),
          };
        },
        contentElement: (element) => {
          const el = element as HTMLElement;
          // Return the content area (not the summary)
          let contentDiv = el.querySelector('.collapsible-content');
          if (!contentDiv) {
            // Fallback: create content wrapper from non-summary children
            contentDiv = document.createElement('div');
            const children = Array.from(el.childNodes).filter(
              (n) => (n as HTMLElement).tagName !== 'SUMMARY'
            );
            children.forEach((child) => contentDiv!.appendChild(child.cloneNode(true)));
            el.appendChild(contentDiv);
          }
          return contentDiv as HTMLElement;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'details',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, node.attrs.open ? { open: '' } : {}),
      ['summary', {}, node.attrs.title],
      ['div', { class: 'collapsible-content' }, 0],
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('details');
      dom.classList.add('collapsible-block');
      if (node.attrs.open) {
        dom.setAttribute('open', '');
      }

      const summary = document.createElement('summary');
      summary.classList.add('collapsible-summary');
      summary.textContent = node.attrs.title;

      // Make summary editable on double-click
      summary.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = node.attrs.title;
        input.className = 'collapsible-title-input';

        const save = () => {
          const newTitle = input.value || 'Clique para expandir';
          if (typeof getPos === 'function') {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(getPos(), undefined, {
                ...node.attrs,
                title: newTitle,
              });
              return true;
            }).run();
          }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            save();
          }
        });

        summary.textContent = '';
        summary.appendChild(input);
        input.focus();
        input.select();
      });

      // Toggle open state
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = dom.hasAttribute('open');
        if (isOpen) {
          dom.removeAttribute('open');
        } else {
          dom.setAttribute('open', '');
        }
        if (typeof getPos === 'function') {
          editor.chain().command(({ tr }) => {
            tr.setNodeMarkup(getPos(), undefined, {
              ...node.attrs,
              open: !isOpen,
            });
            return true;
          }).run();
        }
      });

      const contentDOM = document.createElement('div');
      contentDOM.classList.add('collapsible-content');

      dom.appendChild(summary);
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          summary.textContent = updatedNode.attrs.title;
          if (updatedNode.attrs.open) {
            dom.setAttribute('open', '');
          } else {
            dom.removeAttribute('open');
          }
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setCollapsible:
        (title?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { title: title || 'Clique para expandir', open: true },
            content: [
              {
                type: 'paragraph',
              },
            ],
          });
        },
    };
  },
});
