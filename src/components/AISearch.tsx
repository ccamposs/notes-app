import { useState, useCallback, useEffect } from 'react';
import { Sparkles, Search, Send, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Note } from '../types';

interface Props {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  onClose: () => void;
}

interface AIResult {
  response: string;
  relevantNotes: Note[];
}

export default function AISearch({ notes, onClose, onSelectNote }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.ollamaStatus) {
      setAvailable(false);
      return;
    }
    api.ollamaStatus().then((status: { available: boolean; models: string[] }) => {
      setAvailable(status.available);
      setModels(status.models);
    }).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  const handleAsk = useCallback(async () => {
    if (!query.trim() || loading) return;
    const api = window.electronAPI;
    if (!api?.ollamaAsk) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const activeNotes = notes.filter((n) => n.status === 'active' && !n.isLocked);
      const response = await api.ollamaAsk(
        query,
        activeNotes.map((n) => ({ id: n.id, title: n.title, content: n.content, status: n.status })),
        undefined,
      );

      if (!response.success) {
        setError(response.error || 'Não foi possível obter uma resposta.');
        return;
      }

      const relevantNotes = (response.relevantNoteIds || [])
        .map((id: string) => notes.find((n) => n.id === id))
        .filter((n: Note | undefined): n is Note => Boolean(n));

      setResult({ response: response.response ?? '', relevantNotes });
    } catch (err) {
      setError('Erro ao se comunicar com a IA local.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [query, loading, notes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk();
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  return (
    <div className="ai-search-overlay" onClick={onClose}>
      <div className="ai-search-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ai-search-header">
          <h2><Sparkles size={18} /> Pesquisar com IA</h2>
          <p>Pergunte em linguagem natural e a IA encontra nas suas notas.</p>
        </header>

        {available === false && (
          <div className="ai-search-unavailable">
            <AlertCircle size={20} />
            <div>
              <strong>Ollama não encontrado</strong>
              <p>Para usar a pesquisa com IA, instale o Ollama em <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">ollama.com</a> e execute um modelo (ex.: <code>ollama run llama3.2</code>).</p>
              <p>A IA roda 100% no seu computador, offline e privada.</p>
            </div>
          </div>
        )}

        {available !== false && (
          <>
            <form className="ai-search-form" onSubmit={handleSubmit}>
              <div className="ai-search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Ex.: quais notas falam sobre reunião de sexta?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
                <button type="submit" disabled={loading || !query.trim()} title="Perguntar">
                  {loading ? <Loader2 size={16} className="is-spinning" /> : <Send size={16} />}
                </button>
              </div>
              {models.length > 0 && (
                <small className="ai-search-models">Modelos: {models.slice(0, 5).join(', ')}</small>
              )}
            </form>

            {error && (
              <div className="ai-search-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="ai-search-results">
                <div className="ai-search-response">
                  <Sparkles size={14} />
                  <p>{result.response}</p>
                </div>

                {result.relevantNotes.length > 0 && (
                  <div className="ai-search-notes">
                    <h4>Notas relacionadas</h4>
                    <div className="ai-search-cards">
                      {result.relevantNotes.map((note) => (
                        <button
                          key={note.id}
                          className="ai-search-card"
                          onClick={() => { onSelectNote(note.id); onClose(); }}
                        >
                          <strong>{note.title || 'Sem título'}</strong>
                          <span>{stripHtml(note.content).slice(0, 120) || 'Nota vazia'}</span>
                          <ExternalLink size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
