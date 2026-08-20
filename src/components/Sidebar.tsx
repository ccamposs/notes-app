import { useState } from 'react';
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
} from 'lucide-react';

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
}: Props) {
  const [showNotebookInput, setShowNotebookInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [notebookName, setNotebookName] = useState('');
  const [tagName, setTagName] = useState('');
  const [editingNotebook, setEditingNotebook] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());

  const activeNotes = state.notes.filter((n) => n.status === 'active');
  const favoriteCount = activeNotes.filter((n) => n.isFavorite).length;
  const archivedCount = state.notes.filter((n) => n.status === 'archived').length;
  const trashCount = state.notes.filter((n) => n.status === 'deleted').length;

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
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Cadernos</div>
          {state.notebooks.map((nb) => {
            const isExpanded = expandedNotebooks.has(nb.id);
            const notebookNotes = activeNotes.filter((n) => n.notebookId === nb.id);
            return (
              <div key={nb.id}>
                <div
                  className={`nav-item ${state.viewMode === 'notebook' && state.activeNotebookId === nb.id ? 'active' : ''}`}
                  onClick={() => onSetView('notebook', nb.id)}
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
                      <div className="nav-item-actions">
                        <button className="nav-item-action-btn" onClick={(e) => { e.stopPropagation(); setEditingNotebook(nb.id); setEditName(nb.name); }} aria-label="Renomear">
                          <Pencil size={12} />
                        </button>
                        <button className="nav-item-action-btn" onClick={(e) => { e.stopPropagation(); onDeleteNotebook(nb.id); }} aria-label="Excluir">
                          <X size={12} />
                        </button>
                      </div>
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
    </aside>
  );
}
