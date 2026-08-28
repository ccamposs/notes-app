import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, CommentMessage, CommentThread, DashboardData, Note, Task, ViewMode } from './types';
import { loadStateAsync, saveStateAsync, getInitialState, createNote, createNotebook, createTag, createVersion, createLineStability, filterNotes, stripHtml, MAX_NOTE_VERSIONS } from './store';
import { requestPersistentStorage } from './storage';
import { formatNoteAsText, formatNoteAsMarkdown, formatNoteAsHtml, generateDocx, generateAndDownloadPdf, downloadFile, downloadBlob } from './export';
import { checkTaskReminders } from './notifications';
import Sidebar from './components/Sidebar';

function getNextRecurrenceDate(currentDate: string, recurrence: string, interval: number): string {
  const d = new Date(currentDate + 'T00:00:00');
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + interval); break;
    case 'weekly': d.setDate(d.getDate() + 7 * interval); break;
    case 'monthly': d.setMonth(d.getMonth() + interval); break;
    case 'custom': d.setDate(d.getDate() + interval); break;
  }
  return d.toISOString().split('T')[0];
}
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import Dashboard from './components/Dashboard';
import Tasks from './components/Tasks';
import Settings from './components/Settings';
import UpdateNotifier from './components/UpdateNotifier';
import SyncStatus from './components/SyncStatus';
import QuickNote from './components/QuickNote';
import NoteTemplates from './components/NoteTemplates';
import WordCount from './components/WordCount';
import NoteSummary from './components/NoteSummary';
import Gallery from './components/Gallery';
import WhatsNew from './components/WhatsNew';
import AISearch from './components/AISearch';
import { RELEASE_NOTES, findReleaseNote } from './releaseNotes';
import { LocalSyncClient, SyncStatus as SyncStatusData } from './sync';
import { hashPassword, verifyPassword } from './crypto';
import PasswordModal from './components/PasswordModal';

const LAST_SEEN_VERSION_KEY = 'notes-app-last-seen-version';

type NavigationEntry = Pick<AppState, 'viewMode' | 'activeNotebookId' | 'activeTagId' | 'selectedNoteId' | 'searchQuery'>;
type NoteUpdateOptions = { preservePreviousVersion?: boolean };

function navigationEntry(state: AppState): NavigationEntry {
  return {
    viewMode: state.viewMode,
    activeNotebookId: state.activeNotebookId,
    activeTagId: state.activeTagId,
    selectedNoteId: state.selectedNoteId,
    searchQuery: state.searchQuery,
  };
}

function sameNavigationEntry(first: NavigationEntry, second: NavigationEntry): boolean {
  return first.viewMode === second.viewMode
    && first.activeNotebookId === second.activeNotebookId
    && first.activeTagId === second.activeTagId
    && first.selectedNoteId === second.selectedNoteId
    && first.searchQuery === second.searchQuery;
}

export default function App() {
  const [state, setState] = useState<AppState>(getInitialState);
  const [isLoading, setIsLoading] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const navigationStackRef = useRef<NavigationEntry[]>([navigationEntry(state)]);
  const navigationIndexRef = useRef(0);
  const [navigationControls, setNavigationControls] = useState({ canGoBack: false, canGoForward: false });
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [hasUnseenWhatsNew, setHasUnseenWhatsNew] = useState(false);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [lockModal, setLockModal] = useState<{ mode: 'create' | 'unlock'; targetId: string; targetType: 'note' | 'notebook'; hint?: string } | null>(null);
  const [lockError, setLockError] = useState('');
  const [showAISearch, setShowAISearch] = useState(false);
  const [galleryReturnView, setGalleryReturnView] = useState<{ viewMode: ViewMode; notebookId: string | null; noteId: string | null } | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInProgressRef = useRef(false);
  const pendingSaveRef = useRef<AppState | null>(null);
  const saveFlushPromiseRef = useRef<Promise<void> | null>(null);
  const syncClientRef = useRef<LocalSyncClient | null>(null);
  const calendarSyncInProgressRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusData>({ phase: 'connecting', pendingChanges: 0, lastSyncedAt: 0 });
  const isRevertingRef = useRef(false);

  // Carrega os dados do IndexedDB na abertura.
  // Se o IndexedDB estiver vazio (nova instalação), tenta buscar do disco (Electron),
  // do serviço de sincronização, ou dos backups automáticos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = await loadStateAsync();

      // Se não há notas locais, tenta recuperar de fontes alternativas
      if (loaded.notes.length === 0) {
        // 1. Tenta a persistência em disco do Electron
        if (window.electronAPI?.diskLoadState) {
          try {
            const diskResult = await window.electronAPI.diskLoadState();
            if (diskResult.state && Array.isArray((diskResult.state as any).notes) && (diskResult.state as any).notes.length > 0) {
              const diskState = diskResult.state as any;
              loaded = { ...loaded, notes: diskState.notes, notebooks: diskState.notebooks || loaded.notebooks, tags: diskState.tags || loaded.tags, tasks: diskState.tasks || loaded.tasks, settings: diskState.settings || loaded.settings, dashboard: diskState.dashboard || loaded.dashboard };
              await saveStateAsync(loaded);
            }
          } catch (e) {
            console.error('Falha ao carregar do disco:', e);
          }
        }

        // 2. Tenta o serviço de sincronização
        if (loaded.notes.length === 0) {
          try {
            const response = await fetch('http://127.0.0.1:32147/sync/state', { signal: AbortSignal.timeout(2000) });
            if (response.ok) {
              const data = await response.json();
              if (data && data.state && Array.isArray(data.state.notes) && data.state.notes.length > 0) {
                loaded = { ...loaded, ...data.state };
                await saveStateAsync(loaded);
              }
            }
          } catch {
            // Serviço indisponível
          }
        }

        // 3. Se ainda vazio e no Electron, oferece restaurar backup automático
        if (loaded.notes.length === 0 && window.electronAPI?.diskListBackups) {
          try {
            const backups = await window.electronAPI.diskListBackups();
            if (backups.length > 0) {
              const restore = confirm(
                'Nenhuma nota foi encontrada, mas existem backups automáticos disponíveis.\n\nDeseja restaurar o backup mais recente?'
              );
              if (restore) {
                const result = await window.electronAPI.diskRestoreBackup(backups[0].path);
                if (result.success && result.state) {
                  const restored = result.state as any;
                  loaded = { ...loaded, notes: restored.notes || [], notebooks: restored.notebooks || [], tags: restored.tags || [], tasks: restored.tasks || [], settings: restored.settings || loaded.settings, dashboard: restored.dashboard || loaded.dashboard };
                  await saveStateAsync(loaded);
                }
              }
            }
          } catch (e) {
            console.error('Falha na recuperação de backup:', e);
          }
        }
      }

      if (cancelled) return;
      setState(loaded);
      stateRef.current = loaded;
      navigationStackRef.current = [navigationEntry(loaded)];
      setIsLoading(false);
      requestPersistentStorage();
    })();
    return () => { cancelled = true; };
  }, []);

  // Grava apenas a versão mais recente que ficou parada por 300 ms. Se o usuário
  // continua editando, as versões intermediárias não geram cópias, IPC ou sync.
  const safeSave = useCallback((nextState: AppState): Promise<void> => {
    pendingSaveRef.current = nextState;
    if (saveInProgressRef.current) return saveFlushPromiseRef.current ?? Promise.resolve();

    const flushLatestState = async () => {
      saveInProgressRef.current = true;
      try {
        while (pendingSaveRef.current) {
          const stateToSave = pendingSaveRef.current;
          pendingSaveRef.current = null;
          await saveStateAsync(stateToSave);

          // Uma alteração mais nova chegou durante o clone/gravação no IndexedDB.
          // Ela substitui esta versão antes de enviar dados grandes ao Electron/WebSocket.
          if (pendingSaveRef.current) continue;

          if (window.electronAPI?.diskSaveState) {
            const diskData = {
              notes: stateToSave.notes,
              notebooks: stateToSave.notebooks,
              tags: stateToSave.tags,
              tasks: stateToSave.tasks,
              settings: stateToSave.settings,
              dashboard: stateToSave.dashboard,
            };
            const diskResult = await window.electronAPI.diskSaveState(diskData);
            if (!diskResult.success) console.error('Falha na persistência em disco:', diskResult.error);
          }
          syncClientRef.current?.saveLocalChange(stateToSave);
        }
      } catch (error) {
        console.error('Não foi possível gravar o estado:', error);
      } finally {
        saveInProgressRef.current = false;
        // Garante uma nova passagem caso uma alteração chegue exatamente ao finalizar a fila.
        if (pendingSaveRef.current) void safeSave(pendingSaveRef.current);
      }
    };

    const flushPromise = flushLatestState();
    saveFlushPromiseRef.current = flushPromise;
    return flushPromise;
  }, []);

  const flushPendingSaves = useCallback(async () => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    let observedFlush: Promise<void>;
    do {
      observedFlush = safeSave(stateRef.current);
      await observedFlush;
    } while (saveInProgressRef.current || pendingSaveRef.current !== null || observedFlush !== saveFlushPromiseRef.current);
    await syncClientRef.current?.waitForPendingSync();
  }, [safeSave]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFlushBeforeQuit || !api.confirmFlushBeforeQuit) return;
    return api.onFlushBeforeQuit(() => {
      void flushPendingSaves()
        .catch((error) => console.error('Não foi possível finalizar a gravação antes de sair:', error))
        .finally(() => api.confirmFlushBeforeQuit?.());
    });
  }, [flushPendingSaves]);

  const persistState = useCallback((newState: AppState) => {
    stateRef.current = newState;
    setState(newState);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => safeSave(newState), 300);
  }, [safeSave]);

  // Functional persist that uses latest state
  const persistFn = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const newState = updater(prev);
      stateRef.current = newState;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => safeSave(newState), 300);
      return newState;
    });
  }, [safeSave]);

  const syncGoogleCalendar = useCallback(async () => {
    const api = window.electronAPI;
    const snapshot = stateRef.current;
    const settings = snapshot.settings;
    if (!api?.googleCalendarSync || !settings.googleCalendarEnabled || !settings.googleCalendarId) {
      return { synced: false, conflicts: 0 };
    }
    if (calendarSyncInProgressRef.current) return { synced: false, conflicts: 0 };

    calendarSyncInProgressRef.current = true;
    const tasksAtStart = snapshot.tasks;
    try {
      const result = await api.googleCalendarSync(
        tasksAtStart,
        settings.googleCalendarId,
        settings.googleCalendarSyncAllActiveTasks,
      );
      // Não aplica uma resposta antiga caso o usuário tenha alterado tarefas durante a sincronização.
      if (stateRef.current.tasks !== tasksAtStart) return { synced: false, conflicts: result.conflicts.length };
      if (JSON.stringify(tasksAtStart) !== JSON.stringify(result.tasks)) {
        persistFn((current) => ({ ...current, tasks: result.tasks }));
      }
      return { synced: true, conflicts: result.conflicts.length };
    } finally {
      calendarSyncInProgressRef.current = false;
    }
  }, [persistFn]);

  const calendarTaskSignature = state.tasks
    .map((task) => `${task.id}:${task.updatedAt}:${task.calendarSyncEnabled}:${task.status}`)
    .join('|');

  useEffect(() => {
    if (isLoading || !state.settings.googleCalendarEnabled || !window.electronAPI?.googleCalendarSync) return;
    const firstSync = setTimeout(() => {
      syncGoogleCalendar().catch((error) => console.error('Não foi possível sincronizar com o Google Calendar:', error));
    }, 800);
    const interval = setInterval(() => {
      syncGoogleCalendar().catch((error) => console.error('Não foi possível atualizar as alterações do Google Calendar:', error));
    }, 5 * 60 * 1000);
    return () => {
      clearTimeout(firstSync);
      clearInterval(interval);
    };
  }, [isLoading, state.settings.googleCalendarEnabled, state.settings.googleCalendarId, state.settings.googleCalendarSyncAllActiveTasks, calendarTaskSignature, syncGoogleCalendar]);

  // O IndexedDB continua sendo o cache offline. Ao receber um snapshot remoto,
  // ele é salvo diretamente para não gerar uma nova operação de sincronização.
  useEffect(() => {
    if (isLoading) return;
    const client = new LocalSyncClient();
    syncClientRef.current = client;
    client.start(
      stateRef.current,
      (remoteState) => {
        stateRef.current = remoteState;
        setState(remoteState);
        navigationStackRef.current = [navigationEntry(remoteState)];
        navigationIndexRef.current = 0;
        setNavigationControls({ canGoBack: false, canGoForward: false });
        saveStateAsync(remoteState).catch((error) => console.error('Não foi possível salvar a sincronização local:', error));
      },
      setSyncStatus,
    );
    return () => {
      client.stop();
      if (syncClientRef.current === client) syncClientRef.current = null;
    };
  }, [isLoading]);

  const updateNavigationControls = useCallback(() => {
    setNavigationControls({
      canGoBack: navigationIndexRef.current > 0,
      canGoForward: navigationIndexRef.current < navigationStackRef.current.length - 1,
    });
  }, []);

  const recordNavigation = useCallback((nextState: AppState) => {
    const nextEntry = navigationEntry(nextState);
    const currentEntry = navigationStackRef.current[navigationIndexRef.current];
    if (currentEntry && sameNavigationEntry(currentEntry, nextEntry)) return;
    navigationStackRef.current = [...navigationStackRef.current.slice(0, navigationIndexRef.current + 1), nextEntry];
    navigationIndexRef.current = navigationStackRef.current.length - 1;
    updateNavigationControls();
  }, [updateNavigationControls]);

  const navigate = useCallback((updater: (current: AppState) => AppState) => {
    const nextState = updater(stateRef.current);
    stateRef.current = nextState;
    recordNavigation(nextState);
    setState(nextState);
  }, [recordNavigation]);

  const handleNavigateBack = useCallback(() => {
    if (navigationIndexRef.current <= 0) return;
    navigationIndexRef.current -= 1;
    const nextState = { ...stateRef.current, ...navigationStackRef.current[navigationIndexRef.current] };
    stateRef.current = nextState;
    setState(nextState);
    updateNavigationControls();
  }, [updateNavigationControls]);

  const handleNavigateForward = useCallback(() => {
    if (navigationIndexRef.current >= navigationStackRef.current.length - 1) return;
    navigationIndexRef.current += 1;
    const nextState = { ...stateRef.current, ...navigationStackRef.current[navigationIndexRef.current] };
    stateRef.current = nextState;
    setState(nextState);
    updateNavigationControls();
  }, [updateNavigationControls]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  // Atalhos de teclado globais
  useEffect(() => {
    if (!state.settings.keyboardShortcutsEnabled) return;
    const handleKeydown = (e: KeyboardEvent) => {
      // Ignora se está num input/textarea (exceto se for Escape)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        handleCreateNote();
      } else if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        if (state.settings.quickNoteEnabled) setShowQuickNote(true);
      } else if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        navigate((s) => ({ ...s, viewMode: 'search', searchQuery: '' }));
      } else if (e.ctrlKey && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        if (state.settings.templatesEnabled) setShowTemplates(true);
      } else if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAISearch(true);
      } else if (e.ctrlKey && e.key === '1' && !isInput) {
        e.preventDefault();
        navigate((s) => ({ ...s, viewMode: 'dashboard' }));
      } else if (e.ctrlKey && e.key === '2' && !isInput) {
        e.preventDefault();
        navigate((s) => ({ ...s, viewMode: 'all' }));
      } else if (e.ctrlKey && e.key === '3' && !isInput) {
        e.preventDefault();
        navigate((s) => ({ ...s, viewMode: 'tasks' }));
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [state.settings.keyboardShortcutsEnabled, state.settings.quickNoteEnabled, state.settings.templatesEnabled, navigate]);

  // Check reminders every 30 seconds
  useEffect(() => {
    if (!state.settings.remindersEnabled) return;
    const interval = setInterval(() => {
      const tasks = state.tasks || [];
      checkTaskReminders(tasks, (taskId) => {
        persistFn((s) => ({
          ...s,
          tasks: (s.tasks || []).map((t) => t.id === taskId ? { ...t, reminderFired: true } : t),
        }));
      }, {
        soundNotifications: state.settings.soundNotifications,
        desktopNotifications: state.settings.desktopNotifications,
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [state.tasks, state.settings, persistFn]);

  // Registro da última gravação bem-sucedida (sem duplicar os dados,
  // para não consumir o dobro do armazenamento disponível)
  useEffect(() => {
    const BACKUP_INTERVAL = 5 * 60 * 1000;
    const interval = setInterval(() => {
      try {
        localStorage.setItem('notes-app-backup-date', new Date().toISOString());
      } catch (e) {
        console.error('Falha ao registrar backup:', e);
      }
    }, BACKUP_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const selectedNote = state.notes.find((n) => n.id === state.selectedNoteId) || null;
  const openNotes = openNoteIds
    .map((id) => state.notes.find((note) => note.id === id && note.status !== 'deleted'))
    .filter((note): note is Note => Boolean(note));
  const filteredNotes = filterNotes(state.notes, state).filter((note) => {
    // Notas bloqueadas são invisíveis até autenticar na sessão
    if (note.isLocked && !unlockedIds.has(note.id)) return false;
    // Notas de cadernos bloqueados também ficam invisíveis
    if (note.notebookId) {
      const nb = state.notebooks.find((n) => n.id === note.notebookId);
      if (nb?.isLocked && !unlockedIds.has(nb.id)) return false;
    }
    return true;
  });
  const commentSearchMatches = (() => {
    const query = state.viewMode === 'search' ? state.searchQuery.trim().toLowerCase() : '';
    if (!query) return {} as Record<string, { threadId: string; text: string }[]>;

    return state.notes.reduce<Record<string, { threadId: string; text: string }[]>>((matchesByNote, note) => {
      const matches = (note.commentThreads || []).flatMap((thread) => {
        const text = [thread.selectedText, ...thread.messages.map((message) => message.content)]
          .filter(Boolean)
          .join(' ');
        return text.toLowerCase().includes(query) ? [{ threadId: thread.id, text }] : [];
      });
      if (matches.length) matchesByNote[note.id] = matches;
      return matchesByNote;
    }, {});
  })();

  useEffect(() => {
    if (!state.selectedNoteId) return;
    setOpenNoteIds((openIds) => openIds.includes(state.selectedNoteId!) ? openIds : [...openIds, state.selectedNoteId!]);
  }, [state.selectedNoteId]);

  const handleCreateNote = useCallback(() => {
    persistFn((s) => {
      const notebookId = s.settings.newNoteLocation === 'current-notebook' && s.viewMode === 'notebook'
        ? s.activeNotebookId
        : null;
      const note = createNote(notebookId);
      return {
        ...s,
        notes: [note, ...s.notes],
        selectedNoteId: note.id,
        viewMode: s.viewMode === 'dashboard' ? 'all' : s.viewMode,
      };
    });
  }, [persistFn]);

  const handleCreateNoteFromTemplate = useCallback((template: { title: string; content: string }) => {
    persistFn((s) => {
      const notebookId = s.settings.newNoteLocation === 'current-notebook' && s.viewMode === 'notebook'
        ? s.activeNotebookId
        : null;
      const note = createNote(notebookId);
      note.title = template.title;
      note.content = template.content;
      return {
        ...s,
        notes: [note, ...s.notes],
        selectedNoteId: note.id,
        viewMode: 'all' as ViewMode,
      };
    });
    setShowTemplates(false);
  }, [persistFn]);

  const handleQuickNoteSave = useCallback((title: string, content: string) => {
    persistFn((s) => {
      const note = createNote(null);
      note.title = title;
      note.content = content;
      return {
        ...s,
        notes: [note, ...s.notes],
      };
    });
  }, [persistFn]);

  const handleNoteLinkClick = useCallback((noteId: string) => {
    navigate((s) => ({ ...s, selectedNoteId: noteId, viewMode: 'all' }));
  }, [navigate]);

  const handleOpenGallery = useCallback(() => {
    setGalleryReturnView({ viewMode: state.viewMode, notebookId: state.activeNotebookId, noteId: state.selectedNoteId });
    navigate((s) => ({ ...s, viewMode: 'gallery' as ViewMode }));
  }, [navigate, state.viewMode, state.activeNotebookId, state.selectedNoteId]);

  const handleGalleryNavigateToNote = useCallback((noteId: string, notebookId: string | null) => {
    navigate((s) => ({
      ...s,
      viewMode: notebookId ? 'notebook' : 'all',
      activeNotebookId: notebookId,
      selectedNoteId: noteId,
    }));
  }, [navigate]);

  const handleGalleryBack = useCallback(() => {
    if (galleryReturnView) {
      navigate((s) => ({
        ...s,
        viewMode: galleryReturnView.viewMode,
        activeNotebookId: galleryReturnView.notebookId,
        selectedNoteId: galleryReturnView.noteId,
      }));
      setGalleryReturnView(null);
    } else {
      navigate((s) => ({ ...s, viewMode: 'all' }));
    }
  }, [navigate, galleryReturnView]);

  const handleSelectNote = useCallback((noteId: string) => {
    setFocusCommentId(null);
    navigate((s) => ({ ...s, selectedNoteId: noteId }));
  }, [navigate]);

  const handleSelectCommentSearchResult = useCallback((noteId: string, threadId: string) => {
    setFocusCommentId(threadId);
    navigate((s) => ({ ...s, viewMode: 'all', searchQuery: '', selectedNoteId: noteId }));
  }, [navigate]);

  const handleCloseNoteTab = useCallback((noteId: string) => {
    const closingIndex = openNoteIds.indexOf(noteId);
    const remainingTabs = openNoteIds.filter((id) => id !== noteId);
    setOpenNoteIds(remainingTabs);
    if (state.selectedNoteId === noteId) {
      const nextId = remainingTabs[closingIndex] || remainingTabs[closingIndex - 1] || null;
      setState((s) => ({ ...s, selectedNoteId: nextId }));
    }
  }, [openNoteIds, state.selectedNoteId]);

  const handleUpdateNote = useCallback((noteId: string, updates: Partial<Note>, options?: NoteUpdateOptions) => {
    // Skip version creation during reverts
    if (isRevertingRef.current) {
      persistFn((s) => ({
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
        ),
      }));
      return;
    }
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => {
          if (n.id !== noteId) return n;
          const latestVersion = n.history[n.history.length - 1];
          const needsProtectedSnapshot = options?.preservePreviousVersion
            && (!latestVersion || latestVersion.title !== n.title || latestVersion.content !== n.content);
          const history = needsProtectedSnapshot
            ? [...n.history, createVersion(n, undefined, undefined, 'Conteúdo estável removido')].slice(-MAX_NOTE_VERSIONS)
            : n.history;
          return { ...n, ...updates, history, updatedAt: now };
        }),
      };
    });
  }, [persistFn]);

  const handleSaveVersion = useCallback((noteId: string, prevContent?: string, prevTitle?: string) => {
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note || (!note.title && !note.content)) return s;
      const history = note.history || [];
      const latestVersion = history[history.length - 1];
      if (latestVersion && latestVersion.title === note.title && latestVersion.content === note.content) return s;
      const version = createVersion(note, prevContent, prevTitle);
      const nextHistory = [...history, version].slice(-MAX_NOTE_VERSIONS);
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, history: nextHistory } : n
        ),
      };
    });
  }, [persistFn]);

  const handleRevertVersion = useCallback((noteId: string, versionId: string) => {
    isRevertingRef.current = true;
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      const version = (note.history || []).find((v) => v.id === versionId);
      if (!version) return s;
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId
            ? {
                ...n,
                title: version.title,
                content: version.content,
                lineStability: createLineStability(version.content),
                updatedAt: new Date().toISOString(),
                // Don't create new history entries on revert
              }
            : n
        ),
      };
    });
    setTimeout(() => { isRevertingRef.current = false; }, 500);
  }, [persistFn]);

  const handleUndoRevert = useCallback((noteId: string, versionId: string) => {
    // Find the version AFTER the one we reverted to (which was the state before revert)
    // Actually: revert back to the state that was active before the revert
    // We'll use the last history entry as the "undo" state
    isRevertingRef.current = true;
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      const history = note.history || [];
      // The last entry is the most recent saved version (state before revert was applied)
      const lastVersion = history[history.length - 1];
      if (!lastVersion) return s;
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId
            ? {
                ...n,
                title: lastVersion.title,
                content: lastVersion.content,
                updatedAt: new Date().toISOString(),
              }
            : n
        ),
      };
    });
    setTimeout(() => { isRevertingRef.current = false; }, 500);
  }, [persistFn]);

  const handleDeleteNote = useCallback((noteId: string) => {
    setOpenNoteIds((openIds) => openIds.filter((id) => id !== noteId));
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      if (note.status === 'deleted') {
        return { ...s, notes: s.notes.filter((n) => n.id !== noteId), selectedNoteId: null };
      }
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, status: 'deleted' as const, updatedAt: new Date().toISOString() } : n
        ),
        selectedNoteId: null,
      };
    });
  }, [persistFn]);

  const handleDeleteMultipleNotes = useCallback((noteIds: string[]) => {
    setOpenNoteIds((openIds) => openIds.filter((id) => !noteIds.includes(id)));
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => {
          if (!noteIds.includes(n.id)) return n;
          if (n.status === 'deleted') return n; // já na lixeira, será excluída permanentemente abaixo
          return { ...n, status: 'deleted' as const, updatedAt: now };
        }).filter((n) => !(noteIds.includes(n.id) && n.status === 'deleted' && !noteIds.includes(n.id))),
        selectedNoteId: noteIds.includes(s.selectedNoteId || '') ? null : s.selectedNoteId,
      };
    });
  }, [persistFn]);

  const handleRestoreNote = useCallback((noteId: string) => {
    handleUpdateNote(noteId, { status: 'active' });
  }, [handleUpdateNote]);

  const handleToggleFavorite = useCallback((noteId: string) => {
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, isFavorite: !n.isFavorite, updatedAt: new Date().toISOString() } : n
        ),
      };
    });
  }, [persistFn]);

  const handleArchiveNote = useCallback((noteId: string) => {
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId
            ? { ...n, status: (n.status === 'archived' ? 'active' : 'archived') as any, updatedAt: new Date().toISOString() }
            : n
        ),
      };
    });
  }, [persistFn]);

  // Depois de atualizar, mostra uma vez o resumo das melhorias da nova versão.
  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    const resolveVersion = window.electronAPI?.getAppVersion
      ? window.electronAPI.getAppVersion()
      : Promise.resolve(RELEASE_NOTES[0]?.version || '');

    resolveVersion
      .then((installedVersion) => {
        if (cancelled || !installedVersion) return;
        const seen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
        if (seen === installedVersion) return;

        // Grava agora para não reabrir se o app for recarregado logo em seguida.
        localStorage.setItem(LAST_SEEN_VERSION_KEY, installedVersion);

        // Instalação nova (sem notas e sem registro anterior) não recebe o
        // resumo: ele existe para quem acabou de receber uma atualização.
        if (!seen && stateRef.current.notes.length === 0) return;

        setHasUnseenWhatsNew(true);
        setShowWhatsNew(true);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [isLoading]);

  const handleCloseWhatsNew = useCallback(() => {
    setShowWhatsNew(false);
    setHasUnseenWhatsNew(false);
  }, []);

  const handleSetView = useCallback((viewMode: ViewMode, notebookId?: string, tagId?: string) => {
    navigate((s) => ({
      ...s,
      viewMode,
      activeNotebookId: notebookId || null,
      activeTagId: tagId || null,
      selectedNoteId: viewMode === 'all' ? s.selectedNoteId : null,
    }));
  }, [navigate]);

  const handleUpdateSettings = useCallback((updates: Partial<import('./types').AppSettings>) => {
    persistFn((s) => ({ ...s, settings: { ...s.settings, ...updates } }));
  }, [persistFn]);

  const handleRestoreBackup = useCallback((data: import('./backup').BackupRestoreData) => {
    if (data.floatingToolbarItems) {
      try {
        localStorage.setItem('notes-app-floating-toolbar-items', JSON.stringify(data.floatingToolbarItems));
        window.dispatchEvent(new CustomEvent('notes-app-floating-toolbar-items-restored', { detail: data.floatingToolbarItems }));
      } catch (error) {
        console.error('Não foi possível restaurar a barra flutuante:', error);
      }
    }

    persistFn((s) => ({
      ...s,
      notes: data.notes || s.notes,
      notebooks: data.notebooks || s.notebooks,
      tags: data.tags || s.tags,
      // As marcações de imagem também voltam do backup, junto das notas.
      imageTags: data.imageTags || s.imageTags,
      tasks: data.tasks || s.tasks,
      settings: data.settings || s.settings,
      dashboard: data.dashboard || s.dashboard,
      selectedNoteId: data.selectedNoteId ?? null,
      viewMode: data.viewMode ?? 'dashboard',
      activeNotebookId: data.activeNotebookId ?? null,
      activeTagId: data.activeTagId ?? null,
      searchQuery: data.searchQuery ?? '',
      sidebarCollapsed: data.sidebarCollapsed ?? false,
    }));
  }, [persistFn]);

  const handleImportNotes = useCallback((importedNotes: import('./backup').ImportedNote[]) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      const genId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      let notebooks = [...s.notebooks];
      let tags = [...s.tags];
      const newNotes: Note[] = [];

      for (const imported of importedNotes) {
        // Resolve notebook
        let notebookId: string | null = null;
        if (imported.notebook) {
          let nb = notebooks.find((n) => n.name.toLowerCase() === imported.notebook!.toLowerCase());
          if (!nb) {
            nb = { id: genId(), name: imported.notebook, createdAt: now, order: notebooks.length, icon: '📓', parentId: null, isLocked: false, lockPasswordHash: '', lockHint: '' };
            notebooks = [...notebooks, nb];
          }
          notebookId = nb.id;
        }

        // Resolve tags
        const tagIds: string[] = [];
        for (const tagName of imported.tags) {
          let tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
          if (!tag) {
            tag = { id: genId(), name: tagName, color: '#3b82f6' };
            tags = [...tags, tag];
          }
          tagIds.push(tag.id);
        }

        newNotes.push({
          id: genId(),
          title: imported.title,
          content: imported.content,
          createdAt: imported.createdAt,
          updatedAt: imported.updatedAt,
          deletedAt: null,
          status: 'active',
          isFavorite: imported.isFavorite,
          notebookId,
          tags: tagIds,
          history: [],
          lineStability: [],
          bookmarks: [],
          commentThreads: [],
          audioClips: [],
          isLocked: false,
          lockPasswordHash: '',
          lockHint: '',
        });
      }

      const newState = {
        ...s,
        notes: [...newNotes, ...s.notes],
        notebooks,
        tags,
      };
      // Grava imediatamente no IndexedDB para não perder na recarga
      saveStateAsync(newState).catch((e) => {
        console.error('Falha ao gravar a importação:', e);
        alert('Não foi possível salvar a importação. Verifique o espaço disponível em disco.');
      });
      return newState;
    });
  }, [persistFn]);

  const handleUpdateDashboard = useCallback((updates: Partial<DashboardData>) => {
    persistFn((s) => ({ ...s, dashboard: { ...s.dashboard, ...updates } }));
  }, [persistFn]);

  const handleSearch = useCallback((query: string) => {
    navigate((s) => ({
      ...s,
      searchQuery: query,
      viewMode: query ? 'search' : 'all',
      selectedNoteId: null,
    }));
  }, [navigate]);

  const handleCreateNotebook = useCallback((name: string) => {
    persistFn((s) => {
      const nb = createNotebook(name, s.notebooks.length);
      return { ...s, notebooks: [...s.notebooks, nb] };
    });
  }, [persistFn]);

  const handleRenameNotebook = useCallback((id: string, name: string) => {
    persistFn((s) => ({
      ...s,
      notebooks: s.notebooks.map((nb) => (nb.id === id ? { ...nb, name } : nb)),
    }));
  }, [persistFn]);

  const handleDeleteNotebook = useCallback((id: string) => {
    persistFn((s) => ({
      ...s,
      notebooks: s.notebooks.filter((nb) => nb.id !== id),
      notes: s.notes.map((n) => (n.notebookId === id ? { ...n, notebookId: null } : n)),
    }));
  }, [persistFn]);

  // ===== Bloqueio de notas e cadernos =====
  const handleLockNote = useCallback((noteId: string) => {
    const note = stateRef.current.notes.find((n) => n.id === noteId);
    if (!note) return;
    if (note.isLocked) {
      // Já bloqueada: pede senha para desbloquear
      setLockModal({ mode: 'unlock', targetId: noteId, targetType: 'note', hint: note.lockHint || undefined });
    } else {
      setLockModal({ mode: 'create', targetId: noteId, targetType: 'note' });
    }
  }, []);

  const handleLockNotebook = useCallback((notebookId: string) => {
    const nb = stateRef.current.notebooks.find((n) => n.id === notebookId);
    if (!nb) return;
    if (nb.isLocked) {
      setLockModal({ mode: 'unlock', targetId: notebookId, targetType: 'notebook', hint: nb.lockHint || undefined });
    } else {
      setLockModal({ mode: 'create', targetId: notebookId, targetType: 'notebook' });
    }
  }, []);

  const handleLockSubmit = useCallback(async (password: string, hint?: string) => {
    if (!lockModal) return;
    const { mode, targetId, targetType } = lockModal;

    if (mode === 'create') {
      const hash = await hashPassword(password);
      if (targetType === 'note') {
        persistFn((s) => ({
          ...s,
          notes: s.notes.map((n) => n.id === targetId ? { ...n, isLocked: true, lockPasswordHash: hash, lockHint: hint || '' } : n),
        }));
      } else {
        persistFn((s) => ({
          ...s,
          notebooks: s.notebooks.map((nb) => nb.id === targetId ? { ...nb, isLocked: true, lockPasswordHash: hash, lockHint: hint || '' } : nb),
        }));
      }
      setLockModal(null);
      setLockError('');
    } else {
      // Desbloquear na sessão
      const item = targetType === 'note'
        ? stateRef.current.notes.find((n) => n.id === targetId)
        : stateRef.current.notebooks.find((nb) => nb.id === targetId);
      if (!item || !item.lockPasswordHash) return;

      const isValid = await verifyPassword(password, item.lockPasswordHash);
      if (!isValid) {
        setLockError('Senha incorreta.');
        return;
      }
      setUnlockedIds((prev) => new Set([...prev, targetId]));
      setLockModal(null);
      setLockError('');
    }
  }, [lockModal, persistFn]);

  const handleRemoveLock = useCallback((targetId: string, targetType: 'note' | 'notebook') => {
    if (targetType === 'note') {
      persistFn((s) => ({
        ...s,
        notes: s.notes.map((n) => n.id === targetId ? { ...n, isLocked: false, lockPasswordHash: '', lockHint: '' } : n),
      }));
    } else {
      persistFn((s) => ({
        ...s,
        notebooks: s.notebooks.map((nb) => nb.id === targetId ? { ...nb, isLocked: false, lockPasswordHash: '', lockHint: '' } : nb),
      }));
    }
    setUnlockedIds((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
  }, [persistFn]);

  const handleCreateTag = useCallback((name: string) => {
    persistFn((s) => {
      const colors = ['#4f8cff', '#3dd68c', '#ffb84d', '#ff4d6a', '#a78bfa', '#f472b6'];
      const color = colors[s.tags.length % colors.length];
      const tag = createTag(name, color);
      return { ...s, tags: [...s.tags, tag] };
    });
  }, [persistFn]);

  const handleDeleteTag = useCallback((id: string) => {
    persistFn((s) => ({
      ...s,
      tags: s.tags.filter((t) => t.id !== id),
      notes: s.notes.map((n) => ({ ...n, tags: n.tags.filter((t) => t !== id) })),
    }));
  }, [persistFn]);

  const handleToggleTag = useCallback((noteId: string, tagId: string) => {
    persistFn((s) => {
      const note = s.notes.find((n) => n.id === noteId);
      if (!note) return s;
      const tags = note.tags.includes(tagId)
        ? note.tags.filter((t) => t !== tagId)
        : [...note.tags, tagId];
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, tags, updatedAt: new Date().toISOString() } : n
        ),
      };
    });
  }, [persistFn]);

  const handleMoveNote = useCallback((noteId: string, notebookId: string | null) => {
    handleUpdateNote(noteId, { notebookId });
  }, [handleUpdateNote]);

  const handleToggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }, []);

  const handleAddBookmark = useCallback((noteId: string, bookmarkId: string, text: string, position: number) => {
    persistFn((s) => {
      const bm: import('./types').Bookmark = {
        id: bookmarkId,
        text,
        position,
        createdAt: new Date().toISOString(),
      };
      return {
        ...s,
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, bookmarks: [...(n.bookmarks || []), bm] } : n
        ),
      };
    });
  }, [persistFn]);

  const handleRemoveBookmark = useCallback((noteId: string, bookmarkId: string) => {
    persistFn((s) => ({
      ...s,
      notes: s.notes.map((n) =>
        n.id === noteId ? { ...n, bookmarks: (n.bookmarks || []).filter((b) => b.id !== bookmarkId) } : n
      ),
    }));
  }, [persistFn]);

  const handleCreateCommentThread = useCallback((noteId: string, thread: CommentThread, html: string) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      const commentThread: CommentThread = {
        ...thread,
        selectedText: thread.selectedText || '',
        color: thread.color || '#60a5fa',
        messages: thread.messages || [],
        createdAt: thread.createdAt || now,
        updatedAt: thread.updatedAt || now,
        resolved: thread.resolved === true,
        resolvedAt: thread.resolvedAt ?? null,
      };
      return {
        ...s,
        notes: s.notes.map((n) => n.id === noteId
          ? {
              ...n,
              content: html,
              commentThreads: (n.commentThreads || []).some((existing) => existing.id === commentThread.id)
                ? n.commentThreads
                : [...(n.commentThreads || []), commentThread],
              updatedAt: now,
            }
          : n),
      };
    });
    setFocusCommentId(thread.id);
  }, [persistFn]);

  const handleAddCommentReply = useCallback((noteId: string, threadId: string, message: CommentMessage) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => n.id === noteId
          ? {
              ...n,
              updatedAt: now,
              commentThreads: (n.commentThreads || []).map((thread) => thread.id === threadId
                ? {
                    ...thread,
                    messages: thread.messages.some((existing) => existing.id === message.id)
                      ? thread.messages
                      : [...thread.messages, message],
                    updatedAt: now,
                  }
                : thread),
            }
          : n),
      };
    });
  }, [persistFn]);

  const handleDeleteCommentThread = useCallback((noteId: string, threadId: string, html: string) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => n.id === noteId
          ? {
              ...n,
              content: html,
              updatedAt: now,
              commentThreads: (n.commentThreads || []).filter((thread) => thread.id !== threadId),
            }
          : n),
      };
    });
  }, [persistFn]);

  const handleUpdateCommentThreadColor = useCallback((noteId: string, threadId: string, color: string, html: string) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => n.id === noteId
          ? {
              ...n,
              content: html,
              updatedAt: now,
              commentThreads: (n.commentThreads || []).map((thread) => thread.id === threadId
                ? { ...thread, color, updatedAt: now }
                : thread),
            }
          : n),
      };
    });
  }, [persistFn]);

  const handleSetCommentThreadResolved = useCallback((noteId: string, threadId: string, resolved: boolean) => {
    persistFn((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        notes: s.notes.map((n) => n.id === noteId
          ? {
              ...n,
              updatedAt: now,
              commentThreads: (n.commentThreads || []).map((thread) => thread.id === threadId
                ? { ...thread, resolved, resolvedAt: resolved ? now : null, updatedAt: now }
                : thread),
            }
          : n),
      };
    });
  }, [persistFn]);

  const handleResolveCommentThread = useCallback((noteId: string, threadId: string) => {
    handleSetCommentThreadResolved(noteId, threadId, true);
  }, [handleSetCommentThreadResolved]);

  const handleReopenCommentThread = useCallback((noteId: string, threadId: string) => {
    handleSetCommentThreadResolved(noteId, threadId, false);
  }, [handleSetCommentThreadResolved]);

  // Tasks handlers
  const handleCreateTask = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'status' | 'reminderFired' | 'calendarId' | 'calendarEventId' | 'calendarEtag' | 'calendarLastSyncedAt' | 'calendarRemoteDeletedAt' | 'calendarSyncState'>) => {
    persistFn((s) => {
      const task: Task = {
        ...taskData,
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        reminderFired: false,
        calendarId: null,
        calendarEventId: null,
        calendarEtag: null,
        calendarLastSyncedAt: null,
        calendarRemoteDeletedAt: null,
        calendarSyncState: 'idle',
      };
      return { ...s, tasks: [task, ...(s.tasks || [])] };
    });
  }, [persistFn]);

  const handleUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    persistFn((s) => ({
      ...s,
      tasks: (s.tasks || []).map((t) => t.id === id
        ? { ...t, ...updates, updatedAt: new Date().toISOString(), calendarRemoteDeletedAt: null, calendarSyncState: 'idle' }
        : t),
    }));
  }, [persistFn]);

  const handleDeleteTask = useCallback((id: string) => {
    const task = stateRef.current.tasks.find((candidate) => candidate.id === id);
    if (task?.calendarEventId && window.electronAPI?.googleCalendarDeleteEvent) {
      window.electronAPI.googleCalendarDeleteEvent(task.calendarId || stateRef.current.settings.googleCalendarId, task.calendarEventId, task.calendarEtag)
        .catch((error) => console.error('Não foi possível remover o evento do Google Calendar:', error));
    }
    persistFn((s) => ({
      ...s,
      tasks: (s.tasks || []).filter((t) => t.id !== id),
    }));
  }, [persistFn]);

  const handleToggleTask = useCallback((id: string) => {
    persistFn((s) => {
      const tasks = [...(s.tasks || [])];
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) return s;
      const t = tasks[idx];

      if (t.status === 'pending') {
        tasks[idx] = { ...t, status: 'completed' as const, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), calendarRemoteDeletedAt: null, calendarSyncState: 'idle' };

        // If recurrent, create next occurrence
        if (t.recurrence && t.recurrence !== 'none' && t.dueDate) {
          const nextDate = getNextRecurrenceDate(t.dueDate, t.recurrence, t.recurrenceInterval || 1);
          const newTask: Task = {
            ...t,
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
            status: 'pending',
            dueDate: nextDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
            reminderFired: false,
            calendarId: null,
            calendarEventId: null,
            calendarEtag: null,
            calendarLastSyncedAt: null,
            calendarRemoteDeletedAt: null,
            calendarSyncState: 'idle',
          };
          tasks.unshift(newTask);
        }
      } else {
        tasks[idx] = { ...t, status: 'pending' as const, completedAt: null, reminderFired: false, updatedAt: new Date().toISOString(), calendarRemoteDeletedAt: null, calendarSyncState: 'idle' };
      }

      return { ...s, tasks };
    });
  }, [persistFn]);

  interface InlineTaskData {
    title: string;
    dueDate: string | null;
    dueTime: string | null;
    reminderMinutes: number | null;
    reminderSound: string;
    recurrence: import('./types').RecurrenceType;
    recurrenceInterval: number;
  }

  const handleCreateTaskInNote = useCallback((data: InlineTaskData) => {
    persistFn((s) => {
      const taskId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      const task: Task = {
        title: data.title,
        description: '',
        descriptionAlignment: 'left',
        dueDate: data.dueDate,
        dueTime: data.dueTime,
        priority: 'medium',
        noteId: s.selectedNoteId,
        id: taskId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        reminderMinutes: data.reminderMinutes,
        reminderSound: data.reminderSound,
        reminderFired: false,
        calendarSyncEnabled: s.settings.googleCalendarSyncNewTasks,
        calendarId: null,
        calendarEventId: null,
        calendarEtag: null,
        calendarLastSyncedAt: null,
        calendarRemoteDeletedAt: null,
        calendarSyncState: 'idle',
        recurrence: data.recurrence,
        recurrenceInterval: data.recurrenceInterval,
      };

      return { ...s, tasks: [task, ...(s.tasks || [])] };
    });
  }, [persistFn]);

  const handleDuplicateNote = useCallback((noteId: string) => {
    persistFn((s) => {
      const original = s.notes.find((n) => n.id === noteId);
      if (!original) return s;
      const dup = createNote(original.notebookId);
      dup.title = original.title + ' (cópia)';
      const copiedDocument = new DOMParser().parseFromString(original.content, 'text/html');
      copiedDocument.querySelectorAll('mark[data-comment-thread-id]').forEach((mark) => {
        mark.replaceWith(...Array.from(mark.childNodes));
      });
      dup.content = copiedDocument.body.innerHTML;
      dup.lineStability = createLineStability(dup.content);
      dup.commentThreads = [];
      dup.tags = [...original.tags];
      return {
        ...s,
        notes: [dup, ...s.notes],
        selectedNoteId: dup.id,
      };
    });
  }, [persistFn]);

  const handleReorderNotes = useCallback((orderedIds: string[]) => {
    persistFn((s) => {
      // Reorder notes based on the provided ID order
      const noteMap = new Map(s.notes.map(n => [n.id, n]));
      const reordered: Note[] = [];
      // First add reordered ones
      for (const id of orderedIds) {
        const note = noteMap.get(id);
        if (note) {
          reordered.push(note);
          noteMap.delete(id);
        }
      }
      // Add remaining notes not in the ordered list
      for (const note of noteMap.values()) {
        reordered.push(note);
      }
      return { ...s, notes: reordered };
    });
  }, [persistFn]);

  const handleExportNotes = useCallback((noteIds: string[], format: string) => {
    const notesToExport = state.notes.filter((n) => noteIds.includes(n.id));
    if (notesToExport.length === 0) return;

    notesToExport.forEach((note) => {
      let content = '';
      let filename = (note.title || 'sem-titulo').replace(/[^a-zA-Z0-9À-ú\s\-_]/g, '').trim().replace(/\s+/g, '_');
      let mimeType = 'text/plain';

      switch (format) {
        case 'txt': {
          // Properly formatted plain text
          content = formatNoteAsText(note);
          filename += '.txt';
          mimeType = 'text/plain';
          break;
        }
        case 'md': {
          content = formatNoteAsMarkdown(note);
          filename += '.md';
          mimeType = 'text/markdown';
          break;
        }
        case 'html': {
          content = formatNoteAsHtml(note);
          filename += '.html';
          mimeType = 'text/html';
          break;
        }
        case 'docx': {
          // Generate a simple DOCX (XML-based)
          const docxContent = generateDocx(note);
          downloadBlob(docxContent, filename + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          return;
        }
        case 'pdf': {
          // Generate PDF
          generateAndDownloadPdf(note, filename + '.pdf');
          return;
        }
        case 'json': {
          content = JSON.stringify({
            title: note.title,
            content: note.content,
            textContent: stripHtml(note.content),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            tags: note.tags,
          }, null, 2);
          filename += '.json';
          mimeType = 'application/json';
          break;
        }
      }

      downloadFile(content, filename, mimeType);
    });
  }, [state.notes]);

  const handleAISummary = useCallback((noteId: string) => {
    const note = state.notes.find((n) => n.id === noteId);
    if (!note) return;

    const text = stripHtml(note.content).trim();
    if (!text) {
      alert('A nota está vazia.');
      return;
    }

    const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const wordCount = text.split(/\s+/).length;
    const title = note.title || 'Sem título';
    const notebookName = note.notebookId
      ? state.notebooks.find(nb => nb.id === note.notebookId)?.name || ''
      : '';

    // Determine what the note is about (topic detection)
    // Use the title and first sentence to describe the topic
    const firstSentence = sentences[0]?.trim() || '';
    let topic = '';
    if (title && title !== 'Sem título') {
      topic = `Esta nota trata sobre "${title}"`;
      if (notebookName) topic += `, localizada no caderno "${notebookName}"`;
      topic += '.';
    } else {
      topic = `Esta nota aborda: ${firstSentence}`;
      if (notebookName) topic += ` (Caderno: ${notebookName})`;
    }

    // Generate explanatory summary
    let summary = '';
    if (sentences.length <= 2) {
      summary = text.length > 250 ? text.slice(0, 250) + '...' : text;
    } else {
      // Intro: first sentence. Body: longest sentence for detail. End: last sentence for closure.
      const intro = firstSentence;
      const rest = sentences.slice(1, -1);
      const sorted = [...rest].sort((a, b) => b.length - a.length);
      const detail = sorted[0]?.trim() || '';
      const conclusion = sentences[sentences.length - 1].trim();

      const parts = [intro];
      if (detail && detail !== intro && detail !== conclusion) parts.push(detail);
      if (conclusion && conclusion !== intro && conclusion !== detail) parts.push(conclusion);

      summary = parts.join(' ');
      if (summary.length > 350) summary = summary.slice(0, 350) + '...';
    }

    let result = `🔍 Sobre o que se trata:\n${topic}\n\n`;
    result += `📖 Resumo:\n${summary}\n\n`;
    result += `📊 Informações:\n`;
    result += `• ${wordCount} palavras em ${sentences.length} frases\n`;
    result += `• Criada em ${new Date(note.createdAt).toLocaleDateString('pt-BR')}\n`;
    result += `• Última edição em ${new Date(note.updatedAt).toLocaleDateString('pt-BR')}\n`;
    if ((note.bookmarks || []).length > 0) result += `• ${note.bookmarks.length} trecho(s) destacado(s)\n`;
    if (note.tags.length > 0) {
      const tagNames = note.tags.map(tid => state.tags.find(t => t.id === tid)?.name).filter(Boolean);
      result += `• Tags: ${tagNames.join(', ')}\n`;
    }

    alert(result);
  }, [state.notes, state.notebooks, state.tags]);

  const showDashboard = state.viewMode === 'dashboard';
  const showTasks = state.viewMode === 'tasks';
  const showSettings = state.viewMode === 'settings';
  const showGallery = state.viewMode === 'gallery';
  const showEditor = !!selectedNote && !showDashboard && !showTasks && !showSettings && !showGallery;
  const [initialTaskTab, setInitialTaskTab] = useState<string>('all');

  const handleViewOverdueTasks = useCallback(() => {
    setInitialTaskTab('overdue');
    navigate((s) => ({ ...s, viewMode: 'tasks', selectedNoteId: null }));
  }, [navigate]);

  const handleConvertQuickNote = useCallback((html: string, notebookId: string | null) => {
    persistFn((s) => {
      const note = createNote(notebookId);
      note.title = stripHtml(html).trim().slice(0, 50) || 'Anotação rápida';
      note.content = html || '<p></p>';
      note.lineStability = createLineStability(note.content);
      return {
        ...s,
        notes: [note, ...s.notes],
        selectedNoteId: note.id,
        viewMode: 'all' as ViewMode,
      };
    });
  }, [persistFn]);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
        <p>Carregando suas notas...</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <UpdateNotifier />
      <SyncStatus status={syncStatus} onRetry={() => syncClientRef.current?.retry()} />
      {showQuickNote && state.settings.quickNoteEnabled && (
        <QuickNote onSave={handleQuickNoteSave} onClose={() => setShowQuickNote(false)} />
      )}
      {showTemplates && state.settings.templatesEnabled && (
        <NoteTemplates onSelect={handleCreateNoteFromTemplate} onClose={() => setShowTemplates(false)} />
      )}
      {showWhatsNew && <WhatsNew onClose={handleCloseWhatsNew} />}
      {lockModal && (
        <PasswordModal
          mode={lockModal.mode}
          hint={lockModal.hint}
          title={lockModal.mode === 'create'
            ? `Bloquear ${lockModal.targetType === 'note' ? 'nota' : 'caderno'}`
            : `Desbloquear ${lockModal.targetType === 'note' ? 'nota' : 'caderno'}`}
          onSubmit={handleLockSubmit}
          onCancel={() => { setLockModal(null); setLockError(''); }}
          error={lockError}
        />
      )}
      {showAISearch && (
        <AISearch
          notes={state.notes.filter((n) => n.status === 'active' && (!n.isLocked || unlockedIds.has(n.id)))}
          onSelectNote={handleSelectNote}
          onClose={() => setShowAISearch(false)}
        />
      )}
      <Sidebar
        state={state}
        onSetView={handleSetView}
        onSearch={handleSearch}
        onCreateNote={handleCreateNote}
        onCreateNotebook={handleCreateNotebook}
        onRenameNotebook={handleRenameNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        onToggleSidebar={handleToggleSidebar}
        onSelectNote={handleSelectNote}
        onNavigateBack={handleNavigateBack}
        onNavigateForward={handleNavigateForward}
        canNavigateBack={navigationControls.canGoBack}
        canNavigateForward={navigationControls.canGoForward}
        onDeleteNote={handleDeleteNote}
        onToggleFavorite={handleToggleFavorite}
        onDuplicateNote={handleDuplicateNote}
        onMoveNote={handleMoveNote}
        dragDropEnabled={state.settings.dragDropEnabled}
        onOpenWhatsNew={() => setShowWhatsNew(true)}
        hasUnseenWhatsNew={hasUnseenWhatsNew}
        onLockNotebook={handleLockNotebook}
        unlockedIds={unlockedIds}
        onOpenAISearch={() => setShowAISearch(true)}
      />
      {showDashboard ? (
        <Dashboard
          state={state}
          dashboard={state.dashboard}
          onUpdateDashboard={handleUpdateDashboard}
          onCreateNote={handleCreateNote}
          onSelectNote={handleSelectNote}
          onSetView={handleSetView}
          onViewOverdueTasks={handleViewOverdueTasks}
          onConvertQuickNote={handleConvertQuickNote}
        />
      ) : showTasks ? (
        <Tasks
          tasks={state.tasks || []}
          notes={state.notes}
          notebooks={state.notebooks}
          defaultCalendarSyncEnabled={state.settings.googleCalendarSyncNewTasks}
          onCreateTask={handleCreateTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onToggleTask={handleToggleTask}
          initialTab={initialTaskTab}
          onSelectNote={(id) => navigate((s) => ({ ...s, viewMode: 'all', selectedNoteId: id }))}
        />
      ) : showSettings ? (
        <Settings
          settings={state.settings}
          onUpdateSettings={handleUpdateSettings}
          appState={state}
          onRestoreBackup={handleRestoreBackup}
          onImportNotes={handleImportNotes}
          onSyncCalendar={syncGoogleCalendar}
        />
      ) : showGallery ? (
        <Gallery
          notes={state.notes}
          notebooks={state.notebooks}
          onNavigateToNote={handleGalleryNavigateToNote}
          onBack={handleGalleryBack}
          returnLabel={galleryReturnView ? 'Voltar para galeria' : undefined}
        />
      ) : (
        <>
          <NoteList
            notes={filteredNotes}
            selectedNoteId={state.selectedNoteId}
            viewMode={state.viewMode}
            tags={state.tags}
            searchQuery={state.searchQuery}
            searchPreviewEnabled={state.settings.searchPreviewEnabled}
            allNotes={state.notes}
            onSearch={handleSearch}
            onSelectNote={handleSelectNote}
            onToggleFavorite={handleToggleFavorite}
            onDuplicateNote={handleDuplicateNote}
            onExportNotes={handleExportNotes}
            onAISummary={handleAISummary}
            onReorderNotes={handleReorderNotes}
            onDeleteNotes={handleDeleteMultipleNotes}
            commentSearchMatches={commentSearchMatches}
            onSelectComment={handleSelectCommentSearchResult}
          />
          {showEditor ? (
            <div className="editor-with-tabs">
              <div className="note-tabs" role="tablist" aria-label="Notas abertas">
                {openNotes.map((openNote) => (
                  <button
                    key={openNote.id}
                    role="tab"
                    aria-selected={openNote.id === selectedNote.id}
                    className={`note-tab ${openNote.id === selectedNote.id ? 'active' : ''}`}
                    onClick={() => handleSelectNote(openNote.id)}
                    title={openNote.title || 'Sem título'}
                  >
                    <span>{openNote.title || 'Sem título'}</span>
                    <span className="note-tab-close" role="button" aria-label={`Fechar ${openNote.title || 'nota'}`} onClick={(event) => { event.stopPropagation(); handleCloseNoteTab(openNote.id); }}>×</span>
                  </button>
                ))}
                <button className="note-tab-add" onClick={handleCreateNote} title="Criar nova nota" aria-label="Criar nova nota">+</button>
              </div>
            <Editor
              note={selectedNote}
              tags={state.tags}
              notebooks={state.notebooks}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onRestoreNote={handleRestoreNote}
              onToggleFavorite={handleToggleFavorite}
              onArchiveNote={handleArchiveNote}
              onToggleTag={handleToggleTag}
              onMoveNote={handleMoveNote}
              onSaveVersion={handleSaveVersion}
              onRevertVersion={handleRevertVersion}
              onAddBookmark={handleAddBookmark}
              onRemoveBookmark={handleRemoveBookmark}
              onCreateTaskInNote={handleCreateTaskInNote}
              commentThreads={selectedNote.commentThreads}
              onCreateCommentThread={handleCreateCommentThread}
              onAddCommentReply={handleAddCommentReply}
              onDeleteCommentThread={handleDeleteCommentThread}
              onUpdateCommentThreadColor={handleUpdateCommentThreadColor}
              onResolveCommentThread={handleResolveCommentThread}
              onReopenCommentThread={handleReopenCommentThread}
              focusCommentId={focusCommentId}
              allNotes={state.notes}
              onNoteLinkClick={handleNoteLinkClick}
              noteLinksEnabled={state.settings.noteLinksEnabled}
            />
            {state.settings.wordCountEnabled && selectedNote && (
              <WordCount content={selectedNote.content} />
            )}
            {state.settings.autoSummaryEnabled && selectedNote && (
              <NoteSummary content={selectedNote.content} />
            )}
            </div>
          ) : (
            <div className="editor-panel">
              <div className="empty-state">
                <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <h3>Selecione uma nota</h3>
                <p>Escolha uma nota na lista ou crie uma nova</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
