import { useState, useMemo } from 'react';
import { Note, Notebook } from '../types';
import { Images, Search, Tag, ArrowLeft, ExternalLink, Filter } from 'lucide-react';

interface GalleryImage {
  src: string;
  noteId: string;
  noteTitle: string;
  notebookId: string | null;
  notebookName: string;
  labels: string[];
  isSpoiler: boolean;
}

interface Props {
  notes: Note[];
  notebooks: Notebook[];
  onNavigateToNote: (noteId: string, notebookId: string | null) => void;
  onBack: () => void;
  returnLabel?: string;
}

function extractImages(notes: Note[], notebooks: Notebook[]): GalleryImage[] {
  const images: GalleryImage[] = [];
  const imgRegex = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (const note of notes) {
    if (note.status !== 'active') continue;
    imgRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(note.content || '')) !== null) {
      const fullTag = match[0];
      const src = match[1];
      const spoilerMatch = fullTag.match(/data-spoiler=["']([^"']*)["']/);
      const labelsMatch = fullTag.match(/data-labels=["']([^"']*)["']/);
      const notebook = notebooks.find((nb) => nb.id === note.notebookId);

      images.push({
        src,
        noteId: note.id,
        noteTitle: note.title || 'Sem título',
        notebookId: note.notebookId,
        notebookName: notebook?.name || 'Sem caderno',
        labels: labelsMatch?.[1] ? labelsMatch[1].split(',').filter(Boolean) : [],
        isSpoiler: spoilerMatch?.[1] === 'true',
      });
    }
  }

  return images;
}

export default function Gallery({ notes, notebooks, onNavigateToNote, onBack, returnLabel }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNotebook, setFilterNotebook] = useState<string>('all');
  const [filterLabel, setFilterLabel] = useState<string>('all');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; image: GalleryImage } | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  const allImages = useMemo(() => extractImages(notes, notebooks), [notes, notebooks]);

  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    allImages.forEach((img) => img.labels.forEach((l) => labels.add(l)));
    return Array.from(labels).sort();
  }, [allImages]);

  const filteredImages = useMemo(() => {
    return allImages.filter((img) => {
      if (filterNotebook !== 'all' && img.notebookId !== filterNotebook) return false;
      if (filterLabel !== 'all' && !img.labels.includes(filterLabel)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = img.noteTitle.toLowerCase().includes(q);
        const matchesNotebook = img.notebookName.toLowerCase().includes(q);
        const matchesLabel = img.labels.some((l) => l.toLowerCase().includes(q));
        if (!matchesTitle && !matchesNotebook && !matchesLabel) return false;
      }
      return true;
    });
  }, [allImages, filterNotebook, filterLabel, searchQuery]);

  const handleContextMenu = (e: React.MouseEvent, image: GalleryImage) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  };

  const toggleSpoilerReveal = (index: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <main className="gallery-page">
      <header className="gallery-header">
        <div className="gallery-header-left">
          {returnLabel && (
            <button className="gallery-back-btn" onClick={onBack}>
              <ArrowLeft size={16} /> {returnLabel}
            </button>
          )}
          <h1><Images size={22} /> Galeria</h1>
          <span className="gallery-count">{filteredImages.length} {filteredImages.length === 1 ? 'imagem' : 'imagens'}</span>
        </div>
      </header>

      <div className="gallery-filters">
        <div className="gallery-search">
          <Search size={14} />
          <input
            placeholder="Buscar por título, caderno ou marcação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="gallery-filter-group">
          <Filter size={13} />
          <select value={filterNotebook} onChange={(e) => setFilterNotebook(e.target.value)}>
            <option value="all">Todos os cadernos</option>
            {notebooks.map((nb) => (
              <option key={nb.id} value={nb.id}>{nb.name}</option>
            ))}
          </select>
          {allLabels.length > 0 && (
            <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}>
              <option value="all">Todas as marcações</option>
              {allLabels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="gallery-grid">
        {filteredImages.length === 0 ? (
          <div className="gallery-empty">
            <Images size={40} />
            <p>Nenhuma imagem encontrada</p>
          </div>
        ) : (
          filteredImages.map((image, index) => {
            const isRevealed = revealedSpoilers.has(index);
            return (
              <div
                key={`${image.noteId}-${index}`}
                className={`gallery-item ${image.isSpoiler && !isRevealed ? 'is-spoiler' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, image)}
                onClick={() => image.isSpoiler && !isRevealed ? toggleSpoilerReveal(index) : undefined}
              >
                <img src={image.src} alt={image.noteTitle} loading="lazy" />
                {image.isSpoiler && !isRevealed && (
                  <div className="gallery-spoiler-overlay">
                    <span>SPOILER</span>
                  </div>
                )}
                <div className="gallery-item-info">
                  <span className="gallery-item-title">{image.noteTitle}</span>
                  <span className="gallery-item-notebook">{image.notebookName}</span>
                  {image.labels.length > 0 && (
                    <div className="gallery-item-labels">
                      {image.labels.map((label) => (
                        <span key={label} className="gallery-label-badge">{label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (
        <div
          className="image-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <div className="image-context-menu-header">
            <span>{contextMenu.image.noteTitle}</span>
            <small>{contextMenu.image.notebookName}</small>
          </div>
          <button onClick={() => { onNavigateToNote(contextMenu.image.noteId, contextMenu.image.notebookId); setContextMenu(null); }}>
            <ExternalLink size={13} /> Ir para o caderno
          </button>
          <button onClick={() => { navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([contextMenu.image.src], { type: 'text/plain' }) })]); setContextMenu(null); }}>
            Copiar URL da imagem
          </button>
        </div>
      )}
    </main>
  );
}
