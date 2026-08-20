import { Note } from './types';
import { stripHtml } from './store';

/**
 * Convert HTML content to well-formatted plain text
 */
function htmlToFormattedText(html: string): string {
  let text = html;
  // Headers
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n$1\n' + '='.repeat(40) + '\n\n');
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n$1\n' + '-'.repeat(30) + '\n\n');
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n$1\n\n');
  // Lists
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '  • $1\n');
  // Blockquote
  text = text.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n  "$1"\n\n');
  // Line breaks and paragraphs
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  // Details/summary
  text = text.replace(/<summary[^>]*>(.*?)<\/summary>/gi, '\n▸ $1\n');
  text = text.replace(/<details[^>]*>/gi, '');
  text = text.replace(/<\/details>/gi, '\n');
  // Remove remaining tags
  text = text.replace(/<[^>]*>/g, '');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  // Clean up multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export function formatNoteAsText(note: Note): string {
  const title = note.title || 'Sem título';
  const date = new Date(note.updatedAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const body = htmlToFormattedText(note.content);

  return `${title}\n${'='.repeat(title.length)}\n\nÚltima atualização: ${date}\n\n${'-'.repeat(40)}\n\n${body}\n`;
}

export function formatNoteAsMarkdown(note: Note): string {
  let md = `# ${note.title || 'Sem título'}\n\n`;
  let html = note.content;

  // Convert HTML to Markdown
  html = html.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  html = html.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  html = html.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  html = html.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  html = html.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  html = html.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  html = html.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  html = html.replace(/<u>(.*?)<\/u>/gi, '__$1__');
  html = html.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  html = html.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
  html = html.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/p>/gi, '\n\n');
  html = html.replace(/<p[^>]*>/gi, '');
  html = html.replace(/<[^>]*>/g, '');
  html = html.replace(/&nbsp;/g, ' ');
  html = html.replace(/&amp;/g, '&');
  html = html.replace(/&lt;/g, '<');
  html = html.replace(/&gt;/g, '>');
  html = html.replace(/\n{3,}/g, '\n\n');

  md += html.trim();
  return md;
}

export function formatNoteAsHtml(note: Note): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${note.title || 'Sem título'}</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.7; color: #333; }
    h1 { border-bottom: 2px solid #4f8cff; padding-bottom: 8px; }
    blockquote { border-left: 4px solid #4f8cff; margin: 16px 0; padding: 8px 16px; color: #555; font-style: italic; }
    mark { background: #fef08a; padding: 2px 4px; border-radius: 2px; }
    details { background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; margin: 12px 0; padding: 12px; }
    details summary { cursor: pointer; font-weight: 600; }
    ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .meta { color: #888; font-size: 0.85em; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${note.title || 'Sem título'}</h1>
  <div class="meta">Atualizado em ${new Date(note.updatedAt).toLocaleDateString('pt-BR')}</div>
  ${note.content}
</body>
</html>`;
}

export function generateDocx(note: Note): Blob {
  // Generate a minimal DOCX using the OOXML format
  // A DOCX is essentially a ZIP with XML files
  // We'll create a simple HTML-based approach that Word can open
  const htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.6; }
    h1 { font-size: 20pt; color: #2b4c7e; }
    h2 { font-size: 16pt; color: #3d6098; }
    h3 { font-size: 13pt; color: #4f7ab8; }
    blockquote { border-left: 3px solid #4f8cff; padding-left: 12px; color: #555; font-style: italic; }
  </style>
</head>
<body>
  <h1>${note.title || 'Sem título'}</h1>
  <p style="color:#888; font-size:9pt;">Atualizado em ${new Date(note.updatedAt).toLocaleDateString('pt-BR')}</p>
  <hr>
  ${note.content}
</body>
</html>`;

  return new Blob(['\ufeff' + htmlContent], {
    type: 'application/msword',
  });
}

export function generateAndDownloadPdf(note: Note, filename: string): void {
  // Use the browser's print-to-PDF via a hidden iframe
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${note.title || 'Sem título'}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12pt; line-height: 1.7; color: #222; }
    h1 { font-size: 22pt; color: #2b4c7e; margin-bottom: 4px; }
    h2 { font-size: 16pt; color: #3d6098; }
    h3 { font-size: 13pt; color: #4f7ab8; }
    .meta { color: #888; font-size: 9pt; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 12px; }
    blockquote { border-left: 3px solid #4f8cff; margin: 12px 0; padding: 8px 16px; color: #555; font-style: italic; }
    mark { background: #fef08a; padding: 1px 3px; }
    ul, ol { padding-left: 24px; }
  </style>
</head>
<body>
  <h1>${note.title || 'Sem título'}</h1>
  <div class="meta">Atualizado em ${new Date(note.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  ${note.content}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }
}

export async function downloadFile(content: string, filename: string, mimeType: string) {
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || 'txt';
      const types: any[] = [{
        description: `Arquivo ${ext.toUpperCase()}`,
        accept: { [mimeType]: [`.${ext}`] },
      }];
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types,
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e: any) {
      if (e.name === 'AbortError') return;
    }
  }
  const blob = new Blob([content], { type: mimeType });
  downloadBlobDirect(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string, _mimeType: string) {
  downloadBlobDirect(blob, filename);
}

function downloadBlobDirect(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
