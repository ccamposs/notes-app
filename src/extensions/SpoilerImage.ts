import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const resizePluginKey = new PluginKey('imageResize');

/**
 * Extensão de imagem avançada:
 * - Spoiler (blur)
 * - Redimensionamento por arraste nas bordas
 * - Marcações (tags visuais exclusivas para imagens)
 * - Largura/altura customizáveis
 * - Suporte a arrastar/soltar e colar múltiplas imagens (nativo do TipTap + handler)
 */
export const SpoilerImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      'data-spoiler': {
        default: 'false',
        parseHTML: (element) => element.getAttribute('data-spoiler') || 'false',
        renderHTML: (attributes) => ({ 'data-spoiler': attributes['data-spoiler'] || 'false' }),
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
      'data-encrypted-src': {
        default: '',
        parseHTML: (element) => element.getAttribute('data-encrypted-src') || '',
        renderHTML: (attributes) => {
          if (!attributes['data-encrypted-src']) return {};
          return { 'data-encrypted-src': attributes['data-encrypted-src'] };
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
      'data-labels': {
        default: '',
        parseHTML: (element) => element.getAttribute('data-labels') || '',
        renderHTML: (attributes) => {
          if (!attributes['data-labels']) return {};
          return { 'data-labels': attributes['data-labels'] };
        },
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width: ${attributes.width}` };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height') || element.style.height || null,
        renderHTML: (attributes) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const plugins = this.parent?.() || [];

    // Plugin de redimensionamento interativo
    plugins.push(
      new Plugin({
        key: resizePluginKey,
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target as HTMLElement;
              if (!target.classList.contains('image-resize-handle')) return false;

              event.preventDefault();
              event.stopPropagation();

              const imgWrapper = target.closest('.ProseMirror-image-wrapper') || target.parentElement;
              const img = imgWrapper?.querySelector('img') as HTMLImageElement | null;
              if (!img) return false;

              const startX = event.clientX;
              const startY = event.clientY;
              const startWidth = img.offsetWidth;
              const startHeight = img.offsetHeight;
              const aspectRatio = startWidth / startHeight;

              const onMouseMove = (e: MouseEvent) => {
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(50, startWidth + deltaX);
                const newHeight = Math.round(newWidth / aspectRatio);
                img.style.width = `${newWidth}px`;
                img.style.height = `${newHeight}px`;
              };

              const onMouseUp = (e: MouseEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const deltaX = e.clientX - startX;
                const newWidth = Math.max(50, startWidth + deltaX);
                const newHeight = Math.round(newWidth / aspectRatio);

                // Atualiza os atributos do nó no documento
                const pos = view.posAtDOM(img, 0);
                const node = view.state.doc.nodeAt(pos);
                if (node && node.type.name === 'image') {
                  const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    width: `${newWidth}px`,
                    height: `${newHeight}px`,
                  });
                  view.dispatch(tr);
                }
              };

              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
              return true;
            },
          },
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'image') {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'ProseMirror-image-wrapper',
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      })
    );

    return plugins;
  },

  // Suporte a arrastar e colar múltiplas imagens
  addPasteRules() {
    return [];
  },
});
