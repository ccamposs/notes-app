export type NoteStatus = 'active' | 'archived' | 'deleted';

export interface StableLine {
  text: string;
  stableSince: string;
}

export interface NoteVersion {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  summary: string;
}

export interface Bookmark {
  id: string;
  text: string;
  position: number;
  createdAt: string;
}

export interface CommentMessage {
  id: string;
  content: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  selectedText: string;
  color: string;
  messages: CommentMessage[];
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  status: NoteStatus;
  isFavorite: boolean;
  notebookId: string | null;
  tags: string[];
  history: NoteVersion[];
  lineStability: StableLine[];
  bookmarks: Bookmark[];
  commentThreads: CommentThread[];
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  order: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export type ViewMode = 'dashboard' | 'all' | 'favorites' | 'archived' | 'trash' | 'notebook' | 'tag' | 'search' | 'tasks' | 'settings' | 'gallery';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type TextAlignment = 'left' | 'center' | 'right';
export type AppTheme = 'dark' | 'light';
export type NewNoteLocation = 'current-notebook' | 'inbox';

export interface AppSettings {
  theme: AppTheme;
  newNoteLocation: NewNoteLocation;
  remindersEnabled: boolean;
  desktopNotifications: boolean;
  soundNotifications: boolean;
  // Recursos adicionais (todos ativos por padrão)
  searchPreviewEnabled: boolean;
  templatesEnabled: boolean;
  dragDropEnabled: boolean;
  keyboardShortcutsEnabled: boolean;
  wordCountEnabled: boolean;
  quickNoteEnabled: boolean;
  noteLinksEnabled: boolean;
  autoSummaryEnabled: boolean;
}

export type DashboardWidgetId = 'scratchpad' | 'tasks' | 'summary' | 'upcoming' | 'notebooks' | 'recent' | 'favorites' | 'inbox' | 'quick-actions';

export type DashboardWidgetSize = number;

export interface DashboardWidgetPosition {
  column: number;
  row: number;
}

export interface DashboardLayout {
  widgetOrder: DashboardWidgetId[];
  enabledWidgetIds: DashboardWidgetId[];
  widgetSizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>>;
  widgetHeights: Partial<Record<DashboardWidgetId, number>>;
  widgetPositions: Partial<Record<DashboardWidgetId, DashboardWidgetPosition>>;
}

export interface DashboardData {
  scratchpadHtml: string;
  layout: DashboardLayout;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  descriptionAlignment: TextAlignment;
  dueDate: string | null;
  dueTime: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  noteId: string | null;
  createdAt: string;
  completedAt: string | null;
  reminderMinutes: number | null;
  reminderSound: string;
  reminderFired: boolean;
  recurrence: RecurrenceType;
  recurrenceInterval: number;
}

export interface AppState {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  tasks: Task[];
  settings: AppSettings;
  dashboard: DashboardData;
  selectedNoteId: string | null;
  viewMode: ViewMode;
  activeNotebookId: string | null;
  activeTagId: string | null;
  searchQuery: string;
  sidebarCollapsed: boolean;
}
