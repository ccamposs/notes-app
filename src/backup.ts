import { AppState, Note, Notebook, Tag, ViewMode } from './types';
import { formatNoteAsMarkdown, formatNoteAsHtml } from './export';

// ===== JSON Backup (backup/restauração rápida) =====

interface BackupEmbeddedImage {
  noteId: string;
  src: string;
  checksum: string;
}

interface BackupUiState {
  selectedNoteId: string | null;
  viewMode: ViewMode;
  activeNotebookId: string | null;
  activeTagId: string | null;
  searchQuery: string;
  sidebarCollapsed: boolean;
  floatingToolbarItems: string[];
}

export type BackupRestoreData = Partial<AppState> & Pick<Partial<BackupUiState>, 'floatingToolbarItems'>;

const VIEW_MODES: ViewMode[] = ['dashboard', 'all', 'favorites', 'archived', 'trash', 'notebook', 'tag', 'search', 'tasks', 'settings', 'gallery'];
const FLOATING_TOOLBAR_ITEM_IDS = ['bold', 'italic', 'underline', 'strike', 'color', 'textStyle', 'lists', 'quote', 'link', 'bookmark', 'collapsible', 'comment', 'undo', 'redo', 'task'];
const DEFAULT_FLOATING_TOOLBAR_ITEMS = ['bold', 'italic', 'underline', 'strike', 'color', 'textStyle', 'lists', 'link', 'comment'];

// Imagens incorporadas ficam no HTML da nota como data:image/...;base64,... .
// URLs externas não entram neste manifesto: elas continuam sendo somente links.
const EMBEDDED_IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/[a-z0-9.+-]+;base64,[^"']+)\1[^>]*>/gi;

function imageChecksum(value: string): string {
  // Marcador de consistência para detectar perda ou alteração de uma imagem no JSON.
  // Não é usado como mecanismo de segurança criptográfica.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function collectEmbeddedImages(notes: Note[]): BackupEmbeddedImage[] {
  const images: BackupEmbeddedImage[] = [];

  for (const note of notes) {
    EMBEDDED_IMAGE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EMBEDDED_IMAGE_PATTERN.exec(note.content || '')) !== null) {
      const src = match[2];
      images.push({ noteId: note.id, src, checksum: imageChecksum(src) });
    }
  }

  return images;
}

function hasIntactEmbeddedImages(notes: Note[], manifest: unknown): boolean {
  if (!Array.isArray(manifest)) return false;

  const expected = collectEmbeddedImages(notes)
    .map((image) => `${image.noteId}\u0000${image.src}\u0000${image.checksum}`)
    .sort();
  const received: string[] = [];

  for (const item of manifest) {
    if (!item || typeof item !== 'object') return false;
    const image = item as Partial<BackupEmbeddedImage>;
    if (typeof image.noteId !== 'string' || typeof image.src !== 'string' || typeof image.checksum !== 'string') return false;
    if (!image.src.startsWith('data:image/') || image.checksum !== imageChecksum(image.src)) return false;
    received.push(`${image.noteId}\u0000${image.src}\u0000${image.checksum}`);
  }

  received.sort();
  return expected.length === received.length && expected.every((image, index) => image === received[index]);
}

function normalizeFloatingToolbarItems(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_FLOATING_TOOLBAR_ITEMS;
  const validItems = value.filter((item): item is string => typeof item === 'string' && FLOATING_TOOLBAR_ITEM_IDS.includes(item));
  if (!validItems.length) return DEFAULT_FLOATING_TOOLBAR_ITEMS;
  return FLOATING_TOOLBAR_ITEM_IDS.filter((id) => id === 'comment' || validItems.includes(id));
}

function readFloatingToolbarItems(): string[] {
  try {
    return normalizeFloatingToolbarItems(JSON.parse(localStorage.getItem('notes-app-floating-toolbar-items') || '[]'));
  } catch {
    return DEFAULT_FLOATING_TOOLBAR_ITEMS;
  }
}

function buildBackupUi(state: AppState): BackupUiState {
  return {
    selectedNoteId: state.selectedNoteId,
    viewMode: state.viewMode,
    activeNotebookId: state.activeNotebookId,
    activeTagId: state.activeTagId,
    searchQuery: state.searchQuery,
    sidebarCollapsed: state.sidebarCollapsed,
    floatingToolbarItems: readFloatingToolbarItems(),
  };
}

function parseBackupUi(value: unknown, notes: Note[], notebooks: AppState['notebooks'], tags: AppState['tags']): Partial<BackupRestoreData> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object') return null;

  const ui = value as Partial<BackupUiState>;
  const selectedNoteId = typeof ui.selectedNoteId === 'string' && notes.some((note) => note.id === ui.selectedNoteId) ? ui.selectedNoteId : null;
  const activeNotebookId = typeof ui.activeNotebookId === 'string' && notebooks.some((notebook) => notebook.id === ui.activeNotebookId) ? ui.activeNotebookId : null;
  const activeTagId = typeof ui.activeTagId === 'string' && tags.some((tag) => tag.id === ui.activeTagId) ? ui.activeTagId : null;

  return {
    selectedNoteId,
    viewMode: typeof ui.viewMode === 'string' && VIEW_MODES.includes(ui.viewMode as ViewMode) ? ui.viewMode as ViewMode : 'dashboard',
    activeNotebookId,
    activeTagId,
    searchQuery: typeof ui.searchQuery === 'string' ? ui.searchQuery : '',
    sidebarCollapsed: ui.sidebarCollapsed === true,
    floatingToolbarItems: normalizeFloatingToolbarItems(ui.floatingToolbarItems),
  };
}

export function exportStateAsJson(state: AppState): string {
  const data = {
    version: '1.2',
    exportedAt: new Date().toISOString(),
    notes: state.notes,
    notebooks: state.notebooks,
    tags: state.tags,
    tasks: state.tasks,
    settings: state.settings,
    dashboard: state.dashboard,
    ui: buildBackupUi(state),
    embeddedImages: collectEmbeddedImages(state.notes),
  };
  return JSON.stringify(data, null, 2);
}

export function parseBackupJson(json: string): BackupRestoreData | null {
  try {
    const data = JSON.parse(json) as { notes?: unknown; notebooks?: unknown; tags?: unknown; tasks?: unknown; settings?: AppState['settings']; dashboard?: AppState['dashboard']; ui?: unknown; embeddedImages?: unknown };
    if (!data || !Array.isArray(data.notes)) return null;

    // Backups novos contêm um manifesto para confirmar que todas as imagens
    // incorporadas foram preservadas. Backups antigos continuam compatíveis.
    if (data.embeddedImages !== undefined && !hasIntactEmbeddedImages(data.notes as Note[], data.embeddedImages)) return null;

    const notes = data.notes as Note[];
    const notebooks = Array.isArray(data.notebooks) ? data.notebooks as AppState['notebooks'] : [];
    const tags = Array.isArray(data.tags) ? data.tags as AppState['tags'] : [];
    const ui = parseBackupUi(data.ui, notes, notebooks, tags);
    if (!ui) return null;

    return {
      notes,
      notebooks,
      tags,
      tasks: Array.isArray(data.tasks) ? data.tasks as AppState['tasks'] : [],
      settings: data.settings,
      dashboard: data.dashboard,
      ...ui,
    };
  } catch {
    return null;
  }
}

// ===== Markdown Export (Obsidian, Notion, Joplin) =====

function sanitizeFilename(name: string): string {
  return (name || 'Sem titulo')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function noteToMarkdownWithFrontmatter(note: Note, tags: Tag[], notebooks: Notebook[]): string {
  const notebook = notebooks.find((nb) => nb.id === note.notebookId);
  const noteTags = note.tags
    .map((tagId) => tags.find((t) => t.id === tagId)?.name)
    .filter(Boolean);

  let frontmatter = '---\n';
  frontmatter += `title: "${(note.title || 'Sem titulo').replace(/"/g, '\\"')}"\n`;
  frontmatter += `created: ${note.createdAt}\n`;
  frontmatter += `updated: ${note.updatedAt}\n`;
  if (notebook) frontmatter += `notebook: "${notebook.name.replace(/"/g, '\\"')}"\n`;
  if (noteTags.length) frontmatter += `tags:\n${noteTags.map((t) => `  - "${t}"`).join('\n')}\n`;
  if (note.isFavorite) frontmatter += `favorite: true\n`;
  frontmatter += '---\n\n';

  const body = formatNoteAsMarkdown(note).replace(/^# .*\n\n/, '');
  return frontmatter + body;
}

export interface ExportFile {
  path: string;
  content: string;
}

export function exportAsMarkdown(state: AppState): ExportFile[] {
  const files: ExportFile[] = [];
  const { notes, notebooks, tags } = state;
  const activeNotes = notes.filter((n) => n.status === 'active');

  for (const note of activeNotes) {
    const notebook = notebooks.find((nb) => nb.id === note.notebookId);
    const folder = notebook ? sanitizeFilename(notebook.name) : '_inbox';
    const filename = sanitizeFilename(note.title || 'Sem titulo') + '.md';
    const content = noteToMarkdownWithFrontmatter(note, tags, notebooks);
    files.push({ path: `${folder}/${filename}`, content });
  }

  return files;
}

// ===== Evernote ENEX Export =====

interface EnexExportResource {
  base64: string;
  mime: string;
  hash: string;
}

/**
 * Converte HTML para ENML e extrai as imagens como recursos,
 * substituindo cada <img> por <en-media hash="..."/> conforme o padrão do Evernote.
 */
function htmlToEnml(html: string): { content: string; resources: EnexExportResource[] } {
  let enml = html;
  const resources: EnexExportResource[] = [];

  // Extrai imagens em base64 e substitui por en-media
  enml = enml.replace(/<img[^>]*src="data:([^;]+);base64,([^"]+)"[^>]*\/?>/gi, (_, mime, base64) => {
    try {
      const clean = base64.replace(/\s/g, '');
      const hash = md5(base64ToBytes(clean));
      resources.push({ base64: clean, mime, hash });
      return `<en-media type="${mime}" hash="${hash}"/>`;
    } catch {
      return '';
    }
  });
  // Imagens com URL externa não são suportadas pelo ENML
  enml = enml.replace(/<img[^>]*\/?>/gi, '');

  // Normaliza tags
  enml = enml.replace(/<(\/?)b>/gi, '<$1strong>');
  enml = enml.replace(/<(\/?)i>/gi, '<$1em>');
  enml = enml.replace(/<(\/?)u>/gi, '<$1u>');
  enml = enml.replace(/<br\s*\/?>/gi, '<br/>');
  enml = enml.replace(/<hr\s*\/?>/gi, '<hr/>');
  // Remove tags não suportadas pelo ENML
  enml = enml.replace(/<\/?(?:details|summary|mark|input|button|form|script|style|meta|link|iframe|span)[^>]*>/gi, '');
  // Remove atributos class, style e data-*
  enml = enml.replace(/\s+class="[^"]*"/gi, '');
  enml = enml.replace(/\s+style="[^"]*"/gi, '');
  enml = enml.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
  enml = enml.replace(/\s+id="[^"]*"/gi, '');
  // Self-close void elements
  enml = enml.replace(/<(br|hr)([^>]*?)(?<!\/)>/gi, '<$1$2/>');

  return { content: enml, resources };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportAsEnex(state: AppState): string {
  const { notes, tags } = state;
  const activeNotes = notes.filter((n) => n.status === 'active');

  let enex = '<?xml version="1.0" encoding="UTF-8"?>\n';
  enex += '<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n';
  enex += `<en-export export-date="${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z" application="notes-app">\n`;

  for (const note of activeNotes) {
    const noteTags = note.tags
      .map((tagId) => tags.find((t) => t.id === tagId)?.name)
      .filter(Boolean);

    const created = note.createdAt.replace(/[-:]/g, '').split('.')[0] + 'Z';
    const updated = note.updatedAt.replace(/[-:]/g, '').split('.')[0] + 'Z';
    const { content, resources } = htmlToEnml(note.content || '<p></p>');

    enex += '  <note>\n';
    enex += `    <title>${escapeXml(note.title || 'Sem titulo')}</title>\n`;
    enex += `    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${content}</en-note>]]></content>\n`;
    enex += `    <created>${created}</created>\n`;
    enex += `    <updated>${updated}</updated>\n`;
    for (const tag of noteTags) {
      enex += `    <tag>${escapeXml(tag!)}</tag>\n`;
    }
    // Anexa as imagens como recursos
    for (const resource of resources) {
      const extension = resource.mime.split('/')[1] || 'png';
      enex += '    <resource>\n';
      enex += `      <data encoding="base64">\n${resource.base64}\n</data>\n`;
      enex += `      <mime>${resource.mime}</mime>\n`;
      enex += '      <resource-attributes>\n';
      enex += `        <file-name>imagem.${extension}</file-name>\n`;
      enex += '      </resource-attributes>\n';
      enex += '    </resource>\n';
    }
    enex += '  </note>\n';
  }

  enex += '</en-export>\n';
  return enex;
}

// ===== HTML Export =====

export function exportAsHtmlBundle(state: AppState): ExportFile[] {
  const files: ExportFile[] = [];
  const { notes, notebooks } = state;
  const activeNotes = notes.filter((n) => n.status === 'active');

  for (const note of activeNotes) {
    const notebook = notebooks.find((nb) => nb.id === note.notebookId);
    const folder = notebook ? sanitizeFilename(notebook.name) : '_inbox';
    const filename = sanitizeFilename(note.title || 'Sem titulo') + '.html';
    const content = formatNoteAsHtml(note);
    files.push({ path: `${folder}/${filename}`, content });
  }

  return files;
}

// ===== Download helpers =====

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadMultipleFiles(files: ExportFile[]): void {
  // Gera um ZIP simples em memória ou baixa cada arquivo individualmente
  // Para simplicidade sem dependência extra, vamos gerar um único HTML com links
  // ou salvar via API do Electron. Por enquanto, usamos download de ZIP manual.
  // Fallback: baixar como JSON com a estrutura de pastas para uso pelo Electron
  const payload = JSON.stringify(files, null, 2);
  downloadTextFile(payload, 'export-files.json', 'application/json');
}

// ===== IMPORTAÇÃO =====

export interface ImportedNote {
  title: string;
  content: string;
  tags: string[];
  notebook: string | null;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
}

// ===== Importar Markdown =====

function parseMarkdownFrontmatter(text: string): { meta: Record<string, any>; body: string } {
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) return { meta: {}, body: text };

  const rawMeta = frontmatterMatch[1];
  const body = frontmatterMatch[2];
  const meta: Record<string, any> = {};

  for (const line of rawMeta.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value: any = match[2].trim();
    // Parse arrays [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((v: string) => v.trim().replace(/^["']|["']$/g, ''));
    }
    // Parse booleans
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // Strip quotes
    else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { meta, body };
}

function markdownToHtml(md: string): string {
  let html = md;
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold/Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<u>$1</u>');
  // Imagens (antes dos links, pois a sintaxe é parecida)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%" />');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  // Task lists
  html = html.replace(/^- \[x\] (.+)$/gm, '<li data-checked="true">$1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li data-checked="false">$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Line breaks and paragraphs
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  html = '<p>' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
  return html;
}

export function importMarkdownFiles(files: { name: string; content: string; path?: string }[]): ImportedNote[] {
  const now = new Date().toISOString();
  return files.map((file) => {
    const { meta, body } = parseMarkdownFrontmatter(file.content);
    const title = meta.title || file.name.replace(/\.md$/i, '') || 'Sem titulo';
    const content = markdownToHtml(body.trim());
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const notebook = meta.notebook || (file.path ? file.path.split('/')[0] : null);
    return {
      title,
      content,
      tags,
      notebook: notebook && notebook !== '_inbox' ? notebook : null,
      createdAt: meta.created || now,
      updatedAt: meta.updated || now,
      isFavorite: meta.favorite === true,
    };
  });
}

// ===== Importar Evernote (.enex) =====

/**
 * MD5 usado para casar cada imagem com sua referência <en-media hash="...">.
 * O Evernote identifica os recursos pelo MD5 do conteúdo binário.
 */
function md5(bytes: Uint8Array): string {
  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c));
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const originalLength = bytes.length;
  const bitLength = originalLength * 8;
  const paddedLength = (((originalLength + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[originalLength] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunk = 0; chunk < paddedLength; chunk += 64) {
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(chunk + i * 4, true);

    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  const toHex = (n: number) => {
    let hex = '';
    for (let i = 0; i < 4; i++) hex += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return hex;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function importEnexFile(xmlContent: string, fileName?: string): ImportedNote[] {
  const now = new Date().toISOString();
  const notes: ImportedNote[] = [];

  // Use filename (without extension) as notebook name
  const notebookName = fileName
    ? fileName.replace(/\.enex$/i, '').trim()
    : null;

  // Parse each <note> block
  const noteRegex = /<note>([\s\S]*?)<\/note>/gi;
  let match: RegExpExecArray | null;

  while ((match = noteRegex.exec(xmlContent)) !== null) {
    const noteXml = match[1];

    const titleMatch = noteXml.match(/<title>([\s\S]*?)<\/title>/);
    const contentMatch = noteXml.match(/<content>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/);
    const createdMatch = noteXml.match(/<created>(\d{4}\d{2}\d{2}T\d{2}\d{2}\d{2}Z)<\/created>/);
    const updatedMatch = noteXml.match(/<updated>(\d{4}\d{2}\d{2}T\d{2}\d{2}\d{2}Z)<\/updated>/);

    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Sem titulo';

    // Extrai os recursos (imagens e anexos) da nota.
    // O Evernote referencia cada recurso pelo MD5 do binário, então o hash é
    // calculado a partir do base64 decodificado para casar com <en-media hash="...">.
    type EnexResource = { kind: 'image' | 'file'; dataUri?: string; label: string };
    const byHash = new Map<string, EnexResource>();
    const inOrder: EnexResource[] = [];

    const resourceRegex = /<resource>([\s\S]*?)<\/resource>/gi;
    let resMatch: RegExpExecArray | null;
    while ((resMatch = resourceRegex.exec(noteXml)) !== null) {
      const resXml = resMatch[1];
      const dataMatch = resXml.match(/<data[^>]*>([\s\S]*?)<\/data>/);
      const mimeMatch = resXml.match(/<mime>([\s\S]*?)<\/mime>/);
      const fileNameMatch = resXml.match(/<file-name>([\s\S]*?)<\/file-name>/);
      if (!dataMatch) continue;

      const base64 = dataMatch[1].replace(/[\s\r\n]/g, '');
      if (!base64) continue;

      const mime = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream';
      const label = fileNameMatch ? decodeXmlEntities(fileNameMatch[1]).trim() : 'anexo';

      const resource: EnexResource = mime.startsWith('image/')
        ? { kind: 'image', dataUri: `data:${mime};base64,${base64}`, label }
        : { kind: 'file', label };

      inOrder.push(resource);
      try {
        byHash.set(md5(base64ToBytes(base64)), resource);
      } catch {
        // Se o base64 estiver corrompido, o recurso ainda pode ser resolvido pela ordem
      }
    }

    let content = '';
    if (contentMatch) {
      const enNoteMatch = contentMatch[1].match(/<en-note[^>]*>([\s\S]*)<\/en-note>/);
      content = enNoteMatch ? enNoteMatch[1] : contentMatch[1];
      content = content.replace(/<\?xml[^>]*\?>/gi, '');
      content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
      content = content.replace(/<\/?en-note[^>]*>/gi, '');

      const renderResource = (resource: EnexResource | undefined): string => {
        if (!resource) return '';
        if (resource.kind === 'image' && resource.dataUri) {
          return `<p><img src="${resource.dataUri}" alt="${resource.label}" style="max-width:100%" /></p>`;
        }
        return `<p><em>[Anexo: ${resource.label}]</em></p>`;
      };

      // Substitui cada <en-media> pelo recurso correspondente.
      // Prioriza o MD5 e, se não encontrar, usa a ordem de aparição.
      let fallbackIndex = 0;
      const consumed = new Set<EnexResource>();
      content = content.replace(/<en-media\b[^>]*?(?:\/>|>[\s\S]*?<\/en-media>)/gi, (tag) => {
        const hashAttr = tag.match(/hash="([^"]*)"/i);
        let resource = hashAttr ? byHash.get(hashAttr[1].trim().toLowerCase()) : undefined;
        if (!resource) {
          while (fallbackIndex < inOrder.length && consumed.has(inOrder[fallbackIndex])) fallbackIndex++;
          resource = inOrder[fallbackIndex];
        }
        if (resource) consumed.add(resource);
        return renderResource(resource);
      });

      // Wrap loose text in paragraphs if needed
      if (!content.trim().match(/^<(?:p|div|h[1-6]|ul|ol|blockquote|img|table)/i)) {
        content = `<p>${content}</p>`;
      }
    }

    const tags: string[] = [];
    const tagRegex = /<tag>([\s\S]*?)<\/tag>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(noteXml)) !== null) {
      tags.push(decodeXmlEntities(tagMatch[1]));
    }

    const createdAt = createdMatch ? parseEnexDate(createdMatch[1]) : now;
    const updatedAt = updatedMatch ? parseEnexDate(updatedMatch[1]) : now;

    notes.push({
      title,
      content,
      tags,
      notebook: notebookName,
      createdAt,
      updatedAt,
      isFavorite: false,
    });
  }

  return notes;
}

function parseEnexDate(enexDate: string): string {
  // Format: 20260819T103000Z -> 2026-08-19T10:30:00Z
  const y = enexDate.slice(0, 4);
  const m = enexDate.slice(4, 6);
  const d = enexDate.slice(6, 8);
  const h = enexDate.slice(9, 11);
  const min = enexDate.slice(11, 13);
  const s = enexDate.slice(13, 15);
  return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ===== Importar HTML =====

export function importHtmlFiles(files: { name: string; content: string; path?: string }[]): ImportedNote[] {
  const now = new Date().toISOString();
  return files.map((file) => {
    let title = file.name.replace(/\.html?$/i, '') || 'Sem titulo';
    let content = file.content;

    // Try to extract title from <title> or <h1>
    const titleTag = content.match(/<title>([\s\S]*?)<\/title>/i);
    const h1Tag = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleTag && titleTag[1].trim()) title = titleTag[1].trim();
    else if (h1Tag && h1Tag[1].trim()) title = h1Tag[1].trim().replace(/<[^>]*>/g, '');

    // Extract body content
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
    }

    // Remove script, style, meta tags
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<meta[^>]*>/gi, '');
    content = content.replace(/<link[^>]*>/gi, '');
    // Remove the first h1 if it matches the title
    content = content.replace(new RegExp(`<h1[^>]*>\\s*${escapeRegex(title)}\\s*<\\/h1>`, 'i'), '');
    // Remove meta divs (like date info)
    content = content.replace(/<div class="meta"[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.trim();

    const notebook = file.path ? file.path.split('/')[0] : null;

    return {
      title,
      content,
      tags: [],
      notebook: notebook && notebook !== '_inbox' ? notebook : null,
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
    };
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
