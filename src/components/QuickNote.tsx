import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface Props {
  onSave: (title: string, content: string) => void;
  onClose: () => void;
}

export default function QuickNote({ onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim() && !content.trim()) return;
    onSave(title.trim() || 'Nota rápida', `<p>${content.replace(/\n/g, '</p><p>')}</p>`);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <div className="quick-note-overlay" onClick={onClose}>
      <div className="quick-note-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="quick-note-header">
          <h3>Nota Rápida</h3>
          <button className="quick-note-close" onClick={onClose}><X size={16} /></button>
        </div>
        <input
          ref={inputRef}
          className="quick-note-title"
          placeholder="Título (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="quick-note-content"
          placeholder="Digite sua nota aqui..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
        />
        <div className="quick-note-footer">
          <span className="quick-note-hint">Ctrl+Enter para salvar</span>
          <button className="quick-note-save" onClick={handleSave}>
            <Plus size={14} /> Salvar nota
          </button>
        </div>
      </div>
    </div>
  );
}
