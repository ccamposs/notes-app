import { Sparkles } from 'lucide-react';

interface Props {
  content: string;
}

function generateSummary(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length < 20) return '';

  // Extrai as primeiras frases significativas (até 3)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const meaningful = sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .slice(0, 3);

  if (!meaningful.length) {
    return text.slice(0, 150) + (text.length > 150 ? '...' : '');
  }

  const summary = meaningful.join(' ');
  return summary.length > 200 ? summary.slice(0, 200) + '...' : summary;
}

export default function NoteSummary({ content }: Props) {
  const summary = generateSummary(content);

  if (!summary) return null;

  return (
    <div className="note-summary">
      <div className="note-summary-header">
        <Sparkles size={12} />
        <span>Resumo</span>
      </div>
      <p className="note-summary-text">{summary}</p>
    </div>
  );
}
