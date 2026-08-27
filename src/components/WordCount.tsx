interface Props {
  content: string;
}

function countWords(html: string): { words: number; characters: number; charactersNoSpaces: number } {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const trimmed = text.trim();
  if (!trimmed) return { words: 0, characters: 0, charactersNoSpaces: 0 };
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const characters = trimmed.length;
  const charactersNoSpaces = trimmed.replace(/\s/g, '').length;
  return { words, characters, charactersNoSpaces };
}

export default function WordCount({ content }: Props) {
  const { words, characters } = countWords(content);

  return (
    <div className="word-count">
      <span>{words} {words === 1 ? 'palavra' : 'palavras'}</span>
      <span className="word-count-separator">·</span>
      <span>{characters} {characters === 1 ? 'caractere' : 'caracteres'}</span>
    </div>
  );
}
