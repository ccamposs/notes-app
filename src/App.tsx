import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, CommentMessage, CommentThread, DashboardData, Note, Task, ViewMode } from './types';
import { loadState, saveState, createNote, createNotebook, createTag, createVersion, createLineStability, filterNotes, stripHtml, MAX_NOTE_VERSIONS } from './store';
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
  const [state, setState] = useState<AppState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const navigationStackRef = useRef<NavigationEntry[]>([navigationEntry(state)]);
  const navigationIndexRef = useRef(0);
  const [navigationControls, setNavigationControls] = useState({ canGoBack: false, canGoForward: false });
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRevertingRef = useRef(false);

  const persistState = useCallback((newState: AppState) => {
    setState(newState);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveState(newState), 300);
  }, []);

  // Functional persist that uses latest state
  const persistFn = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const newState = updater(prev);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => saveState(newState), 300);
      return newState;
    });
  }, []);

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

  const selectedNote = state.notes.find((n) => n.id === state.selectedNoteId) || null;
  const openNotes = openNoteIds
    .map((id) => state.notes.find((note) => note.id === id && note.status !== 'deleted'))
    .filter((note): note is Note => Boolean(note));
  const filteredNotes = filterNotes(state.notes, state);
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
  const handleCreateTask = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'completedAt' | 'status' | 'reminderFired'>) => {
    persistFn((s) => {
      const task: Task = {
        ...taskData,
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        reminderFired: false,
      };
      return { ...s, tasks: [task, ...(s.tasks || [])] };
    });
  }, [persistFn]);

  const handleUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    persistFn((s) => ({
      ...s,
      tasks: (s.tasks || []).map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
  }, [persistFn]);

  const handleDeleteTask = useCallback((id: string) => {
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
        tasks[idx] = { ...t, status: 'completed' as const, completedAt: new Date().toISOString() };

        // If recurrent, create next occurrence
        if (t.recurrence && t.recurrence !== 'none' && t.dueDate) {
          const nextDate = getNextRecurrenceDate(t.dueDate, t.recurrence, t.recurrenceInterval || 1);
          const newTask: Task = {
            ...t,
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
            status: 'pending',
            dueDate: nextDate,
            createdAt: new Date().toISOString(),
            completedAt: null,
            reminderFired: false,
          };
          tasks.unshift(newTask);
        }
      } else {
        tasks[idx] = { ...t, status: 'pending' as const, completedAt: null };
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
        completedAt: null,
        reminderMinutes: data.reminderMinutes,
        reminderSound: data.reminderSound,
        reminderFired: false,
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
  const showEditor = !!selectedNote && !showDashboard && !showTasks && !showSettings;
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

  return (
    <div className="app-layout">
      <UpdateNotifier />
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
          onCreateTask={handleCreateTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onToggleTask={handleToggleTask}
          initialTab={initialTaskTab}
          onSelectNote={(id) => navigate((s) => ({ ...s, viewMode: 'all', selectedNoteId: id }))}
        />
      ) : showSettings ? (
        <Settings settings={state.settings} onUpdateSettings={handleUpdateSettings} />
      ) : (
        <>
          <NoteList
            notes={filteredNotes}
            selectedNoteId={state.selectedNoteId}
            viewMode={state.viewMode}
            tags={state.tags}
            onSelectNote={handleSelectNote}
            onToggleFavorite={handleToggleFavorite}
            onDuplicateNote={handleDuplicateNote}
            onExportNotes={handleExportNotes}
            onAISummary={handleAISummary}
            onReorderNotes={handleReorderNotes}
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
            />
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
