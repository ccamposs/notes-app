import React, { useState, useRef, useEffect } from 'react';
import { Note, Tag, ViewMode } from '../types';
import { Star, FileText, Download, Filter, CheckSquare2, X, Pin, Copy, Sparkles, SortAsc, GripVertical, MessageSquare } from 'lucide-react';
import { stripHtml } from '../store';

function getSearchSnippet(html: string, query: string): React.ReactNode {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  if (!query.trim()) return text.slice(0, 100) || 'Nota vazia...';
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.slice(0, 100) || 'Nota vazia...';
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 60);
  const before = (start > 0 ? '...' : '') + text.slice(start, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length, end) + (end < text.length ? '...' : '');
  return <>{before}<mark className="search-highlight">{match}</mark>{after}</>;
}

type SortMode = 'updated' | 'created' | 'alpha' | 'manual';
type FilterMode = 'all' | 'with-tags' | 'no-tags' | 'recent-week' | 'with-bookmarks';

interface ContextMenu {
  x: number;
  y: number;
  noteId: string;
}

interface Props {
  notes: Note[];
  selectedNoteId: string | null;
  viewMode: ViewMode;
  tags: Tag[];
  searchQuery?: string;
  searchPreviewEnabled?: boolean;
  onSelectNote: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDuplicateNote: (id: string) => void;
  onExportNotes: (noteIds: string[], format: string) => void;
  onAISummary: (id: string) => void;
  onReorderNotes: (noteIds: string[]) => void;
  onDeleteNotes: (noteIds: string[]) => void;
  commentSearchMatches: Record<string, { threadId: string; text: string }[]>;
  onSelectComment: (noteId: string, threadId: string) => void;
}

const viewTitles: Record<ViewMode, string> = {
  dashboard: 'Dashboard',
  all: 'Todas as notas',
  favorites: 'Favoritas',
  archived: 'Arquivadas',
  trash: 'Lixeira',
  notebook: 'Caderno',
  tag: 'Tag',
  search: 'Resultados da busca',
  tasks: 'Tarefas',
  settings: 'Configurações',
  gallery: 'Galeria',
};

export default function NoteList({
  notes,
  selectedNoteId,
  viewMode,
  tags,
  searchQuery = '',
  searchPreviewEnabled = true,
  onSelectNote,
  onToggleFavorite,
  onDuplicateNote,
  onExportNotes,
  onAISummary,
  onReorderNotes,
  onDeleteNotes,
  commentSearchMatches,
  onSelectComment,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const handleNoteClick = (noteId: string, e: React.MouseEvent, commentThreadId?: string) => {
    if (multiSelectMode) {
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(noteId)) next.delete(noteId);
        else next.add(noteId);
        return next;
      });
    } else if (commentThreadId) {
      onSelectComment(noteId, commentThreadId);
    } else {
      onSelectNote(noteId);
    }
  };

  const toggleMultiSelect = () => {
    if (multiSelectMode) {
      setMultiSelectMode(false);
      setSelectedIds(new Set());
    } else {
      setMultiSelectMode(true);
    }
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredAndSorted.map((n) => n.id)));
  };

  // Filter
  const filteredNotes = notes.filter((note) => {
    switch (filterMode) {
      case 'with-tags': return note.tags.length > 0;
      case 'no-tags': return note.tags.length === 0;
      case 'recent-week':
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(note.updatedAt) >= weekAgo;
      case 'with-bookmarks': return (note.bookmarks || []).length > 0;
      default: return true;
    }
  });

  // Sort
  const filteredAndSorted = [...filteredNotes].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    if (sortMode === 'manual') return 0; // Keep original order from state
    switch (sortMode) {
      case 'created': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'alpha': return (a.title || 'Sem título').localeCompare(b.title || 'Sem título');
      default: return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  const handleExport = (format: string) => {
    const ids = multiSelectMode && selectedIds.size > 0
      ? Array.from(selectedIds)
      : filteredAndSorted.map(n => n.id);
    if (ids.length > 0) {
      onExportNotes(ids, format);
    }
    setShowExportMenu(false);
  };

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, noteId: string, isFavorite: boolean) => {
    if (isFavorite) { e.preventDefault(); return; }
    setDraggedId(noteId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', noteId);
  };

  const handleDragOver = (e: React.DragEvent, noteId: string, isFavorite: boolean) => {
    e.preventDefault();
    if (isFavorite || noteId === draggedId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(noteId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string, isFavorite: boolean) => {
    e.preventDefault();
    if (!draggedId || isFavorite || draggedId === targetId) return;

    // Build new order: separate favorites (pinned) and non-favorites
    const pinned = filteredAndSorted.filter(n => n.isFavorite);
    const unpinned = filteredAndSorted.filter(n => !n.isFavorite);

    const fromIdx = unpinned.findIndex(n => n.id === draggedId);
    const toIdx = unpinned.findIndex(n => n.id === targetId);

    if (fromIdx !== -1 && toIdx !== -1) {
      const item = unpinned.splice(fromIdx, 1)[0];
      unpinned.splice(toIdx, 0, item);
    }

    const newOrder = [...pinned.map(n => n.id), ...unpinned.map(n => n.id)];
    onReorderNotes(newOrder);
    setSortMode('manual');
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="note-list-panel">
      <div className="note-list-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>{viewTitles[viewMode] || 'Notas'}</h2>
            <div className="note-count">{filteredAndSorted.length} nota{filteredAndSorted.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`note-list-action-btn ${multiSelectMode ? 'active' : ''}`}
              onClick={toggleMultiSelect}
              title="Selecionar múltiplas"
            >
              <CheckSquare2 size={15} />
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className={`note-list-action-btn ${filterMode !== 'all' ? 'active' : ''}`}
                onClick={() => { setShowFilterMenu(!showFilterMenu); setShowExportMenu(false); }}
                title="Filtrar e ordenar"
              >
                <Filter size={15} />
              </button>
              {showFilterMenu && (
                <div className="note-list-dropdown">
                  <div className="dropdown-title">Filtrar por</div>
                  {([
                    ['all', 'Todas'],
                    ['with-tags', 'Com tags'],
                    ['no-tags', 'Sem tags'],
                    ['recent-week', 'Última semana'],
                    ['with-bookmarks', 'Com marcadores'],
                  ] as [FilterMode, string][]).map(([key, label]) => (
                    <div key={key} className={`dropdown-item ${filterMode === key ? 'active' : ''}`}
                      onClick={() => { setFilterMode(key); setShowFilterMenu(false); }}>
                      {label}
                    </div>
                  ))}
                  <div className="dropdown-separator" />
                  <div className="dropdown-title">Ordenar por</div>
                  {([
                    ['updated', 'Última atualização'],
                    ['created', 'Data de criação'],
                    ['alpha', 'Alfabético'],
                    ['manual', 'Manual (arrastar)'],
                  ] as [SortMode, string][]).map(([key, label]) => (
                    <div key={key} className={`dropdown-item ${sortMode === key ? 'active' : ''}`}
                      onClick={() => { setSortMode(key); setShowFilterMenu(false); }}>
                      <SortAsc size={12} /> {label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className={`note-list-action-btn ${showExportMenu ? 'active' : ''}`}
                onClick={() => { setShowExportMenu(!showExportMenu); setShowFilterMenu(false); }}
                title="Exportar notas"
              >
                <Download size={15} />
              </button>
              {showExportMenu && (
                <div className="note-list-dropdown">
                  <div className="dropdown-title">
                    Exportar {multiSelectMode && selectedIds.size > 0 ? `${selectedIds.size} selecionadas` : 'todas'}
                  </div>
                  <div className="dropdown-item" onClick={() => handleExport('txt')}>Texto (.txt)</div>
                  <div className="dropdown-item" onClick={() => handleExport('md')}>Markdown (.md)</div>
                  <div className="dropdown-item" onClick={() => handleExport('html')}>HTML (.html)</div>
                  <div className="dropdown-item" onClick={() => handleExport('docx')}>Word (.docx)</div>
                  <div className="dropdown-item" onClick={() => handleExport('pdf')}>PDF (.pdf)</div>
                  <div className="dropdown-item" onClick={() => handleExport('json')}>JSON (.json)</div>
                </div>
              )}
            </div>
          </div>
        </div>
        {multiSelectMode && (
          <div className="multi-select-bar">
            <span>{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
            <button onClick={selectAll}>Selecionar todas</button>
            <button onClick={() => setSelectedIds(new Set())}>Limpar</button>
            <button
              className="multi-select-delete"
              disabled={selectedIds.size === 0}
              onClick={() => {
                if (selectedIds.size === 0) return;
                if (confirm(`Excluir ${selectedIds.size} nota${selectedIds.size > 1 ? 's' : ''}?`)) {
                  onDeleteNotes(Array.from(selectedIds));
                  setSelectedIds(new Set());
                  setMultiSelectMode(false);
                }
              }}
            >
              Excluir
            </button>
            <button onClick={toggleMultiSelect}><X size={12} /></button>
          </div>
        )}
      </div>
      <div className="note-list-content">
        {filteredAndSorted.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <h3>Nenhuma nota</h3>
            <p>Crie uma nova nota para começar</p>
          </div>
        ) : (
          filteredAndSorted.map((note) => {
            const commentMatches = commentSearchMatches[note.id] || [];
            return (
            <div
              key={note.id}
              className={`note-card ${note.id === selectedNoteId ? 'active' : ''} ${multiSelectMode && selectedIds.has(note.id) ? 'selected' : ''} ${dragOverId === note.id ? 'drag-over' : ''} ${draggedId === note.id ? 'dragging' : ''}`}
              onClick={(e) => handleNoteClick(note.id, e, commentMatches[0]?.threadId)}
              onContextMenu={(e) => handleContextMenu(e, note.id)}
              draggable={!note.isFavorite && sortMode === 'manual'}
              onDragStart={(e) => handleDragStart(e, note.id, note.isFavorite)}
              onDragOver={(e) => handleDragOver(e, note.id, note.isFavorite)}
              onDrop={(e) => handleDrop(e, note.id, note.isFavorite)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => setDragOverId(null)}
            >
              {sortMode === 'manual' && !note.isFavorite && (
                <GripVertical size={14} className="drag-handle" />
              )}
              {multiSelectMode && (
                <input type="checkbox" checked={selectedIds.has(note.id)} readOnly className="note-card-checkbox" />
              )}
              <div style={{ flex: 1 }}>
                <div className="note-card-title">
                  {note.isFavorite && <Star className="star-icon" size={14} fill="currentColor" />}
                  {note.title || 'Sem título'}
                </div>
                <div className="note-card-excerpt">
                  {searchQuery && searchPreviewEnabled && viewMode === 'search'
                    ? getSearchSnippet(note.content, searchQuery)
                    : (stripHtml(note.content) || 'Nota vazia...')}
                </div>
                {commentMatches.length > 0 && (
                  <div className="note-card-comment-match" title={commentMatches[0].text}>
                    <MessageSquare size={13} />
                    <span>Comentário: {commentMatches[0].text}</span>
                  </div>
                )}
                <div className="note-card-meta">
                  <span>{formatDate(note.updatedAt)}</span>
                  {note.tags.length > 0 && (
                    <div className="note-card-tags">
                      {note.tags.slice(0, 3).map((tagId) => {
                        const tag = tags.find((t) => t.id === tagId);
                        return tag ? (
                          <span key={tag.id} className="note-tag-badge" style={{ borderLeft: `2px solid ${tag.color}` }}>
                            {tag.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu-item" onClick={() => { onToggleFavorite(contextMenu.noteId); setContextMenu(null); }}>
            <Pin size={14} />
            <span>{notes.find(n => n.id === contextMenu.noteId)?.isFavorite ? 'Desafixar nota' : 'Fixar nota'}</span>
          </div>
          <div className="context-menu-item" onClick={() => { onDuplicateNote(contextMenu.noteId); setContextMenu(null); }}>
            <Copy size={14} />
            <span>Duplicar nota</span>
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item ai" onClick={() => { onAISummary(contextMenu.noteId); setContextMenu(null); }}>
            <Sparkles size={14} />
            <span>Resumo por IA</span>
          </div>
        </div>
      )}
    </div>
  );
}
