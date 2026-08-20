import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { AppState, DashboardData, DashboardWidgetId, DashboardWidgetPosition, DashboardWidgetSize, ViewMode } from '../types';
import { stripHtml } from '../store';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowRight, Bell, Book, Check,
  CheckCircle2, Clock, FilePlus2, FileText, FolderOpen, GripVertical, LayoutDashboard,
  ListTodo, PencilRuler, Plus, Star, StickyNote, Underline as UnderlineIcon, Bold, Italic,
} from 'lucide-react';

const WIDGETS: { id: DashboardWidgetId; label: string; description: string }[] = [
  { id: 'scratchpad', label: 'Bloco de anotações', description: 'Anotações livres com formatação.' },
  { id: 'tasks', label: 'Resumo de tarefas', description: 'Pendentes, atrasadas e concluídas.' },
  { id: 'summary', label: 'Visão geral', description: 'Contagem de notas, cadernos e favoritos.' },
  { id: 'upcoming', label: 'Próximas tarefas', description: 'Tarefas com vencimento mais próximo.' },
  { id: 'notebooks', label: 'Cadernos', description: 'Seus cadernos e quantidade de notas.' },
  { id: 'recent', label: 'Notas recentes', description: 'Últimas notas que você alterou.' },
  { id: 'favorites', label: 'Favoritas', description: 'Notas marcadas como favoritas.' },
  { id: 'inbox', label: 'Notas sem caderno', description: 'Organize as notas ainda sem caderno.' },
  { id: 'quick-actions', label: 'Atalhos rápidos', description: 'Ações comuns do aplicativo.' },
];

interface Props {
  state: AppState;
  dashboard: DashboardData;
  onUpdateDashboard: (updates: Partial<DashboardData>) => void;
  onCreateNote: () => void;
  onSelectNote: (id: string) => void;
  onSetView: (view: ViewMode, notebookId?: string) => void;
  onViewOverdueTasks: () => void;
  onConvertQuickNote: (html: string, notebookId: string | null) => void;
}

export default function Dashboard({ state, dashboard, onUpdateDashboard, onCreateNote, onSelectNote, onSetView, onViewOverdueTasks, onConvertQuickNote }: Props) {
  const [saved, setSaved] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertNotebookId, setConvertNotebookId] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<DashboardWidgetId | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: DashboardWidgetId; columns: number; height: number; width: number; left: number; top: number } | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] }), Placeholder.configure({ placeholder: 'Escreva livremente… suas anotações são salvas automaticamente.' })],
    content: dashboard.scratchpadHtml,
    onUpdate: ({ editor: richEditor }) => {
      onUpdateDashboard({ scratchpadHtml: richEditor.getHTML() });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    },
  });

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    resizeCleanupRef.current?.();
  }, []);
  useEffect(() => { if (editor && dashboard.scratchpadHtml !== editor.getHTML()) editor.commands.setContent(dashboard.scratchpadHtml, false); }, [dashboard.scratchpadHtml, editor]);

  const activeNotes = state.notes.filter((note) => note.status === 'active');
  const favoriteNotes = activeNotes.filter((note) => note.isFavorite);
  const inboxNotes = activeNotes.filter((note) => !note.notebookId);
  const recentNotes = [...activeNotes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);
  const tasks = state.tasks || [];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const isOverdue = (task: typeof tasks[number]) => Boolean(task.dueDate && (task.dueDate < todayStr || (task.dueDate === todayStr && task.dueTime && now.getHours() * 60 + now.getMinutes() > task.dueTime.split(':').map(Number).reduce((h, m) => h * 60 + m))));
  const overdueTasks = pendingTasks.filter(isOverdue);
  const todayTasks = pendingTasks.filter((task) => task.dueDate === todayStr);
  const completedToday = tasks.filter((task) => task.status === 'completed' && task.completedAt?.startsWith(todayStr));
  const upcomingTasks = [...pendingTasks].filter((task) => task.dueDate).sort((a, b) => `${a.dueDate}${a.dueTime || '99:99'}`.localeCompare(`${b.dueDate}${b.dueTime || '99:99'}`)).slice(0, 4);
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  const visibleWidgetIds = dashboard.layout.widgetOrder.filter((id) => dashboard.layout.enabledWidgetIds.includes(id));
  const getWidgetColumns = (id: DashboardWidgetId, sizes = dashboard.layout.widgetSizes) => {
    const savedSize = sizes[id];
    if (typeof savedSize === 'number') return Math.min(12, Math.max(1, savedSize));
    return id === 'scratchpad' || id === 'tasks' ? 12 : 6;
  };
  const getWidgetHeight = (id: DashboardWidgetId, heights = dashboard.layout.widgetHeights) => {
    const savedHeight = heights[id];
    if (typeof savedHeight === 'number') return savedHeight;
    return id === 'scratchpad' ? 380 : id === 'tasks' ? 270 : 250;
  };
  const getWidgetRowSpan = (id: DashboardWidgetId, heights = dashboard.layout.widgetHeights) => Math.max(1, Math.ceil((getWidgetHeight(id, heights) + 18) / 26));
  const overlaps = (first: { column: number; row: number; columns: number; rows: number }, second: { column: number; row: number; columns: number; rows: number }) => first.column < second.column + second.columns && first.column + first.columns > second.column && first.row < second.row + second.rows && first.row + first.rows > second.row;
  const findFirstFreePosition = (columns: number, rows: number, placed: Array<{ column: number; row: number; columns: number; rows: number }>, startRow = 1): DashboardWidgetPosition => {
    for (let row = Math.max(1, startRow); row < 200; row += 1) {
      for (let column = 1; column <= 13 - columns; column += 1) {
        if (!placed.some((widget) => overlaps({ column, row, columns, rows }, widget))) return { column, row };
      }
    }
    return { column: 1, row: 200 };
  };
  const resolveWidgetPositions = (sizes = dashboard.layout.widgetSizes, heights = dashboard.layout.widgetHeights) => {
    const placed: Array<{ id: DashboardWidgetId; column: number; row: number; columns: number; rows: number }> = [];
    visibleWidgetIds.forEach((id) => {
      const columns = getWidgetColumns(id, sizes);
      const rows = getWidgetRowSpan(id, heights);
      const saved = dashboard.layout.widgetPositions[id];
      const savedPosition = saved && saved.column >= 1 && saved.column <= 13 - columns && saved.row >= 1 ? saved : null;
      const position = savedPosition && !placed.some((widget) => overlaps({ ...savedPosition, columns, rows }, widget))
        ? savedPosition
        : findFirstFreePosition(columns, rows, placed);
      placed.push({ id, ...position, columns, rows });
    });
    return Object.fromEntries(placed.map(({ id, column, row }) => [id, { column, row }])) as Partial<Record<DashboardWidgetId, DashboardWidgetPosition>>;
  };
  const arrangeFromPosition = (id: DashboardWidgetId, column: number, row: number, sizes = dashboard.layout.widgetSizes, heights = dashboard.layout.widgetHeights) => {
    const current = resolveWidgetPositions(sizes, heights);
    const movingColumns = getWidgetColumns(id, sizes);
    const movingRows = getWidgetRowSpan(id, heights);
    const moving = { id, column: Math.min(Math.max(1, column), 13 - movingColumns), row: Math.max(1, row), columns: movingColumns, rows: movingRows };
    const placed = [moving];
    const others = visibleWidgetIds.filter((widgetId) => widgetId !== id).map((widgetId) => {
      const position = current[widgetId]!;
      return { id: widgetId, ...position, columns: getWidgetColumns(widgetId, sizes), rows: getWidgetRowSpan(widgetId, heights) };
    }).sort((a, b) => a.row - b.row || a.column - b.column);
    others.forEach((widget) => {
      const next = { ...widget };
      while (placed.some((placedWidget) => overlaps(next, placedWidget))) next.row += 1;
      placed.push(next);
    });
    return { ...dashboard.layout.widgetPositions, ...Object.fromEntries(placed.map(({ id: widgetId, column: nextColumn, row: nextRow }) => [widgetId, { column: nextColumn, row: nextRow }])) };
  };
  const updateLayout = (
    widgetOrder = dashboard.layout.widgetOrder,
    enabledWidgetIds = dashboard.layout.enabledWidgetIds,
    widgetSizes = dashboard.layout.widgetSizes,
    widgetHeights = dashboard.layout.widgetHeights,
    widgetPositions = dashboard.layout.widgetPositions,
  ) => onUpdateDashboard({ layout: { widgetOrder, enabledWidgetIds, widgetSizes, widgetHeights, widgetPositions } });
  const toggleWidget = (id: DashboardWidgetId) => {
    const enabled = dashboard.layout.enabledWidgetIds;
    updateLayout(undefined, enabled.includes(id) ? enabled.filter((widget) => widget !== id) : [...enabled, id]);
  };
  const setWidgetDimensions = (id: DashboardWidgetId, columns: DashboardWidgetSize, height?: number) => {
    const normalizedColumns = Math.min(12, Math.max(1, Math.round(columns)));
    const widgetSizes = { ...dashboard.layout.widgetSizes, [id]: normalizedColumns };
    const widgetHeights = height ? { ...dashboard.layout.widgetHeights, [id]: Math.min(900, Math.max(140, Math.round(height))) } : dashboard.layout.widgetHeights;
    const currentPosition = resolveWidgetPositions()[id] || { column: 1, row: 1 };
    const widgetPositions = arrangeFromPosition(id, currentPosition.column, currentPosition.row, widgetSizes, widgetHeights);
    updateLayout(undefined, undefined, widgetSizes, widgetHeights, widgetPositions);
  };
  const setWidgetSize = (id: DashboardWidgetId, columns: DashboardWidgetSize) => setWidgetDimensions(id, columns, getWidgetHeight(id));
  const startResize = (event: React.PointerEvent<HTMLButtonElement>, id: DashboardWidgetId) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    const handle = event.currentTarget;
    const widget = handle.closest('.dashboard-widget') as HTMLElement | null;
    if (!grid || !widget) return;

    resizeCleanupRef.current?.();
    const gridGap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const columnWidth = (grid.clientWidth - gridGap * 11) / 12;
    if (columnWidth <= 0) return;

    const widgetRect = widget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startColumns = getWidgetColumns(id);
    const startHeight = widget.clientHeight || 180;
    let nextColumns = startColumns;
    let nextHeight = startHeight;
    const previewWidth = (columns: number) => columnWidth * columns + gridGap * (columns - 1);
    const showPreview = () => setResizePreview({
      id,
      columns: nextColumns,
      height: nextHeight,
      width: previewWidth(nextColumns),
      left: widgetRect.left,
      top: widgetRect.top,
    });
    const cleanup = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', commitResize);
      window.removeEventListener('pointercancel', cancelResize);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      resizeCleanupRef.current = null;
    };
    const commitResize = () => {
      cleanup();
      setWidgetDimensions(id, nextColumns, nextHeight);
      setResizePreview(null);
    };
    const cancelResize = () => {
      cleanup();
      setResizePreview(null);
    };
    const resize = (moveEvent: PointerEvent) => {
      nextColumns = Math.min(12, Math.max(1, startColumns + Math.round((moveEvent.clientX - startX) / columnWidth)));
      nextHeight = Math.min(900, Math.max(140, startHeight + (moveEvent.clientY - startY)));
      showPreview();
    };

    handle.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    showPreview();
    resizeCleanupRef.current = cancelResize;
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', commitResize);
    window.addEventListener('pointercancel', cancelResize);
  };
  const beginDrag = (event: React.DragEvent, id: DashboardWidgetId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggedWidget(id);
  };
  const handleGridDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedWidget || !gridRef.current) return;
    const grid = gridRef.current;
    const style = getComputedStyle(grid);
    const columnGap = Number.parseFloat(style.columnGap) || 18;
    const rowGap = Number.parseFloat(style.rowGap) || 18;
    const rowHeight = Number.parseFloat(style.gridAutoRows) || 8;
    const columnWidth = (grid.clientWidth - columnGap * 11) / 12;
    const rect = grid.getBoundingClientRect();
    const columns = getWidgetColumns(draggedWidget);
    const column = Math.min(13 - columns, Math.max(1, Math.floor((event.clientX - rect.left) / (columnWidth + columnGap)) + 1));
    const row = Math.max(1, Math.floor((event.clientY - rect.top) / (rowHeight + rowGap)) + 1);
    const widgetPositions = arrangeFromPosition(draggedWidget, column, row);
    updateLayout(undefined, undefined, undefined, undefined, widgetPositions);
    setDraggedWidget(null);
    setDragOverWidget(null);
  };
  const handleConvert = () => {
    const html = editor?.getHTML() || dashboard.scratchpadHtml;
    if (!stripHtml(html).trim()) return;
    onConvertQuickNote(html, convertNotebookId);
    editor?.commands.clearContent();
    setShowConvert(false);
    setConvertNotebookId(null);
  };

  const scratchpad = (
    <div className="scratchpad">
      <div className="scratchpad-header">
        <h2><StickyNote size={16} /> Bloco de anotações</h2>
        <div className="scratchpad-header-right">
          {saved && <span className="scratchpad-saved"><Check size={11} /> Salvo</span>}
          <div className="scratchpad-toolbar" aria-label="Formatação básica">
            <button className={`toolbar-btn ${editor?.isActive('bold') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito"><Bold size={15} /></button>
            <button className={`toolbar-btn ${editor?.isActive('italic') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico"><Italic size={15} /></button>
            <button className={`toolbar-btn ${editor?.isActive('underline') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Sublinhado"><UnderlineIcon size={15} /></button>
            <button className={`toolbar-btn ${editor?.isActive('bulletList') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista"><ListTodo size={15} /></button>
            <span className="scratchpad-toolbar-separator" />
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Esquerda"><AlignLeft size={15} /></button>
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Centralizar"><AlignCenter size={15} /></button>
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Direita"><AlignRight size={15} /></button>
          </div>
          {showConvert ? (
            <div className="scratchpad-convert-row"><select className="scratchpad-select" value={convertNotebookId || ''} onChange={(event) => setConvertNotebookId(event.target.value || null)}><option value="">Sem caderno</option>{state.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select><button className="scratchpad-btn primary" onClick={handleConvert}>Criar nota</button><button className="scratchpad-btn" onClick={() => setShowConvert(false)}>Cancelar</button></div>
          ) : <button className="scratchpad-btn convert" onClick={() => setShowConvert(true)} disabled={!stripHtml(editor?.getHTML() || dashboard.scratchpadHtml).trim()}><ArrowRight size={12} /> Transformar em nota</button>}
        </div>
      </div>
      <div className="scratchpad-editor-wrap">
        <EditorContent editor={editor} className="scratchpad-editor" />
      </div>
    </div>
  );

  const taskSummary = (
    <div className="dashboard-tasks-hero"><div className="dashboard-tasks-hero-header"><h2><ListTodo size={18} /> Tarefas</h2><button className="dashboard-tasks-link" onClick={() => onSetView('tasks')}>Ver todas →</button></div>
      <div className="dashboard-tasks-cards">
        <div className="dtask-card dtask-pending" onClick={() => onSetView('tasks')}><div className="dtask-card-icon"><Clock size={22} /></div><div className="dtask-card-info"><span className="dtask-card-value">{pendingTasks.length}</span><span className="dtask-card-label">Pendentes</span></div></div>
        <div className="dtask-card dtask-overdue" onClick={onViewOverdueTasks}><div className="dtask-card-icon"><Bell size={22} /></div><div className="dtask-card-info"><span className="dtask-card-value">{overdueTasks.length}</span><span className="dtask-card-label">Atrasadas</span></div></div>
        <div className="dtask-card dtask-today" onClick={() => onSetView('tasks')}><div className="dtask-card-icon"><ListTodo size={22} /></div><div className="dtask-card-info"><span className="dtask-card-value">{todayTasks.length}</span><span className="dtask-card-label">Hoje</span></div></div>
        <div className="dtask-card dtask-done" onClick={() => onSetView('tasks')}><div className="dtask-card-icon"><CheckCircle2 size={22} /></div><div className="dtask-card-info"><span className="dtask-card-value">{completedToday.length}</span><span className="dtask-card-label">Concluídas hoje</span></div></div>
      </div>
      {overdueTasks.length > 0 && <div className="dashboard-overdue-list">{overdueTasks.slice(0, 3).map((task) => <div key={task.id} className="dashboard-overdue-item" onClick={onViewOverdueTasks}><Bell size={12} /><span>{task.title}</span><span className="dashboard-overdue-date">{task.dueDate ? formatDate(task.dueDate) : ''}</span></div>)}</div>}
    </div>
  );

  const summary = <div className="dashboard-section dashboard-summary-widget"><div className="dashboard-section-header"><h2><LayoutDashboard size={16} /> Visão geral</h2></div><div className="dashboard-summary-grid"><div><FileText size={17} /><strong>{activeNotes.length}</strong><span>Notas ativas</span></div><div><Book size={17} /><strong>{state.notebooks.length}</strong><span>Cadernos</span></div><div><Star size={17} /><strong>{favoriteNotes.length}</strong><span>Favoritas</span></div><div><ListTodo size={17} /><strong>{pendingTasks.length}</strong><span>Para fazer</span></div></div></div>;

  const upcoming = <div className="dashboard-section"><div className="dashboard-section-header"><h2><Clock size={16} /> Próximas tarefas</h2><button onClick={() => onSetView('tasks')}>Ver tarefas</button></div><div className="dashboard-compact-list">{upcomingTasks.length ? upcomingTasks.map((task) => <button key={task.id} className="dashboard-compact-item" onClick={() => onSetView('tasks')}><span>{task.title}</span><small>{task.dueDate ? `${formatDate(task.dueDate)}${task.dueTime ? `, ${task.dueTime}` : ''}` : 'Sem data'}</small></button>) : <p className="dashboard-empty-copy">Nenhuma tarefa pendente com data.</p>}</div></div>;

  const notebooks = <div className="dashboard-section"><div className="dashboard-section-header"><h2><Book size={16} /> Cadernos</h2>{state.notebooks.length > 5 && <button onClick={() => onSetView('all')}>Ver todos</button>}</div>{state.notebooks.length ? <div className="dashboard-notes-grid">{state.notebooks.slice(0, 5).map((notebook) => <div key={notebook.id} className="dashboard-note-card" onClick={() => onSetView('notebook', notebook.id)}><h4><FolderOpen size={14} color="var(--accent)" />{notebook.name}</h4><p>{activeNotes.filter((note) => note.notebookId === notebook.id).length} nota(s)</p></div>)}</div> : <div className="dashboard-widget-empty"><Book size={22} /><p>Nenhum caderno criado ainda.</p><button onClick={() => onSetView('all')}>Ver notas</button></div>}</div>;
  const recent = <div className="dashboard-section"><div className="dashboard-section-header"><h2><Clock size={16} /> Recentes</h2><button onClick={() => onSetView('all')}>Ver todas</button></div>{recentNotes.length ? <div className="dashboard-notes-grid">{recentNotes.map((note) => <div key={note.id} className="dashboard-note-card" onClick={() => { onSelectNote(note.id); onSetView('all'); }}><h4>{note.isFavorite && <Star size={12} fill="#ffb84d" color="#ffb84d" />}{note.title || 'Sem título'}</h4><p>{stripHtml(note.content) || 'Nota vazia...'}</p><div className="meta">{formatDate(note.updatedAt)}</div></div>)}</div> : <div className="dashboard-widget-empty"><Clock size={22} /><p>Nenhuma nota recente para exibir.</p><button onClick={onCreateNote}>Criar nota</button></div>}</div>;

  const favorites = <div className="dashboard-section"><div className="dashboard-section-header"><h2><Star size={16} /> Favoritas</h2><button onClick={() => onSetView('favorites')}>Ver todas</button></div>{favoriteNotes.length ? <div className="dashboard-notes-grid">{favoriteNotes.slice(0, 5).map((note) => <div key={note.id} className="dashboard-note-card" onClick={() => { onSelectNote(note.id); onSetView('all'); }}><h4><Star size={12} fill="#ffb84d" color="#ffb84d" />{note.title || 'Sem título'}</h4><p>{stripHtml(note.content) || 'Nota vazia...'}</p><div className="meta">{formatDate(note.updatedAt)}</div></div>)}</div> : <div className="dashboard-widget-empty"><Star size={22} /><p>Nenhuma nota favorita ainda.</p><button onClick={() => onSetView('all')}>Ver notas</button></div>}</div>;
  const inbox = <div className="dashboard-section"><div className="dashboard-section-header"><h2><FileText size={16} /> Notas sem caderno</h2><button onClick={() => onSetView('all')}>Ver todas</button></div><div className="dashboard-inbox-count"><strong>{inboxNotes.length}</strong><span>{inboxNotes.length === 1 ? 'nota aguardando organização' : 'notas aguardando organização'}</span>{inboxNotes.length > 0 && <button onClick={() => { onSelectNote(inboxNotes[0].id); onSetView('all'); }}>Organizar agora <ArrowRight size={13} /></button>}</div></div>;
  const quickActions = <div className="dashboard-section"><div className="dashboard-section-header"><h2><FilePlus2 size={16} /> Atalhos rápidos</h2></div><div className="dashboard-quick-actions"><button onClick={onCreateNote}><Plus size={17} /> Nova nota</button><button onClick={() => onSetView('tasks')}><ListTodo size={17} /> Tarefas</button><button onClick={() => onSetView('all')}><FileText size={17} /> Todas as notas</button></div></div>;
  const widgetContent: Record<DashboardWidgetId, React.ReactNode> = { scratchpad, tasks: taskSummary, summary, upcoming, notebooks, recent, favorites, inbox, 'quick-actions': quickActions };
  const resolvedPositions = resolveWidgetPositions();

  return (
    <div className="dashboard">
      <div className="dashboard-customize-bar"><div><h1>Dashboard</h1><p>Organize seu espaço de trabalho como preferir.</p></div><button className="dashboard-layout-trigger" onClick={() => setLayoutOpen(true)}><PencilRuler size={16} /> Editar layout</button></div>
      <div ref={gridRef} className="dashboard-widget-grid" onDragOver={(event) => event.preventDefault()} onDrop={handleGridDrop}>
        {visibleWidgetIds.map((id) => {
          const position = resolvedPositions[id];
          if (!widgetContent[id] || !position) return null;
          return <section key={id} data-size={getWidgetColumns(id)} style={{ gridColumn: `${position.column} / span ${getWidgetColumns(id)}`, gridRow: `${position.row} / span ${getWidgetRowSpan(id)}`, minHeight: 0 }} className={`dashboard-widget dashboard-widget-${id} ${draggedWidget === id ? 'dragging' : ''} ${dragOverWidget === id && draggedWidget !== id ? 'drag-over' : ''} ${resizePreview?.id === id ? 'is-resizing' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragOverWidget(id); }} onDragLeave={() => setDragOverWidget(null)}><span draggable className="dashboard-drag-handle" title="Arraste para posicionar o widget" onDragStart={(event) => beginDrag(event, id)} onDragEnd={() => { setDraggedWidget(null); setDragOverWidget(null); }}><GripVertical size={16} /></span><button type="button" className="dashboard-resize-handle" title="Segure esta borda e arraste para redimensionar" aria-label="Redimensionar widget" onPointerDown={(event) => startResize(event, id)} onClick={(event) => event.preventDefault()} />{resizePreview?.id === id && <span className="dashboard-resize-preview" style={{ left: resizePreview.left, top: resizePreview.top, width: resizePreview.width, height: resizePreview.height }}><small>{resizePreview.columns} colunas · {Math.round(resizePreview.height)} px</small></span>}{widgetContent[id]}</section>;
        })}
      </div>

      {layoutOpen && <div className="dashboard-layout-overlay" onClick={(event) => { if (event.target === event.currentTarget) setLayoutOpen(false); }}><div className="dashboard-layout-modal" role="dialog" aria-modal="true" aria-label="Editar layout do Dashboard"><div className="dashboard-layout-modal-header"><div><h2>Editar layout</h2><p>Selecione os widgets que deseja exibir no Dashboard.</p></div><button className="dashboard-layout-close" onClick={() => setLayoutOpen(false)}>×</button></div><div className="dashboard-layout-list">{dashboard.layout.widgetOrder.map((id) => { const widget = WIDGETS.find((item) => item.id === id)!; const enabled = dashboard.layout.enabledWidgetIds.includes(id); return <div key={id} className="dashboard-layout-item"><label><input type="checkbox" checked={enabled} onChange={() => toggleWidget(id)} /><span><strong>{widget.label}</strong><small>{widget.description}</small></span></label><select className="dashboard-widget-size-select" value={getWidgetColumns(id)} onChange={(event) => setWidgetSize(id, Number(event.target.value))} aria-label={`Largura de ${widget.label}`}><option value="3">Compacto</option><option value="6">Normal</option><option value="12">Largo</option></select></div>; })}</div><div className="dashboard-layout-footer"><button className="modal-btn modal-btn-primary" onClick={() => setLayoutOpen(false)}>Concluir</button></div></div></div>}
    </div>
  );
}
