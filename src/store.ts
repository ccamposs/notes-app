import { v4 as uuidv4 } from 'uuid';
import { Note, Notebook, Tag, ImageTag, AppState, NoteVersion, Bookmark, DashboardData, DashboardWidgetId, DashboardWidgetSize, StableLine, AccessLogEntry } from './types';
import { readState, writeState, readLegacyState, markLegacyMigrated } from './storage';

const STORAGE_KEY = 'notes-app-data';
const HISTORY_RESET_MARKER_KEY = 'notes-app-history-reset-v2';
export const MAX_NOTE_VERSIONS = 100;
export const STABLE_LINE_MS = 5 * 60 * 1000;
const LEGACY_SCRATCHPAD_KEY = 'notes-app-scratchpad';
const LEGACY_SCRATCHPAD_ALIGNMENT_KEY = 'notes-app-scratchpad-alignment';

export const DASHBOARD_WIDGET_IDS: DashboardWidgetId[] = [
  'scratchpad', 'tasks', 'summary', 'upcoming', 'notebooks', 'recent', 'favorites', 'inbox', 'quick-actions',
];
const DEFAULT_ENABLED_DASHBOARD_WIDGET_IDS: DashboardWidgetId[] = ['scratchpad', 'tasks', 'notebooks', 'recent', 'favorites'];

const defaultDashboard: DashboardData = {
  scratchpadHtml: '',
  layout: {
    widgetOrder: DASHBOARD_WIDGET_IDS,
    enabledWidgetIds: DEFAULT_ENABLED_DASHBOARD_WIDGET_IDS,
    widgetSizes: { scratchpad: 12, tasks: 12 },
    widgetHeights: {},
    widgetPositions: {},
  },
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeDashboard(savedDashboard: unknown): DashboardData {
  const saved = savedDashboard && typeof savedDashboard === 'object' ? savedDashboard as Partial<DashboardData> : {};
  const savedLayout = saved.layout && typeof saved.layout === 'object' ? saved.layout : undefined;
  const savedOrder = Array.isArray(savedLayout?.widgetOrder) ? savedLayout.widgetOrder : [];
  const savedEnabled = Array.isArray(savedLayout?.enabledWidgetIds) ? savedLayout.enabledWidgetIds : DEFAULT_ENABLED_DASHBOARD_WIDGET_IDS;
  const validOrder = [...new Set(savedOrder.filter((id): id is DashboardWidgetId => DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)))];
  const widgetOrder = [...validOrder, ...DASHBOARD_WIDGET_IDS.filter((id) => !validOrder.includes(id))];
  const validEnabled = [...new Set(savedEnabled.filter((id): id is DashboardWidgetId => DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)))];
  const wasPreviousAutomaticDefault = validEnabled.length === DASHBOARD_WIDGET_IDS.length;
  const enabledWidgetIds = wasPreviousAutomaticDefault ? DEFAULT_ENABLED_DASHBOARD_WIDGET_IDS : validEnabled;
  const savedSizes = savedLayout?.widgetSizes && typeof savedLayout.widgetSizes === 'object' ? savedLayout.widgetSizes as Record<string, unknown> : {};
  const widgetSizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>> = {};
  DASHBOARD_WIDGET_IDS.forEach((id) => {
    const size = savedSizes[id];
    if (typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= 12) {
      widgetSizes[id] = size;
    } else if (size === 'compact') {
      widgetSizes[id] = 3;
    } else if (size === 'normal') {
      widgetSizes[id] = 6;
    } else if (size === 'wide') {
      widgetSizes[id] = 12;
    }
  });
  if (!widgetSizes.scratchpad) widgetSizes.scratchpad = 12;
  if (!widgetSizes.tasks) widgetSizes.tasks = 12;
  const savedHeights = savedLayout?.widgetHeights && typeof savedLayout.widgetHeights === 'object' ? savedLayout.widgetHeights as Record<string, unknown> : {};
  const widgetHeights: Partial<Record<DashboardWidgetId, number>> = {};
  DASHBOARD_WIDGET_IDS.forEach((id) => {
    const height = savedHeights[id];
    if (typeof height === 'number' && Number.isFinite(height)) widgetHeights[id] = Math.min(900, Math.max(140, Math.round(height)));
  });
  const savedPositions = savedLayout?.widgetPositions && typeof savedLayout.widgetPositions === 'object' ? savedLayout.widgetPositions as Record<string, unknown> : {};
  const widgetPositions: Partial<Record<DashboardWidgetId, { column: number; row: number }>> = {};
  DASHBOARD_WIDGET_IDS.forEach((id) => {
    const position = savedPositions[id];
    if (!position || typeof position !== 'object') return;
    const { column, row } = position as { column?: unknown; row?: unknown };
    const maxColumn = 13 - (widgetSizes[id] || (id === 'scratchpad' || id === 'tasks' ? 12 : 6));
    if (typeof column === 'number' && Number.isInteger(column) && typeof row === 'number' && Number.isInteger(row) && row >= 1) {
      widgetPositions[id] = { column: Math.min(Math.max(1, column), maxColumn), row };
    }
  });
  return {
    scratchpadHtml: typeof saved.scratchpadHtml === 'string' ? saved.scratchpadHtml : '',
    layout: { widgetOrder, enabledWidgetIds, widgetSizes, widgetHeights, widgetPositions },
  };
}

const defaultState: AppState = {
  notes: [],
  notebooks: [],
  tags: [],
  imageTags: [],
  tasks: [],
  accessLog: [],
  settings: {
    theme: 'dark',
    customTheme: null,
    newNoteLocation: 'current-notebook',
    remindersEnabled: true,
    desktopNotifications: true,
    soundNotifications: true,
    reminderPopupEnabled: false,
    googleCalendarEnabled: false,
    googleCalendarId: 'primary',
    googleCalendarClientId: '',
    googleCalendarSyncAllActiveTasks: false,
    googleCalendarSyncNewTasks: false,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    trashRetentionDays: 30,
    searchPreviewEnabled: true,
    templatesEnabled: true,
    dragDropEnabled: true,
    keyboardShortcutsEnabled: true,
    wordCountEnabled: true,
    quickNoteEnabled: true,
    noteLinksEnabled: true,
    autoSummaryEnabled: true,
  },
  dashboard: defaultDashboard,
  selectedNoteId: null,
  viewMode: 'dashboard',
  activeNotebookId: null,
  activeTagId: null,
  searchQuery: '',
  sidebarCollapsed: false,
};

export function getContentLines(html: string): string[] {
  const text = html
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function validStableSince(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

export function createLineStability(content: string, stableSince = new Date().toISOString()): StableLine[] {
  return getContentLines(content).map((text) => ({ text, stableSince }));
}

export function normalizeLineStability(content: string, stability: unknown, fallbackStableSince: string): StableLine[] {
  const lines = getContentLines(content);
  if (!Array.isArray(stability) || stability.length !== lines.length) return createLineStability(content, fallbackStableSince);
  return lines.map((text, index) => {
    const candidate = stability[index];
    return candidate && typeof candidate === 'object' && (candidate as StableLine).text === text
      ? { text, stableSince: validStableSince((candidate as StableLine).stableSince, fallbackStableSince) }
      : { text, stableSince: fallbackStableSince };
  });
}

export function reconcileLineStability(
  previousContent: string,
  nextContent: string,
  previousStability: StableLine[],
  now = new Date().toISOString(),
): { lineStability: StableLine[]; hasStableRemoval: boolean } {
  const before = getContentLines(previousContent);
  const after = getContentLines(nextContent);
  const stableBefore = normalizeLineStability(previousContent, previousStability, now);
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex--) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex--) {
      matrix[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
        ? matrix[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
    }
  }

  const nextStability: StableLine[] = [];
  const removed: StableLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (beforeIndex < before.length && afterIndex < after.length && before[beforeIndex] === after[afterIndex]) {
      nextStability.push(stableBefore[beforeIndex]);
      beforeIndex++;
      afterIndex++;
    } else if (afterIndex < after.length && (beforeIndex === before.length || matrix[beforeIndex][afterIndex + 1] >= matrix[beforeIndex + 1][afterIndex])) {
      nextStability.push({ text: after[afterIndex], stableSince: now });
      afterIndex++;
    } else {
      removed.push(stableBefore[beforeIndex]);
      beforeIndex++;
    }
  }

  const nowMs = Date.parse(now);
  const hasStableRemoval = removed.some((line) => nowMs - Date.parse(line.stableSince) >= STABLE_LINE_MS);
  return { lineStability: nextStability, hasStableRemoval };
}

export function normalizeVersionHistory(history: unknown): NoteVersion[] {
  if (!Array.isArray(history)) return [];
  const normalized = history.reduce<NoteVersion[]>((versions, raw) => {
    if (!raw || typeof raw.content !== 'string' || typeof raw.title !== 'string' || typeof raw.timestamp !== 'string') return versions;
    const version: NoteVersion = {
      id: typeof raw.id === 'string' ? raw.id : uuidv4(),
      title: raw.title,
      content: raw.content,
      timestamp: raw.timestamp,
      summary: typeof raw.summary === 'string' ? raw.summary : 'Alteração salva',
    };
    const previous = versions[versions.length - 1];
    if (previous && previous.title === version.title && previous.content === version.content) return versions;
    return [...versions, version];
  }, []);
  return normalized.slice(-MAX_NOTE_VERSIONS);
}

/** Normaliza e migra um estado bruto vindo do armazenamento. */
function migrateRawState(parsed: any): AppState {
  {
    {
      const shouldResetHistory = !localStorage.getItem(HISTORY_RESET_MARKER_KEY);
      // Migrate notes to ensure all fields exist
      if (parsed.notes) {
        parsed.notes = parsed.notes.map((n: any) => ({
          ...n,
          bookmarks: n.bookmarks || [],
          commentThreads: Array.isArray(n.commentThreads)
            ? n.commentThreads.map((thread: any) => ({
                ...thread,
                selectedText: typeof thread.selectedText === 'string' ? thread.selectedText : '',
                color: typeof thread.color === 'string' ? thread.color : '#60a5fa',
                messages: Array.isArray(thread.messages)
                  ? thread.messages.map((message: any) => ({
                      ...message,
                      content: typeof message.content === 'string'
                        ? message.content
                        : (typeof message.text === 'string' ? message.text : ''),
                    }))
                  : [],
                resolved: thread.resolved === true,
                resolvedAt: thread.resolvedAt ?? null,
              }))
            : [],
          history: shouldResetHistory ? [] : normalizeVersionHistory(n.history),
          lineStability: normalizeLineStability(
            typeof n.content === 'string' ? n.content : '',
            n.lineStability,
            validStableSince(n.updatedAt, new Date().toISOString()),
          ),
          tags: n.tags || [],
        }));
      }
      // Migrate tasks
      if (parsed.tasks) {
        parsed.tasks = parsed.tasks.map((t: any) => ({
          ...t,
          reminderMinutes: t.reminderMinutes ?? null,
          reminderSound: t.reminderSound || 'bell',
          reminderFired: t.reminderFired || false,
          descriptionAlignment: t.descriptionAlignment || 'left',
          recurrence: t.recurrence || 'none',
          recurrenceInterval: t.recurrenceInterval || 1,
          updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : (typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString()),
          calendarSyncEnabled: t.calendarSyncEnabled === true,
          calendarId: typeof t.calendarId === 'string' ? t.calendarId : null,
          calendarEventId: typeof t.calendarEventId === 'string' ? t.calendarEventId : null,
          calendarEtag: typeof t.calendarEtag === 'string' ? t.calendarEtag : null,
          calendarLastSyncedAt: typeof t.calendarLastSyncedAt === 'string' ? t.calendarLastSyncedAt : null,
          calendarRemoteDeletedAt: typeof t.calendarRemoteDeletedAt === 'string' ? t.calendarRemoteDeletedAt : null,
          calendarSyncState: ['synced', 'remote-deleted', 'error'].includes(t.calendarSyncState) ? t.calendarSyncState : 'idle',
        }));
      }
      if (!parsed.dashboard) {
        const legacyText = localStorage.getItem(LEGACY_SCRATCHPAD_KEY) || '';
        parsed.dashboard = {
          ...defaultDashboard,
          scratchpadHtml: legacyText ? `<p>${escapeHtml(legacyText).replace(/\n/g, '<br>')}</p>` : '',
        };
        localStorage.removeItem(LEGACY_SCRATCHPAD_KEY);
        localStorage.removeItem(LEGACY_SCRATCHPAD_ALIGNMENT_KEY);
      }
      parsed.dashboard = normalizeDashboard(parsed.dashboard);
      parsed.settings = { ...defaultState.settings, ...(parsed.settings || {}) };
      // Garantir que notebooks e tags existam como arrays
      if (!Array.isArray(parsed.notebooks)) parsed.notebooks = [];
      if (!Array.isArray(parsed.tags)) parsed.tags = [];
      if (!Array.isArray(parsed.imageTags)) parsed.imageTags = [];
      if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
      if (!Array.isArray(parsed.accessLog)) parsed.accessLog = [];
      const migratedState = { ...defaultState, ...parsed };
      if (shouldResetHistory) localStorage.setItem(HISTORY_RESET_MARKER_KEY, '1');
      return migratedState;
    }
  }
}

/** Estado inicial usado enquanto os dados são carregados do IndexedDB. */
export function getInitialState(): AppState {
  return { ...defaultState };
}

/** Carrega o estado do IndexedDB, migrando dados antigos do localStorage. */
export async function loadStateAsync(): Promise<AppState> {
  try {
    // 1. Tenta o IndexedDB (armazenamento principal)
    const stored = await readState<any>();
    if (stored) return migrateRawState(stored);

    // 2. Migra dados antigos do localStorage, se existirem
    const legacy = readLegacyState();
    if (legacy) {
      const migrated = migrateRawState(legacy);
      await writeState(serializeState(migrated));
      markLegacyMigrated();
      return migrated;
    }
  } catch (e) {
    console.error('Falha ao carregar o estado:', e);
  }
  return { ...defaultState };
}

export class StorageQuotaError extends Error {
  constructor(public sizeMB: number) {
    super(`Armazenamento excedido (${sizeMB.toFixed(1)} MB)`);
    this.name = 'StorageQuotaError';
  }
}

function serializeState(state: AppState) {
  return {
    notes: state.notes,
    notebooks: state.notebooks,
    tags: state.tags,
    imageTags: state.imageTags,
    tasks: state.tasks,
    accessLog: state.accessLog,
    settings: state.settings,
    dashboard: state.dashboard,
    selectedNoteId: state.selectedNoteId,
    viewMode: state.viewMode,
    activeNotebookId: state.activeNotebookId,
    activeTagId: state.activeTagId,
    searchQuery: state.searchQuery,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

/** Grava o estado no IndexedDB. */
export async function saveStateAsync(state: AppState): Promise<void> {
  await writeState(serializeState(state));
}

/** Tamanho aproximado dos dados armazenados, em bytes. */
export function getStateSizeBytes(state: AppState): number {
  try {
    return new Blob([JSON.stringify(serializeState(state))]).size;
  } catch {
    return 0;
  }
}

export function createNote(notebookId: string | null = null): Note {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title: '',
    content: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    status: 'active',
    isFavorite: false,
    notebookId,
    tags: [],
    history: [],
    lineStability: [],
    bookmarks: [],
    commentThreads: [],
    audioClips: [],
    isLocked: false,
    lockPasswordHash: '',
    lockHint: '',
  };
}

function getSnapshotText(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function calculateTextChanges(previousHtml: string, currentHtml: string): { added: number; removed: number } {
  const previous = Array.from(getSnapshotText(previousHtml));
  const current = Array.from(getSnapshotText(currentHtml));
  let start = 0;
  while (start < previous.length && start < current.length && previous[start] === current[start]) start++;

  let previousEnd = previous.length - 1;
  let currentEnd = current.length - 1;
  while (previousEnd >= start && currentEnd >= start && previous[previousEnd] === current[currentEnd]) {
    previousEnd--;
    currentEnd--;
  }

  const changedPrevious = previous.slice(start, previousEnd + 1);
  const changedCurrent = current.slice(start, currentEnd + 1);
  if (!changedPrevious.length || !changedCurrent.length) {
    return { added: changedCurrent.length, removed: changedPrevious.length };
  }

  // LCS calcula os caracteres realmente preservados, inclusive quando há várias
  // mudanças em pontos distantes do texto. Assim a contagem não inclui o trecho
  // inalterado entre duas edições como se tivesse sido removido e adicionado.
  let previousRow = new Uint32Array(changedCurrent.length + 1);
  for (const previousCharacter of changedPrevious) {
    const currentRow = new Uint32Array(changedCurrent.length + 1);
    for (let index = 1; index <= changedCurrent.length; index++) {
      currentRow[index] = previousCharacter === changedCurrent[index - 1]
        ? previousRow[index - 1] + 1
        : Math.max(previousRow[index], currentRow[index - 1]);
    }
    previousRow = currentRow;
  }
  const preservedCharacters = previousRow[changedCurrent.length];
  return {
    added: changedCurrent.length - preservedCharacters,
    removed: changedPrevious.length - preservedCharacters,
  };
}

export function createVersion(note: Note, previousContent?: string, previousTitle?: string, summaryOverride?: string): NoteVersion {
  let summary = summaryOverride || '';
  if (summaryOverride) {
    summary = summaryOverride;
  } else if (previousContent !== undefined || previousTitle !== undefined) {
    const changes: string[] = [];
    if (previousTitle !== undefined && previousTitle !== note.title) changes.push('Título alterado');
    if (previousContent !== undefined && previousContent !== note.content) {
      const { added, removed } = calculateTextChanges(previousContent, note.content);
      if (added) changes.push(`${added} caractere${added === 1 ? '' : 's'} adicionado${added === 1 ? '' : 's'}`);
      if (removed) changes.push(`${removed} caractere${removed === 1 ? '' : 's'} removido${removed === 1 ? '' : 's'}`);
      if (!added && !removed) changes.push('Formatação alterada');
    }
    summary = changes.join(', ') || 'Alteração salva';
  } else {
    summary = 'Versão salva manualmente';
  }

  return {
    id: uuidv4(),
    title: note.title,
    content: note.content,
    timestamp: new Date().toISOString(),
    summary,
  };
}

function stripHtmlRaw(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function createBookmark(text: string, position: number): Bookmark {
  return {
    id: uuidv4(),
    text,
    position,
    createdAt: new Date().toISOString(),
  };
}

export function createNotebook(name: string, order: number): Notebook {
  return {
    id: uuidv4(),
    name,
    createdAt: new Date().toISOString(),
    order,
    icon: '📓',
    parentId: null,
    isLocked: false,
    lockPasswordHash: '',
    lockHint: '',
  };
}

export function createTag(name: string, color: string): Tag {
  return {
    id: uuidv4(),
    name,
    color,
  };
}

export function filterNotes(notes: Note[], state: AppState): Note[] {
  let filtered: Note[];

  switch (state.viewMode) {
    case 'all':
      filtered = notes.filter((n) => n.status === 'active');
      break;
    case 'favorites':
      filtered = notes.filter((n) => n.status === 'active' && n.isFavorite);
      break;
    case 'archived':
      filtered = notes.filter((n) => n.status === 'archived');
      break;
    case 'trash':
      filtered = notes.filter((n) => n.status === 'deleted');
      break;
    case 'notebook':
      filtered = notes.filter(
        (n) => n.status === 'active' && n.notebookId === state.activeNotebookId
      );
      break;
    case 'tag':
      filtered = notes.filter(
        (n) => n.status === 'active' && state.activeTagId && n.tags.includes(state.activeTagId)
      );
      break;
    case 'search':
      const q = state.searchQuery.toLowerCase();
      filtered = notes.filter((n) => {
        if (n.status === 'deleted') return false;
        const titleMatch = n.title.toLowerCase().includes(q);
        const contentMatch = n.content.toLowerCase().includes(q);
        const commentMatch = (n.commentThreads || []).some((thread) =>
          thread.selectedText.toLowerCase().includes(q)
          || thread.messages.some((message) => message.content.toLowerCase().includes(q))
        );
        const tagMatch = n.tags.some((tagId) => {
          const tag = state.tags.find((t) => t.id === tagId);
          return tag?.name.toLowerCase().includes(q);
        });
        const notebookMatch = (() => {
          if (!n.notebookId) return false;
          const nb = state.notebooks.find((nb) => nb.id === n.notebookId);
          return nb?.name.toLowerCase().includes(q);
        })();
        return titleMatch || contentMatch || commentMatch || tagMatch || notebookMatch;
      });
      break;
    default:
      filtered = notes.filter((n) => n.status === 'active');
  }

  return filtered;
}

export function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}
