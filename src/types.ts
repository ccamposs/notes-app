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
  deletedAt: string | null;
  status: NoteStatus;
  isFavorite: boolean;
  notebookId: string | null;
  tags: string[];
  history: NoteVersion[];
  lineStability: StableLine[];
  bookmarks: Bookmark[];
  commentThreads: CommentThread[];
  audioClips: AudioClip[];
  // Bloqueio por senha
  isLocked: boolean;
  lockPasswordHash: string;
  lockHint: string;
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  order: number;
  icon: string;
  parentId: string | null;
  // Bloqueio por senha
  isLocked: boolean;
  lockPasswordHash: string;
  lockHint: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ImageTag {
  id: string;
  name: string;
  color: string;
}

export type ViewMode = 'dashboard' | 'all' | 'favorites' | 'archived' | 'trash' | 'notebook' | 'tag' | 'search' | 'tasks' | 'settings' | 'gallery';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type TextAlignment = 'left' | 'center' | 'right';
export type AppTheme = 'dark' | 'light' | 'custom';
export type NewNoteLocation = 'current-notebook' | 'inbox';

export interface AudioClip {
  id: string;
  dataUrl: string;
  duration: number;
  createdAt: string;
}

export interface AccessLogEntry {
  id: string;
  action: string;
  targetType: 'note' | 'notebook' | 'image' | 'text';
  targetId: string;
  targetName: string;
  timestamp: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    border: string;
  };
}

export interface AppSettings {
  theme: AppTheme;
  customTheme: CustomTheme | null;
  newNoteLocation: NewNoteLocation;
  remindersEnabled: boolean;
  desktopNotifications: boolean;
  soundNotifications: boolean;
  reminderPopupEnabled: boolean;
  // Google Calendar (não contém credenciais)
  googleCalendarEnabled: boolean;
  googleCalendarId: string;
  googleCalendarClientId: string;
  googleCalendarSyncAllActiveTasks: boolean;
  googleCalendarSyncNewTasks: boolean;
  // Fonte e tamanho
  fontFamily: string;
  fontSize: number;
  // Lixeira
  trashRetentionDays: number;
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
  // Vinculação opcional e não secreta ao Google Calendar
  updatedAt: string;
  calendarSyncEnabled: boolean;
  calendarId: string | null;
  calendarEventId: string | null;
  calendarEtag: string | null;
  calendarLastSyncedAt: string | null;
  calendarRemoteDeletedAt: string | null;
  calendarSyncState: 'idle' | 'synced' | 'remote-deleted' | 'error';
}

export interface AppState {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  imageTags: ImageTag[];
  tasks: Task[];
  accessLog: AccessLogEntry[];
  settings: AppSettings;
  dashboard: DashboardData;
  selectedNoteId: string | null;
  viewMode: ViewMode;
  activeNotebookId: string | null;
  activeTagId: string | null;
  searchQuery: string;
  sidebarCollapsed: boolean;
}
