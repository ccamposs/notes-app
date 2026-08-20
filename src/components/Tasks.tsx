import { useState, useEffect } from 'react';
import { Task, TaskPriority, Note, Notebook, TextAlignment } from '../types';
import { REMINDER_SOUNDS, playSound } from '../notifications';
import {
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Flag,
  Trash2,
  Pencil,
  X,
  FileText,
  Clock,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronRight,
  Bell,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

type TaskTab = 'all' | 'pending' | 'completed' | 'today' | 'overdue';
type MainTab = 'my-tasks' | 'notebooks' | 'notes';

interface ActiveFilters {
  status: 'completed' | null;
  priority: TaskPriority | null;
  dueDateRange: 'today' | 'this-week' | 'this-month' | 'overdue' | null;
  showCompleted: boolean;
}

interface Props {
  tasks: Task[];
  notes: Note[];
  notebooks: Notebook[];
  onCreateTask: (task: Omit<Task, 'id' | 'createdAt' | 'completedAt' | 'status' | 'reminderFired'>) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onSelectNote: (id: string) => void;
  initialTab?: string;
}

export default function Tasks({
  tasks,
  notes,
  notebooks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onToggleTask,
  onSelectNote,
  initialTab,
}: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>((initialTab as TaskTab) || 'all');
  const [mainTab, setMainTab] = useState<MainTab>('my-tasks');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as TaskTab);
  }, [initialTab]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState<ActiveFilters>({
    status: null,
    priority: null,
    dueDateRange: null,
    showCompleted: true,
  });
  const [collapsedNotebooks, setCollapsedNotebooks] = useState<Set<string>>(new Set());

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDescriptionAlignment, setFormDescriptionAlignment] = useState<TextAlignment>('left');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formNoteId, setFormNoteId] = useState<string | null>(null);
  const [formReminderMinutes, setFormReminderMinutes] = useState<number | null>(30);
  const [formReminderSound, setFormReminderSound] = useState('bell');
  const [formReminderEnabled, setFormReminderEnabled] = useState(true);
  const [formRecurrence, setFormRecurrence] = useState<import('../types').RecurrenceType>('none');
  const [formRecurrenceInterval, setFormRecurrenceInterval] = useState(1);
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormDescriptionAlignment('left');
    setFormDueDate('');
    setFormDueTime('');
    setFormPriority('medium');
    setFormNoteId(null);
    setFormReminderMinutes(30);
    setFormReminderSound('bell');
    setFormReminderEnabled(true);
    setFormRecurrence('none');
    setFormRecurrenceInterval(1);
    setFormError('');
  };

  const handleCreate = () => {
    if (!formTitle.trim()) {
      setFormError('Este campo é obrigatório');
      return;
    }
    onCreateTask({
      title: formTitle.trim(),
      description: formDescription.trim(),
      descriptionAlignment: formDescriptionAlignment,
      dueDate: formDueDate || null,
      dueTime: formDueTime || null,
      priority: formPriority,
      noteId: formNoteId,
      reminderMinutes: formReminderEnabled ? (formReminderMinutes ?? 0) : null,
      reminderSound: formReminderSound,
      recurrence: formRecurrence,
      recurrenceInterval: formRecurrenceInterval,
    });
    resetForm();
    setShowCreateForm(false);
  };

  const handleEdit = (task: Task) => {
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDescription(task.description);
    setFormDescriptionAlignment(task.descriptionAlignment || 'left');
    setFormDueDate(task.dueDate || '');
    setFormDueTime(task.dueTime || '');
    setFormPriority(task.priority);
    setFormNoteId(task.noteId);
    setFormReminderEnabled(task.reminderMinutes !== null);
    setFormReminderMinutes(task.reminderMinutes ?? 30);
    setFormReminderSound(task.reminderSound || 'bell');
    setFormRecurrence(task.recurrence || 'none');
    setFormRecurrenceInterval(task.recurrenceInterval || 1);
    setFormError('');
  };

  const handleSaveEdit = () => {
    if (!formTitle.trim()) { setFormError('Este campo é obrigatório'); return; }
    if (!editingId) return;
    onUpdateTask(editingId, {
      title: formTitle.trim(),
      description: formDescription.trim(),
      descriptionAlignment: formDescriptionAlignment,
      dueDate: formDueDate || null,
      dueTime: formDueTime || null,
      priority: formPriority,
      noteId: formNoteId,
      reminderMinutes: formReminderEnabled ? (formReminderMinutes ?? 0) : null,
      reminderSound: formReminderSound,
      reminderFired: false,
      recurrence: formRecurrence,
      recurrenceInterval: formRecurrenceInterval,
    });
    resetForm();
    setEditingId(null);
  };

  const getLocalDate = (date: Date = new Date()): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const setDueToday = () => {
    setFormDueDate(getLocalDate());
  };

  const setDueTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setFormDueDate(getLocalDate(d));
  };

  // Filter tasks
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const applyFilters = (taskList: Task[]): Task[] => {
    let result = taskList;

    if (!filters.showCompleted) {
      result = result.filter(t => t.status !== 'completed');
    }

    if (filters.status === 'completed') {
      result = result.filter(t => t.status === 'completed');
    }

    if (filters.priority) {
      result = result.filter(t => t.priority === filters.priority);
    }

    if (filters.dueDateRange) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayLocal = getLocalDate(today);

      switch (filters.dueDateRange) {
        case 'today':
          result = result.filter(t => t.dueDate === todayLocal);
          break;
        case 'this-week': {
          const endOfWeek = new Date(today);
          endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
          const endStr = getLocalDate(endOfWeek);
          result = result.filter(t => t.dueDate && t.dueDate >= todayLocal && t.dueDate <= endStr);
          break;
        }
        case 'this-month': {
          const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          const endStr = getLocalDate(endOfMonth);
          result = result.filter(t => t.dueDate && t.dueDate >= todayLocal && t.dueDate <= endStr);
          break;
        }
        case 'overdue':
          result = result.filter(t => t.status === 'pending' && t.dueDate !== null && t.dueDate < todayLocal);
          break;
      }
    }

    return result;
  };

  const isOverdue = (task: Task): boolean => {
    if (task.status !== 'pending' || !task.dueDate) return false;
    if (task.dueDate < todayStr) return true;
    if (task.dueDate === todayStr && task.dueTime) {
      const [h, m] = task.dueTime.split(':').map(Number);
      const dueMinutes = h * 60 + m;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      return nowMinutes > dueMinutes;
    }
    return false;
  };

  const filteredTasks = applyFilters(tasks.filter((t) => {
    switch (activeTab) {
      case 'pending': return t.status === 'pending';
      case 'completed': return t.status === 'completed';
      case 'today': return t.status === 'pending' && t.dueDate === todayStr;
      case 'overdue': return isOverdue(t);
      default: return true;
    }
  })).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    const pOrder = { high: 0, medium: 1, low: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const todayCount = tasks.filter(t => t.status === 'pending' && t.dueDate === todayStr).length;
  const overdueCount = tasks.filter(t => isOverdue(t)).length;

  const formatDate = (date: string | null) => {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const priorityColors = { low: '#3dd68c', medium: '#ffb84d', high: '#ff4d6a' };
  const priorityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta' };

  const hasActiveFilters = filters.status !== null || filters.priority !== null || filters.dueDateRange !== null || !filters.showCompleted;

  const toggleNotebookCollapse = (nbId: string) => {
    setCollapsedNotebooks(prev => {
      const next = new Set(prev);
      if (next.has(nbId)) next.delete(nbId);
      else next.add(nbId);
      return next;
    });
  };

  const renderForm = (isEdit: boolean) => (
    <div className="task-form">
      <div className="task-form-header">
        <h3>{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</h3>
      </div>
      <div className="task-form-body">
        <div className="task-form-field">
          <div className="task-form-row">
            <Circle size={18} className="task-form-circle" />
            <input
              className="task-form-title-input"
              placeholder="Digite a tarefa"
              value={formTitle}
              onChange={(e) => { setFormTitle(e.target.value); setFormError(''); }}
            />
          </div>
          {formError && <div className="task-form-error">{formError}</div>}
        </div>

        <div className="task-form-field">
          <div className="task-form-label-row">
            <label><Pencil size={14} /> Descrição</label>
            <div className="text-align-controls" aria-label="Alinhamento da descrição">
              <button className={`text-align-control ${formDescriptionAlignment === 'left' ? 'active' : ''}`} onClick={() => setFormDescriptionAlignment('left')} title="Alinhar à esquerda"><AlignLeft size={14} /></button>
              <button className={`text-align-control ${formDescriptionAlignment === 'center' ? 'active' : ''}`} onClick={() => setFormDescriptionAlignment('center')} title="Centralizar"><AlignCenter size={14} /></button>
              <button className={`text-align-control ${formDescriptionAlignment === 'right' ? 'active' : ''}`} onClick={() => setFormDescriptionAlignment('right')} title="Alinhar à direita"><AlignRight size={14} /></button>
            </div>
          </div>
          <textarea
            className="task-form-textarea"
            placeholder="Sobre o que é esta tarefa?"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={3}
            style={{ textAlign: formDescriptionAlignment }}
          />
        </div>

        <div className="task-form-field">
          <label><Calendar size={14} /> Data de vencimento</label>
          <div className="task-form-chips">
            <button className={`task-chip ${formDueDate === todayStr ? 'active' : ''}`} onClick={setDueToday}>Hoje</button>
            <button className={`task-chip ${formDueDate === getLocalDate(new Date(Date.now() + 86400000)) ? 'active' : ''}`} onClick={setDueTomorrow}>Amanhã</button>
            <input type="date" className="task-form-date-input" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
            <input type="time" className="task-form-date-input" value={formDueTime} onChange={(e) => setFormDueTime(e.target.value)} />
          </div>
        </div>

        <div className="task-form-field">
          <label><Flag size={14} /> Prioridade</label>
          <div className="task-form-chips">
            {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                className={`task-chip ${formPriority === p ? 'active' : ''}`}
                style={formPriority === p ? { borderColor: priorityColors[p], color: priorityColors[p] } : {}}
                onClick={() => setFormPriority(p)}
              >
                {priorityLabels[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="task-form-field">
          <div className="task-notification-row">
            <Bell size={16} className="task-notification-icon" />
            {formReminderEnabled ? (
              <>
                <select className="task-notification-select" value="notificacao">
                  <option value="notificacao">Notificação</option>
                </select>
                <input
                  type="number"
                  className="task-notification-number"
                  min={0}
                  value={formReminderMinutes ?? 30}
                  onChange={(e) => setFormReminderMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <select
                  className="task-notification-select"
                  value={formReminderSound}
                  onChange={(e) => { setFormReminderSound(e.target.value); playSound(e.target.value); }}
                >
                  {REMINDER_SOUNDS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="task-notification-unit">min antes</span>
                <button className="task-notification-remove" onClick={() => setFormReminderEnabled(false)} title="Remover notificação">
                  <X size={14} />
                </button>
              </>
            ) : (
              <button className="task-notification-add" onClick={() => setFormReminderEnabled(true)}>
                Adicionar notificação
              </button>
            )}
          </div>
        </div>

        <div className="task-form-field">
          <label><Clock size={14} /> Recorrência</label>
          <div className="task-form-chips">
            {([
              ['none', 'Nenhuma'],
              ['daily', 'Diário'],
              ['weekly', 'Semanal'],
              ['monthly', 'Mensal'],
              ['custom', 'Personalizado'],
            ] as [import('../types').RecurrenceType, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`task-chip ${formRecurrence === key ? 'active' : ''}`}
                onClick={() => setFormRecurrence(key)}
              >
                {label}
              </button>
            ))}
            {formRecurrence === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>A cada</span>
                <input
                  type="number"
                  className="task-form-date-input"
                  style={{ width: '50px' }}
                  min={1}
                  value={formRecurrenceInterval}
                  onChange={(e) => setFormRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>dias</span>
              </div>
            )}
          </div>
        </div>

        <div className="task-form-field">
          <label><FileText size={14} /> Nota associada</label>
          <select className="task-form-select" value={formNoteId || ''} onChange={(e) => setFormNoteId(e.target.value || null)}>
            <option value="">Nenhuma</option>
            {notes.filter(n => n.status === 'active').map((n) => (
              <option key={n.id} value={n.id}>{n.title || 'Sem título'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="task-form-actions">
        <button className="modal-btn modal-btn-secondary" onClick={() => { resetForm(); setShowCreateForm(false); setEditingId(null); }}>Cancelar</button>
        <button className="modal-btn modal-btn-primary" onClick={isEdit ? handleSaveEdit : handleCreate}>
          {isEdit ? 'Salvar' : 'Criar tarefa'}
        </button>
      </div>
    </div>
  );

  const renderTaskRow = (task: Task) => {
    const linkedNote = task.noteId ? notes.find(n => n.id === task.noteId) : null;
    return (
      <tr key={task.id} className={`task-row ${task.status === 'completed' ? 'completed' : ''} ${isOverdue(task) ? 'overdue' : ''}`}>
        <td>
          <button className="task-toggle-btn" onClick={() => onToggleTask(task.id)}>
            {task.status === 'completed'
              ? <CheckCircle2 size={18} color="var(--success)" />
              : <Circle size={18} color={isOverdue(task) ? 'var(--danger)' : 'var(--text-muted)'} />
            }
          </button>
        </td>
        <td>
          <div className="task-title-cell">
            <span className={task.status === 'completed' ? 'task-done-text' : ''}>
              {task.title}
            </span>
            {task.description && (
              <span className="task-desc-preview">{task.description.slice(0, 50)}</span>
            )}
          </div>
        </td>
        <td>
          {task.dueDate && (
            <span className={`task-date ${isOverdue(task) ? 'overdue' : ''}`}>
              {isOverdue(task) && <AlertTriangle size={11} />}
              {formatDate(task.dueDate)}
              {task.dueTime && `, ${task.dueTime}`}
            </span>
          )}
          {!task.dueDate && <span className="task-date muted">-</span>}
        </td>
        <td>
          {linkedNote ? (
            <span className="task-note-link" onClick={() => onSelectNote(linkedNote.id)}>
              {(linkedNote.title || 'Sem título').slice(0, 20)}...
            </span>
          ) : <span className="task-date muted">-</span>}
        </td>
        <td>
          <span className="task-priority-badge" style={{ color: priorityColors[task.priority] }}>
            <Flag size={11} fill={priorityColors[task.priority]} />
            {priorityLabels[task.priority]}
          </span>
        </td>
        <td>
          <div className="task-actions">
            <button className="task-action-btn" onClick={() => handleEdit(task)} title="Editar">
              <Pencil size={13} />
            </button>
            <button className="task-action-btn danger" onClick={() => onDeleteTask(task.id)} title="Excluir">
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderTaskTable = (taskList: Task[]) => {
    if (taskList.length === 0) {
      return (
        <div className="empty-state" style={{ padding: '40px' }}>
          <CheckCircle2 size={40} style={{ opacity: 0.3 }} />
          <h3>Nenhuma tarefa</h3>
          <p>Crie uma nova tarefa para começar</p>
        </div>
      );
    }
    return (
      <table className="tasks-table">
        <thead>
          <tr>
            <th style={{ width: '40px' }}></th>
            <th>Título</th>
            <th style={{ width: '150px' }}>Data de vencimento</th>
            <th style={{ width: '150px' }}>Nota atribuída</th>
            <th style={{ width: '80px' }}>Prioridade</th>
            <th style={{ width: '60px' }}></th>
          </tr>
        </thead>
        <tbody>
          {taskList.map(renderTaskRow)}
        </tbody>
      </table>
    );
  };

  const renderMyTasksContent = () => (
    <>
      <div className="tasks-tabs">
        {([
          ['all', `Todas (${tasks.length})`],
          ['pending', `Pendentes (${pendingCount})`],
          ['completed', `Concluídas (${completedCount})`],
          ['today', `Hoje (${todayCount})`],
          ['overdue', `Atrasadas (${overdueCount})`],
        ] as [TaskTab, string][]).map(([key, label]) => (
          <button key={key} className={`tasks-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {(showCreateForm || editingId) && (
        <div className="task-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { resetForm(); setShowCreateForm(false); setEditingId(null); } }}>
          <div className="task-modal">
            {renderForm(!!editingId)}
          </div>
        </div>
      )}

      <div className="tasks-list">
        {renderTaskTable(filteredTasks)}
      </div>
    </>
  );

  const renderNotesContent = () => {
    const allFiltered = applyFilters(tasks);
    // Group tasks by noteId
    const tasksByNote = new Map<string | null, Task[]>();
    allFiltered.forEach(t => {
      const key = t.noteId;
      if (!tasksByNote.has(key)) tasksByNote.set(key, []);
      tasksByNote.get(key)!.push(t);
    });

    const noteGroups = Array.from(tasksByNote.entries()).map(([noteId, noteTasks]) => {
      const noteObj = noteId ? notes.find(n => n.id === noteId) : null;
      const title = noteObj ? (noteObj.title || 'Sem título') : 'Sem nota associada';
      return { noteId, title, tasks: noteTasks };
    });

    return (
      <div className="tasks-list">
        {noteGroups.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <FileText size={40} style={{ opacity: 0.3 }} />
            <h3>Nenhuma tarefa</h3>
            <p>Nenhuma tarefa com notas associadas</p>
          </div>
        ) : (
          noteGroups.map(group => (
            <div key={group.noteId || 'none'} className="task-group-section">
              <div className="task-group-header">
                <FileText size={14} />
                <span>{group.title}</span>
                <span className="task-group-count">{group.tasks.length}</span>
              </div>
              {renderTaskTable(group.tasks)}
            </div>
          ))
        )}
      </div>
    );
  };

  const renderNotebooksContent = () => {
    const allFiltered = applyFilters(tasks);
    // Group tasks by notebook (via their noteId -> note.notebookId)
    const tasksByNotebook = new Map<string | null, Task[]>();
    allFiltered.forEach(t => {
      const noteObj = t.noteId ? notes.find(n => n.id === t.noteId) : null;
      const nbId = noteObj?.notebookId || null;
      if (!tasksByNotebook.has(nbId)) tasksByNotebook.set(nbId, []);
      tasksByNotebook.get(nbId)!.push(t);
    });

    const nbGroups = Array.from(tasksByNotebook.entries()).map(([nbId, nbTasks]) => {
      const nb = nbId ? notebooks.find(n => n.id === nbId) : null;
      const name = nb ? nb.name : 'Sem caderno';
      return { nbId, name, tasks: nbTasks };
    });

    return (
      <div className="tasks-list">
        {nbGroups.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <FileText size={40} style={{ opacity: 0.3 }} />
            <h3>Nenhuma tarefa</h3>
            <p>Nenhuma tarefa associada a cadernos</p>
          </div>
        ) : (
          nbGroups.map(group => {
            const isCollapsed = collapsedNotebooks.has(group.nbId || '__none__');
            return (
              <div key={group.nbId || 'none'} className="task-group-section">
                <div
                  className="task-group-header clickable"
                  onClick={() => toggleNotebookCollapse(group.nbId || '__none__')}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{group.name}</span>
                  <span className="task-group-count">{group.tasks.length}</span>
                </div>
                {!isCollapsed && renderTaskTable(group.tasks)}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderFilterDropdown = () => (
    <div className="filter-dropdown">
      <div className="filter-dropdown-title">Filtrar por</div>

      <div className="filter-dropdown-section">
        <div className="filter-dropdown-label">Prioridade</div>
        {(['low', 'medium', 'high'] as TaskPriority[]).map(p => (
          <button
            key={p}
            className={`filter-dropdown-item ${filters.priority === p ? 'active' : ''}`}
            onClick={() => setFilters(f => ({ ...f, priority: f.priority === p ? null : p }))}
          >
            <Flag size={12} color={priorityColors[p]} fill={filters.priority === p ? priorityColors[p] : 'none'} />
            {priorityLabels[p]}
          </button>
        ))}
      </div>

      <div className="filter-dropdown-section">
        <div className="filter-dropdown-label">Data de vencimento</div>
        {([
          ['today', 'Hoje'],
          ['this-week', 'Esta semana'],
          ['this-month', 'Este mês'],
          ['overdue', 'Atrasadas'],
        ] as [ActiveFilters['dueDateRange'], string][]).map(([key, label]) => (
          <button
            key={key}
            className={`filter-dropdown-item ${filters.dueDateRange === key ? 'active' : ''}`}
            onClick={() => setFilters(f => ({ ...f, dueDateRange: f.dueDateRange === key ? null : key }))}
          >
            <Calendar size={12} />
            {label}
          </button>
        ))}
      </div>

      <div className="filter-dropdown-section">
        <div className="filter-dropdown-label">Incluir</div>
        <label className="filter-toggle-item">
          <input
            type="checkbox"
            checked={filters.showCompleted}
            onChange={(e) => setFilters(f => ({ ...f, showCompleted: e.target.checked }))}
          />
          Mostrar concluídas
        </label>
      </div>

      {hasActiveFilters && (
        <button
          className="filter-clear-btn"
          onClick={() => setFilters({ status: null, priority: null, dueDateRange: null, showCompleted: true })}
        >
          <X size={12} /> Limpar filtros
        </button>
      )}
    </div>
  );

  return (
    <div className="tasks-panel">
      <div className="tasks-header">
        <div className="tasks-header-left">
          <h1>Tarefas</h1>
          <span className="tasks-count">{tasks.length}</span>
        </div>
        <div className="tasks-header-right">
          <div style={{ position: 'relative' }}>
            <button
              className={`tasks-filter-btn ${hasActiveFilters ? 'active' : ''}`}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <Filter size={16} />
            </button>
            {showFilterDropdown && renderFilterDropdown()}
          </div>
          <button className="tasks-new-btn" onClick={() => { resetForm(); setShowCreateForm(true); setEditingId(null); }}>
            <Plus size={16} /> Nova Tarefa
          </button>
        </div>
      </div>

      <div className="tasks-main-tabs">
        <button className={`tasks-main-tab ${mainTab === 'my-tasks' ? 'active' : ''}`} onClick={() => setMainTab('my-tasks')}>
          Minhas tarefas
        </button>
        <button className={`tasks-main-tab ${mainTab === 'notebooks' ? 'active' : ''}`} onClick={() => setMainTab('notebooks')}>
          Cadernos
        </button>
        <button className={`tasks-main-tab ${mainTab === 'notes' ? 'active' : ''}`} onClick={() => setMainTab('notes')}>
          Notas
        </button>
      </div>

      {mainTab === 'my-tasks' && renderMyTasksContent()}
      {mainTab === 'notes' && renderNotesContent()}
      {mainTab === 'notebooks' && renderNotebooksContent()}
    </div>
  );
}
