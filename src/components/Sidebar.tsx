import { useState, useRef, useEffect } from 'react';
import { AppState, ViewMode } from '../types';
import {
  FileText,
  Star,
  Archive,
  Trash2,
  Book,
  Tag,
  Plus,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Pencil,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Settings,
  Clock,
  Globe,
  Images,
} from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'notebook' | 'note';
  id: string;
}

interface Props {
  state: AppState;
  onSetView: (view: ViewMode, notebookId?: string, tagId?: string) => void;
  onSearch: (query: string) => void;
  onCreateNote: () => void;
  onCreateNotebook: (name: string) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (id: string) => void;
  onCreateTag: (name: string) => void;
  onDeleteTag: (id: string) => void;
  onToggleSidebar: () => void;
  onSelectNote: (id: string) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onDeleteNote: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDuplicateNote: (id: string) => void;
  onMoveNote?: (noteId: string, notebookId: string | null) => void;
  dragDropEnabled?: boolean;
}

export default function Sidebar({
  state,
  onSetView,
  onSearch,
  onCreateNote,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onCreateTag,
  onDeleteTag,
  onToggleSidebar,
  onSelectNote,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  onDeleteNote,
  onToggleFavorite,
  onDuplicateNote,
  onMoveNote,
  dragDropEnabled = true,
}: Props) {
  const [showNotebookInput, setShowNotebookInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [notebookName, setNotebookName] = useState('');
  const [tagName, setTagName] = useState('');
  const [editingNotebook, setEditingNotebook] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOverNotebookId, setDragOverNotebookId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const activeNotes = state.notes.filter((n) => n.status === 'active');
  const favoriteCount = activeNotes.filter((n) => n.isFavorite).length;
  const archivedCount = state.notes.filter((n) => n.status === 'archived').length;
  const trashCount = state.notes.filter((n) => n.status === 'deleted').length;
  const recentNotes = [...activeNotes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleNotebookContextMenu = (e: React.MouseEvent, nbId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'notebook', id: nbId });
  };

  const handleNoteContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id: noteId });
  };

  const handleDeleteNotebookConfirm = (nbId: string) => {
    const nb = state.notebooks.find((n) => n.id === nbId);
    const noteCount = activeNotes.filter((n) => n.notebookId === nbId).length;
    const message = noteCount > 0
      ? `Excluir o caderno "${nb?.name}"?\n\n${noteCount} nota${noteCount > 1 ? 's' : ''} vinculada${noteCount > 1 ? 's' : ''} será${noteCount > 1 ? 'ão' : ''} movida${noteCount > 1 ? 's' : ''} para a lixeira.`
      : `Excluir o caderno "${nb?.name}"?`;
    if (confirm(message)) {
      onDeleteNotebook(nbId);
    }
    setContextMenu(null);
  };

  const handleAddNotebook = () => {
    if (notebookName.trim()) {
      onCreateNotebook(notebookName.trim());
      setNotebookName('');
      setShowNotebookInput(false);
    }
  };

  const handleAddTag = () => {
    if (tagName.trim()) {
      onCreateTag(tagName.trim());
      setTagName('');
      setShowTagInput(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRenameNotebook(id, editName.trim());
    }
    setEditingNotebook(null);
  };

  const toggleNotebookExpand = (nbId: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(nbId)) next.delete(nbId);
      else next.add(nbId);
      return next;
    });
  };

  const collapsed = state.sidebarCollapsed;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h1>📝 Notes</h1>}
        <div className="sidebar-header-actions">
          <button className="sidebar-history-btn" onClick={onNavigateBack} disabled={!canNavigateBack} aria-label="Voltar" title="Voltar"><ChevronLeft size={17} /></button>
          <button className="sidebar-history-btn" onClick={onNavigateForward} disabled={!canNavigateForward} aria-label="Avançar" title="Avançar"><ChevronRight size={17} /></button>
          <button className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Alternar barra lateral">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      <div className="search-container">
        <div className="search-wrapper">
          <Search className="search-icon" />
          <input
            className="search-input"
            placeholder={collapsed ? '' : 'Buscar notas...'}
            value={state.searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <button className="new-note-btn" onClick={onCreateNote}>
        <Plus size={16} />
        {!collapsed && <span>Nova Nota</span>}
      </button>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-title">Geral</div>
          <div className={`nav-item ${state.viewMode === 'dashboard' ? 'active' : ''}`} onClick={() => onSetView('dashboard')}>
            <LayoutDashboard className="nav-item-icon" />
            <span>Dashboard</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'all' ? 'active' : ''}`} onClick={() => onSetView('all')}>
            <FileText className="nav-item-icon" />
            <span>Todas as notas</span>
            <span className="nav-item-count">{activeNotes.length}</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'favorites' ? 'active' : ''}`} onClick={() => onSetView('favorites')}>
            <Star className="nav-item-icon" />
            <span>Favoritas</span>
            <span className="nav-item-count">{favoriteCount}</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'archived' ? 'active' : ''}`} onClick={() => onSetView('archived')}>
            <Archive className="nav-item-icon" />
            <span>Arquivadas</span>
            <span className="nav-item-count">{archivedCount}</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'trash' ? 'active' : ''}`} onClick={() => onSetView('trash')}>
            <Trash2 className="nav-item-icon" />
            <span>Lixeira</span>
            <span className="nav-item-count">{trashCount}</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'tasks' ? 'active' : ''}`} onClick={() => onSetView('tasks')}>
            <ListTodo className="nav-item-icon" />
            <span>Tarefas</span>
            <span className="nav-item-count">{state.tasks?.length || 0}</span>
          </div>
          <div className={`nav-item ${state.viewMode === 'gallery' ? 'active' : ''}`} onClick={() => onSetView('gallery' as any)}>
            <Images className="nav-item-icon" />
            <span>Galeria</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title"><Clock size={12} /> Notas Recentes</div>
          {recentNotes.map((note) => (
            <div
              key={note.id}
              className={`nav-item nav-item-compact ${state.selectedNoteId === note.id ? 'active' : ''}`}
              onClick={() => onSelectNote(note.id)}
              onContextMenu={(e) => handleNoteContextMenu(e, note.id)}
            >
              <FileText className="nav-item-icon" size={14} />
              <span>{note.title || 'Sem título'}</span>
            </div>
          ))}
          {recentNotes.length === 0 && (
            <div className="nav-item nav-item-compact" style={{ opacity: 0.5, cursor: 'default' }}>
              <span>Nenhuma nota recente</span>
            </div>
          )}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Cadernos</div>
          {state.notebooks.map((nb) => {
            const isExpanded = expandedNotebooks.has(nb.id);
            const notebookNotes = activeNotes.filter((n) => n.notebookId === nb.id);
            return (
              <div key={nb.id}>
                <div
                  className={`nav-item ${state.viewMode === 'notebook' && state.activeNotebookId === nb.id ? 'active' : ''} ${dragOverNotebookId === nb.id ? 'drag-over' : ''}`}
                  onClick={() => onSetView('notebook', nb.id)}
                  onContextMenu={(e) => handleNotebookContextMenu(e, nb.id)}
                  onDragOver={(e) => { if (dragDropEnabled && onMoveNote) { e.preventDefault(); setDragOverNotebookId(nb.id); } }}
                  onDragLeave={() => setDragOverNotebookId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverNotebookId(null);
                    if (dragDropEnabled && onMoveNote) {
                      const noteId = e.dataTransfer.getData('text/plain');
                      if (noteId) onMoveNote(noteId, nb.id);
                    }
                  }}
                >
                  <span
                    className="nav-item-chevron-btn"
                    onClick={(e) => { e.stopPropagation(); toggleNotebookExpand(nb.id); }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <Book className="nav-item-icon" />
                  {editingNotebook === nb.id ? (
                    <input
                      className="modal-input"
                      style={{ padding: '4px 8px', marginBottom: 0, fontSize: '12px' }}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleRename(nb.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(nb.id)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span>{nb.name}</span>
                      <span className="nav-item-count">{notebookNotes.length}</span>
                    </>
                  )}
                </div>
                {isExpanded && notebookNotes.length > 0 && (
                  <div className="notebook-notes-list">
                    {notebookNotes.map((note) => (
                      <div
                        key={note.id}
                        className={`notebook-note-item ${state.selectedNoteId === note.id ? 'active' : ''}`}
                        onClick={() => { onSetView('notebook', nb.id); onSelectNote(note.id); }}
                        onContextMenu={(e) => handleNoteContextMenu(e, note.id)}
                      >
                        {note.isFavorite && <Star size={10} fill="#ffb84d" color="#ffb84d" />}
                        <span>{note.title || 'Sem título'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isExpanded && notebookNotes.length === 0 && (
                  <div className="notebook-notes-list">
                    <div className="notebook-note-empty">Nenhuma nota</div>
                  </div>
                )}
              </div>
            );
          })}
          {showNotebookInput ? (
            <div style={{ padding: '4px 12px' }}>
              <input
                className="modal-input"
                style={{ marginBottom: '8px', fontSize: '12px', padding: '6px 8px' }}
                placeholder="Nome do caderno"
                value={notebookName}
                onChange={(e) => setNotebookName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNotebook()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="modal-btn modal-btn-primary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={handleAddNotebook}>Criar</button>
                <button className="modal-btn modal-btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => setShowNotebookInput(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="nav-add-btn" onClick={() => setShowNotebookInput(true)}>
              <Plus size={14} /> Novo caderno
            </button>
          )}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Tags</div>
          {state.tags.map((tag) => (
            <div
              key={tag.id}
              className={`nav-item ${state.viewMode === 'tag' && state.activeTagId === tag.id ? 'active' : ''}`}
              onClick={() => onSetView('tag', undefined, tag.id)}
            >
              <Tag className="nav-item-icon" style={{ color: tag.color }} />
              <span>{tag.name}</span>
              <div className="nav-item-actions">
                <button className="nav-item-action-btn" onClick={(e) => { e.stopPropagation(); onDeleteTag(tag.id); }} aria-label="Excluir tag">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
          {showTagInput ? (
            <div style={{ padding: '4px 12px' }}>
              <input
                className="modal-input"
                style={{ marginBottom: '8px', fontSize: '12px', padding: '6px 8px' }}
                placeholder="Nome da tag"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="modal-btn modal-btn-primary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={handleAddTag}>Criar</button>
                <button className="modal-btn modal-btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => setShowTagInput(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="nav-add-btn" onClick={() => setShowTagInput(true)}>
              <Plus size={14} /> Nova tag
            </button>
          )}
        </div>
      </nav>
      <div className="sidebar-settings">
        {window.electronAPI && (
          <button
            type="button"
            className="nav-item"
            onClick={() => window.electronAPI!.openWebVersion()}
            aria-label="Abrir versão web"
            title="Abrir no navegador"
          >
            <Globe className="nav-item-icon" />
            <span>Abrir no navegador</span>
          </button>
        )}
        <button
          type="button"
          className={`nav-item ${state.viewMode === 'settings' ? 'active' : ''}`}
          onClick={() => onSetView('settings')}
          aria-label="Configurações"
          title="Configurações"
        >
          <Settings className="nav-item-icon" />
          <span>Configurações</span>
        </button>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="sidebar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'notebook' && (() => {
            const nb = state.notebooks.find((n) => n.id === contextMenu.id);
            return (
              <>
                <button onClick={() => { onCreateNote(); setContextMenu(null); }}>Adicionar nova nota</button>
                <button onClick={() => { setEditingNotebook(contextMenu.id); setEditName(nb?.name || ''); setContextMenu(null); }}>Renomear caderno</button>
                <div className="sidebar-context-divider" />
                <button className="danger" onClick={() => handleDeleteNotebookConfirm(contextMenu.id)}>Excluir caderno</button>
              </>
            );
          })()}
          {contextMenu.type === 'note' && (() => {
            const note = state.notes.find((n) => n.id === contextMenu.id);
            return (
              <>
                <button onClick={() => { onSelectNote(contextMenu.id); setContextMenu(null); }}>Abrir nota</button>
                <button onClick={() => { onToggleFavorite(contextMenu.id); setContextMenu(null); }}>{note?.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</button>
                <button onClick={() => { onDuplicateNote(contextMenu.id); setContextMenu(null); }}>Duplicar nota</button>
                <div className="sidebar-context-divider" />
                <button className="danger" onClick={() => { if (confirm('Mover esta nota para a lixeira?')) onDeleteNote(contextMenu.id); setContextMenu(null); }}>Mover para lixeira</button>
              </>
            );
          })()}
        </div>
      )}
    </aside>
  );
}
