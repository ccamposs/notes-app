import Image from '@tiptap/extension-image';

/**
 * Extensão de imagem avançada:
 * - Spoiler (ocultar/revelar) com bordas definidas
 * - Proteção por senha (criptografia AES-GCM)
 * - Tags de imagem exclusivas
 * - Largura/altura customizáveis (redimensionamento)
 * - Dica de senha
 *
 * Atributos salvos no HTML (persistem no backup):
 * - data-spoiler: 'true'|'false' — imagem oculta
 * - data-protected: 'true'|'false' — protegida por senha
 * - data-password-hash: hash PBKDF2 para verificação
 * - data-encrypted-src: conteúdo criptografado (quando protegida)
 * - data-hint: dica de senha
 * - data-labels: tags separadas por vírgula
 * - width/height: dimensões customizadas
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
});
