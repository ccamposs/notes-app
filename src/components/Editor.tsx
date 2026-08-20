import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { CollapsibleNode } from '../extensions/CollapsibleNode';
import { BookmarkMark } from '../extensions/BookmarkMark';
import { CommentMark } from '../extensions/CommentMark';
import { Note, Tag, Notebook, Bookmark, CommentMessage, CommentThread, NoteVersion, StableLine } from '../types';
import { reconcileLineStability } from '../store';
import {
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  MoreHorizontal,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link as LinkIcon,
  Undo,
  Redo,
  Star,
  Archive,
  Trash2,
  RotateCcw,
  Check,
  X,
  Palette,
  ChevronsDownUp,
  History,
  Clock,
  BookmarkPlus,
  Bookmark as BookmarkIcon,
  ListTodo,
  Circle,
  Calendar,
  Bell,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MessageSquare,
  Send,
  ChevronRight,
} from 'lucide-react';

interface Props {
  note: Note;
  tags: Tag[];
  notebooks: Notebook[];
  onUpdateNote: (id: string, updates: Partial<Note>, options?: { preservePreviousVersion?: boolean }) => void;
  onDeleteNote: (id: string) => void;
  onRestoreNote: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onArchiveNote: (id: string) => void;
  onToggleTag: (noteId: string, tagId: string) => void;
  onMoveNote: (noteId: string, notebookId: string | null) => void;
  onSaveVersion: (noteId: string, prevContent?: string, prevTitle?: string) => void;
  onRevertVersion: (noteId: string, versionId: string) => void;
  onAddBookmark: (noteId: string, bookmarkId: string, text: string, position: number) => void;
  onRemoveBookmark: (noteId: string, bookmarkId: string) => void;
  onCreateTaskInNote: (data: { title: string; dueDate: string | null; dueTime: string | null; reminderMinutes: number | null; reminderSound: string; recurrence: import('../types').RecurrenceType; recurrenceInterval: number }) => void;
  commentThreads: CommentThread[];
  onCreateCommentThread: (noteId: string, thread: CommentThread, html: string) => void;
  onAddCommentReply: (noteId: string, threadId: string, message: CommentMessage) => void;
  onDeleteCommentThread: (noteId: string, threadId: string, html: string) => void;
  onUpdateCommentThreadColor: (noteId: string, threadId: string, color: string, html: string) => void;
  onResolveCommentThread: (noteId: string, threadId: string) => void;
  onReopenCommentThread: (noteId: string, threadId: string) => void;
  focusCommentId: string | null;
}

const TEXT_COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Cinza', value: '#6b7280' },
  { label: 'Branco', value: '#ffffff' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Sem destaque', value: '' },
  { label: 'Amarelo', value: '#fef08a' },
  { label: 'Verde', value: '#bbf7d0' },
  { label: 'Azul', value: '#bfdbfe' },
  { label: 'Rosa', value: '#fbcfe8' },
  { label: 'Roxo', value: '#e9d5ff' },
  { label: 'Laranja', value: '#fed7aa' },
];

const COMMENT_COLORS = ['#60a5fa', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type SideTab = 'none' | 'history' | 'bookmarks' | 'comments';
type FloatingToolbarItem = 'bold' | 'italic' | 'underline' | 'strike' | 'color' | 'textStyle' | 'lists' | 'quote' | 'link' | 'bookmark' | 'collapsible' | 'comment' | 'undo' | 'redo' | 'task';
type FloatingToolbarMenu = 'color' | 'textStyle' | 'lists' | null;
type PendingCommentThread = CommentThread & { from: number; to: number };

const FLOATING_TOOLBAR_ITEMS: { id: FloatingToolbarItem; label: string }[] = [
  { id: 'bold', label: 'Negrito' },
  { id: 'italic', label: 'Itálico' },
  { id: 'underline', label: 'Sublinhado' },
  { id: 'strike', label: 'Tachado' },
  { id: 'color', label: 'Cores e destaque' },
  { id: 'textStyle', label: 'Parágrafo, títulos e alinhamento' },
  { id: 'lists', label: 'Listas' },
  { id: 'quote', label: 'Citação' },
  { id: 'link', label: 'Link' },
  { id: 'bookmark', label: 'Marcador' },
  { id: 'collapsible', label: 'Bloco colapsável' },
  { id: 'comment', label: 'Comentário' },
  { id: 'undo', label: 'Desfazer' },
  { id: 'redo', label: 'Refazer' },
  { id: 'task', label: 'Criar tarefa na nota' },
];

const DEFAULT_FLOATING_TOOLBAR_ITEMS: FloatingToolbarItem[] = ['bold', 'italic', 'underline', 'strike', 'color', 'textStyle', 'lists', 'link', 'comment'];

type DiffSegment = { text: string; kind: 'same' | 'removed' | 'added' };
type DiffRow = { segments: DiffSegment[] }; 
type TimelineEntry = NoteVersion & { isCurrent?: boolean };
type HistorySession = { id: string; entries: TimelineEntry[] };

function getVersionLines(html: string): string[] {
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

const VERSION_INACTIVITY_MS = 5 * 60 * 1000;
const MIN_HISTORY_CHARACTER_CHANGES = 24;

function isHistoricallyRelevant(previousContent: string, currentContent: string, previousTitle: string, currentTitle: string): boolean {
  if (previousTitle !== currentTitle) return true;
  const previousText = getVersionLines(previousContent).join('\n');
  const currentText = getVersionLines(currentContent).join('\n');
  if (previousText === currentText) return false;
  if (!previousText.trim() && currentText.trim()) return true;

  let start = 0;
  while (start < previousText.length && start < currentText.length && previousText[start] === currentText[start]) start++;
  let previousEnd = previousText.length - 1;
  let currentEnd = currentText.length - 1;
  while (previousEnd >= start && currentEnd >= start && previousText[previousEnd] === currentText[currentEnd]) {
    previousEnd--;
    currentEnd--;
  }
  const changedCharacters = Math.max(0, previousEnd - start + 1) + Math.max(0, currentEnd - start + 1);
  return changedCharacters >= MIN_HISTORY_CHARACTER_CHANGES;
}

function buildInlineSegments(beforeText: string, afterText: string): { before: DiffSegment[]; after: DiffSegment[] } {
  const before = Array.from(beforeText);
  const after = Array.from(afterText);
  const append = (segments: DiffSegment[], text: string, kind: DiffSegment['kind']) => {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === kind) previous.text += text;
    else segments.push({ text, kind });
  };
  if (before.length * after.length > 40000) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let beforeEnd = before.length - 1;
    let afterEnd = after.length - 1;
    while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) { beforeEnd--; afterEnd--; }
    const prefix = before.slice(0, start).join('');
    const suffix = before.slice(beforeEnd + 1).join('');
    return {
      before: ([{ text: prefix, kind: 'same' as const }, { text: before.slice(start, beforeEnd + 1).join(''), kind: 'removed' as const }, { text: suffix, kind: 'same' as const }] as DiffSegment[]).filter((segment) => segment.text),
      after: ([{ text: prefix, kind: 'same' as const }, { text: after.slice(start, afterEnd + 1).join(''), kind: 'added' as const }, { text: suffix, kind: 'same' as const }] as DiffSegment[]).filter((segment) => segment.text),
    };
  }
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex--) for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex--) matrix[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex] ? matrix[beforeIndex + 1][afterIndex + 1] + 1 : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
  const beforeSegments: DiffSegment[] = [];
  const afterSegments: DiffSegment[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (beforeIndex < before.length && afterIndex < after.length && before[beforeIndex] === after[afterIndex]) {
      append(beforeSegments, before[beforeIndex], 'same'); append(afterSegments, after[afterIndex], 'same'); beforeIndex++; afterIndex++;
    } else if (afterIndex < after.length && (beforeIndex === before.length || matrix[beforeIndex][afterIndex + 1] >= matrix[beforeIndex + 1][afterIndex])) {
      append(afterSegments, after[afterIndex++], 'added');
    } else if (beforeIndex < before.length) {
      append(beforeSegments, before[beforeIndex++], 'removed');
    }
  }
  return { before: beforeSegments, after: afterSegments };
}

function buildVersionDiff(beforeHtml: string, afterHtml: string): { before: DiffRow[]; after: DiffRow[] } {
  const before = getVersionLines(beforeHtml);
  const after = getVersionLines(afterHtml);
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex--) for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex--) matrix[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex] ? matrix[beforeIndex + 1][afterIndex + 1] + 1 : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
  const beforeRows: DiffRow[] = [];
  const afterRows: DiffRow[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (beforeIndex < before.length && afterIndex < after.length && before[beforeIndex] === after[afterIndex]) {
      beforeRows.push({ segments: [{ text: before[beforeIndex++], kind: 'same' }] });
      afterRows.push({ segments: [{ text: after[afterIndex++], kind: 'same' }] });
    } else if (beforeIndex < before.length && afterIndex < after.length && matrix[beforeIndex][afterIndex + 1] === matrix[beforeIndex + 1][afterIndex]) {
      const inline = buildInlineSegments(before[beforeIndex++], after[afterIndex++]);
      beforeRows.push({ segments: inline.before });
      afterRows.push({ segments: inline.after });
    } else if (afterIndex < after.length && (beforeIndex === before.length || matrix[beforeIndex][afterIndex + 1] > matrix[beforeIndex + 1][afterIndex])) {
      afterRows.push({ segments: [{ text: after[afterIndex++], kind: 'added' }] });
    } else if (beforeIndex < before.length) {
      beforeRows.push({ segments: [{ text: before[beforeIndex++], kind: 'removed' }] });
    }
  }
  return { before: beforeRows, after: afterRows };
}

function changedTexts(rows: DiffRow[], kind: 'added' | 'removed', limit = 2): string[] {
  return rows.flatMap((row) => row.segments.filter((segment) => segment.kind === kind).map((segment) => segment.text.trim()).filter(Boolean)).slice(-limit);
}

function buildHistorySessions(entries: TimelineEntry[]): HistorySession[] {
  const sessionGap = VERSION_INACTIVITY_MS + 30 * 1000;
  return entries.reduce<HistorySession[]>((sessions, entry) => {
    const current = sessions[sessions.length - 1];
    const previousEntry = current?.entries[current.entries.length - 1];
    if (!current || new Date(entry.timestamp).getTime() - new Date(previousEntry.timestamp).getTime() > sessionGap) sessions.push({ id: `session-${entry.id}`, entries: [entry] });
    else current.entries.push(entry);
    return sessions;
  }, []);
}

export default function Editor({
  note,
  tags,
  notebooks,
  onUpdateNote,
  onDeleteNote,
  onRestoreNote,
  onToggleFavorite,
  onArchiveNote,
  onToggleTag,
  onMoveNote,
  onSaveVersion,
  onRevertVersion,
  onAddBookmark,
  onRemoveBookmark,
  onCreateTaskInNote,
  commentThreads,
  onCreateCommentThread,
  onAddCommentReply,
  onDeleteCommentThread,
  onUpdateCommentThreadColor,
  onResolveCommentThread,
  onReopenCommentThread,
  focusCommentId,
}: Props) {
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFloatingToolbarSettings, setShowFloatingToolbarSettings] = useState(false);
  const [floatingToolbarMenu, setFloatingToolbarMenu] = useState<FloatingToolbarMenu>(null);
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<string | null>(null);
  const [pendingCommentThread, setPendingCommentThread] = useState<PendingCommentThread | null>(null);
  const [commentPopoverPosition, setCommentPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(new Set());
  const [expandedVersionIds, setExpandedVersionIds] = useState<Set<string>>(new Set());
  const [commentAnchorError, setCommentAnchorError] = useState('');
  const [floatingToolbarItems, setFloatingToolbarItems] = useState<FloatingToolbarItem[]>(() => {
    try {
      const savedItems = JSON.parse(localStorage.getItem('notes-app-floating-toolbar-items') || '[]');
      if (Array.isArray(savedItems)) {
        const validItems = savedItems.filter((item): item is FloatingToolbarItem => FLOATING_TOOLBAR_ITEMS.some((option) => option.id === item));
        if (validItems.length) {
          return FLOATING_TOOLBAR_ITEMS
            .map((option) => option.id)
            .filter((id) => id === 'comment' || validItems.includes(id));
        }
      }
    } catch {
      // Usa a configuração padrão caso o navegador não tenha dados válidos.
    }
    return DEFAULT_FLOATING_TOOLBAR_ITEMS;
  });
  const [sideTab, setSideTab] = useState<SideTab>('none');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeVersionPane, setActiveVersionPane] = useState<'before' | 'after'>('after');
  const [versionFilterDay, setVersionFilterDay] = useState('');
  const [versionFilterMonth, setVersionFilterMonth] = useState('');
  const [versionFilterYear, setVersionFilterYear] = useState('');
  const [saved, setSaved] = useState(false);
  const [showInlineTask, setShowInlineTask] = useState(false);
  const [inlineTaskTitle, setInlineTaskTitle] = useState('');
  const [inlineTaskDueDate, setInlineTaskDueDate] = useState<string | null>(null);
  const [inlineTaskDueTime, setInlineTaskDueTime] = useState<string | null>(null);
  const [inlineTaskReminder, setInlineTaskReminder] = useState<number | null>(30);
  const [inlineTaskReminderEnabled, setInlineTaskReminderEnabled] = useState(true);
  const [inlineTaskRecurrence, setInlineTaskRecurrence] = useState<import('../types').RecurrenceType>('none');
  const [inlineTaskPosition, setInlineTaskPosition] = useState(0);
  const cursorPosRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const lastVersionContent = useRef<string>(note.content);
  const lastVersionTitle = useRef<string>(note.title);
  const previousContentRef = useRef<string>(note.content);
  const lineStabilityRef = useRef<StableLine[]>(note.lineStability);
  const currentTitleRef = useRef<string>(note.title);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const versionHistoryModalRef = useRef<HTMLElement>(null);
  const commentPopoverRef = useRef<HTMLElement>(null);
  const commentSaveGuard = useRef(false);
  const skipNextUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Comece a escrever...' }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph', 'blockquote'] }),
      Highlight.configure({ multicolor: true }),
      CollapsibleNode,
      BookmarkMark,
      CommentMark,
    ],
    content: note.content,
    onUpdate: ({ editor }) => {
      if (skipNextUpdate.current) {
        skipNextUpdate.current = false;
        return;
      }
      const html = editor.getHTML();
      const lineChange = reconcileLineStability(
        previousContentRef.current,
        html,
        lineStabilityRef.current,
      );
      previousContentRef.current = html;
      lineStabilityRef.current = lineChange.lineStability;
      onUpdateNote(
        note.id,
        { content: html, lineStability: lineChange.lineStability },
        lineChange.hasStableRemoval ? { preservePreviousVersion: true } : undefined,
      );
      showSavedIndicator();
      if (lineChange.hasStableRemoval) {
        if (versionTimer.current) clearTimeout(versionTimer.current);
        versionTimer.current = null;
        lastVersionContent.current = html;
        lastVersionTitle.current = currentTitleRef.current;
      } else {
        scheduleVersionSave();
      }
    },
  });

  useEffect(() => {
    if (versionTimer.current) clearTimeout(versionTimer.current);
    if (editor && note.content !== editor.getHTML()) {
      skipNextUpdate.current = true;
      editor.commands.setContent(note.content, false);
    }
    lastVersionContent.current = note.content;
    lastVersionTitle.current = note.title;
    previousContentRef.current = note.content;
    lineStabilityRef.current = note.lineStability;
    currentTitleRef.current = note.title;
  }, [note.id]);

  // Sincroniza restaurações e atualizações externas sem iniciar um novo ciclo de versões.
  useEffect(() => {
    if (editor && note.content !== editor.getHTML()) {
      skipNextUpdate.current = true;
      editor.commands.setContent(note.content, false);
    }
    previousContentRef.current = note.content;
    lineStabilityRef.current = note.lineStability;
  }, [note.content, note.lineStability]);

  const showSavedIndicator = useCallback(() => {
    setSaved(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 2000);
  }, []);

  const saveVersionIfChanged = useCallback((force = false) => {
    const currentContent = editor?.getHTML() ?? note.content;
    const currentTitle = currentTitleRef.current;
    const changed = currentContent !== lastVersionContent.current || currentTitle !== lastVersionTitle.current;
    if (!changed || (!currentTitle && !currentContent)) return false;
    if (!force && !isHistoricallyRelevant(lastVersionContent.current, currentContent, lastVersionTitle.current, currentTitle)) return false;
    onSaveVersion(note.id, lastVersionContent.current, lastVersionTitle.current);
    lastVersionContent.current = currentContent;
    lastVersionTitle.current = currentTitle;
    return true;
  }, [editor, note.id, note.content, onSaveVersion]);

  const scheduleVersionSave = useCallback(() => {
    if (versionTimer.current) clearTimeout(versionTimer.current);
    versionTimer.current = setTimeout(() => {
      versionTimer.current = null;
      saveVersionIfChanged();
    }, VERSION_INACTIVITY_MS);
  }, [saveVersionIfChanged]);

  useEffect(() => {
    return () => {
      if (versionTimer.current) clearTimeout(versionTimer.current);
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    currentTitleRef.current = e.target.value;
    onUpdateNote(note.id, { title: e.target.value });
    showSavedIndicator();
    scheduleVersionSave();
  };

  const addLink = () => {
    const url = prompt('URL do link:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertCollapse = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');

    if (selectedText) {
      editor.chain().focus().deleteSelection().run();
      (editor.commands as any).setCollapsible(selectedText);
    } else {
      (editor.commands as any).setCollapsible('Clique para expandir');
    }
  };

  const setTextColor = (color: string) => {
    if (!editor) return;
    const activeColor = editor.getAttributes('textStyle').color || '';
    if (!color || activeColor.toLowerCase() === color.toLowerCase()) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setShowColorPicker(false);
    setFloatingToolbarMenu(null);
  };

  const setHighlightColor = (color: string) => {
    if (!editor) return;
    const activeColor = editor.getAttributes('highlight').color || '';
    if (!color || activeColor.toLowerCase() === color.toLowerCase()) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setShowColorPicker(false);
    setFloatingToolbarMenu(null);
  };

  const toggleFloatingToolbarItem = (item: FloatingToolbarItem) => {
    setFloatingToolbarItems((currentItems) => {
      const nextItems = currentItems.includes(item)
        ? currentItems.filter((currentItem) => currentItem !== item)
        : [...currentItems, item];
      const orderedItems = FLOATING_TOOLBAR_ITEMS
        .map((option) => option.id)
        .filter((id) => nextItems.includes(id));
      localStorage.setItem('notes-app-floating-toolbar-items', JSON.stringify(orderedItems));
      return orderedItems;
    });
  };

  const createId = () => crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  const positionCommentPopover = useCallback((position: number) => {
    if (!editor) return;
    const coords = editor.view.coordsAtPos(position);
    const width = Math.min(340, window.innerWidth - 24);
    const height = 300;
    setCommentPopoverPosition({
      left: Math.max(12, Math.min(coords.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(coords.bottom + 8, window.innerHeight - height - 12)),
    });
  }, [editor]);

  const closeCommentPopover = useCallback(() => {
    setActiveCommentThreadId(null);
    setPendingCommentThread(null);
    setCommentPopoverPosition(null);
    setCommentDraft('');
    setCommentAnchorError('');
  }, []);

  const handleCreateComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;

    const now = new Date().toISOString();
    const pendingThread: PendingCommentThread = {
      id: createId(),
      selectedText,
      color: '#60a5fa',
      messages: [],
      createdAt: now,
      updatedAt: now,
      resolved: false,
      resolvedAt: null,
      from,
      to,
    };
    setPendingCommentThread(pendingThread);
    positionCommentPopover(from);
    setActiveCommentThreadId(pendingThread.id);
    setCommentDraft('');
    setCommentAnchorError('');
  };

  const handleSaveComment = () => {
    if (!editor || !activeCommentThreadId || !commentDraft.trim() || commentSaveGuard.current) return;
    const message: CommentMessage = {
      id: createId(),
      content: commentDraft.trim(),
      createdAt: new Date().toISOString(),
    };
    commentSaveGuard.current = true;
    setIsSavingComment(true);

    if (pendingCommentThread?.id === activeCommentThreadId) {
      const { from, to, ...thread } = pendingCommentThread;
      skipNextUpdate.current = true;
      editor.chain().focus().setTextSelection({ from, to }).setComment(thread.id, thread.color).run();
      onCreateCommentThread(note.id, { ...thread, messages: [message], updatedAt: message.createdAt }, editor.getHTML());
      setPendingCommentThread(null);
    } else {
      onAddCommentReply(note.id, activeCommentThreadId, message);
    }

    setCommentDraft('');
    window.setTimeout(() => {
      commentSaveGuard.current = false;
      setIsSavingComment(false);
    }, 300);
  };

  const handleUpdateCommentColor = (color: string) => {
    if (!editor || !activeCommentThread) return;
    if (pendingCommentThread?.id === activeCommentThread.id) {
      setPendingCommentThread({ ...pendingCommentThread, color });
      return;
    }
    skipNextUpdate.current = true;
    editor.chain().focus().setComment(activeCommentThread.id, color).run();
    onUpdateCommentThreadColor(note.id, activeCommentThread.id, color, editor.getHTML());
  };

  const focusCommentThread = useCallback((threadId: string) => {
    if (!editor || !editorContentRef.current) return false;
    const markType = editor.schema.marks.commentMark;
    let from = -1;
    let to = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from !== -1 || !node.isText) return from === -1;
      const matched = node.marks.some((mark) => mark.type === markType && mark.attrs.threadId === threadId);
      if (matched) {
        from = pos;
        to = pos + node.nodeSize;
        return false;
      }
      return true;
    });
    if (from === -1 || to === -1) {
      setCommentAnchorError('O trecho marcado não foi encontrado nesta versão da nota.');
      setActiveCommentThreadId(threadId);
      return false;
    }
    setCommentAnchorError('');
    setActiveCommentThreadId(threadId);
    editor.chain().focus().setTextSelection({ from, to }).run();
    const container = editorContentRef.current;
    const coords = editor.view.coordsAtPos(from);
    container.scrollTo({ top: Math.max(0, container.scrollTop + coords.top - container.getBoundingClientRect().top - 96) });
    window.requestAnimationFrame(() => positionCommentPopover(from));
    return true;
  }, [editor, positionCommentPopover]);

  useEffect(() => {
    if (focusCommentId) focusCommentThread(focusCommentId);
  }, [focusCommentId, focusCommentThread]);

  useEffect(() => {
    if (!activeCommentThreadId) return;
    const handleOutsidePointerDown = (event: MouseEvent) => {
      if (!commentPopoverRef.current?.contains(event.target as Node)) closeCommentPopover();
    };
    document.addEventListener('mousedown', handleOutsidePointerDown);
    return () => document.removeEventListener('mousedown', handleOutsidePointerDown);
  }, [activeCommentThreadId, closeCommentPopover]);

  const handleDeleteCommentThread = (threadId: string) => {
    if (!editor || !confirm('Remover este comentário e todas as suas respostas?')) return;
    const markType = editor.schema.marks.commentMark;
    const { tr } = editor.state;
    let removed = false;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      const matchingMark = node.marks.find((mark) => mark.type === markType && mark.attrs.threadId === threadId);
      if (matchingMark) {
        tr.removeMark(pos, pos + node.nodeSize, matchingMark);
        removed = true;
      }
      return true;
    });
    if (removed) {
      skipNextUpdate.current = true;
      editor.view.dispatch(tr);
    }
    onDeleteCommentThread(note.id, threadId, editor.getHTML());
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      next.delete(threadId);
      return next;
    });
    if (activeCommentThreadId === threadId) closeCommentPopover();
  };

  const handleAddBookmark = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;

    const bookmarkId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

    // Save the bookmark data first
    onAddBookmark(note.id, bookmarkId, selectedText, from);

    // Then apply the visual mark (skip the onUpdate to avoid race condition)
    skipNextUpdate.current = true;
    editor.chain().focus().setBookmark(bookmarkId).run();

    // Manually save the new content with the mark
    const html = editor.getHTML();
    onUpdateNote(note.id, { content: html });

    showSavedIndicator();
  };

  const handleRemoveBookmark = (bookmarkId: string, bookmarkText: string) => {
    if (!editor) return;

    const { doc } = editor.state;
    const markType = editor.schema.marks.bookmarkMark;

    if (markType) {
      // Find and remove the bookmark mark by its ID attribute
      const { tr } = editor.state;
      let removed = false;

      doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const marks = node.marks.filter(
          (m) => m.type === markType && m.attrs.id === bookmarkId
        );
        if (marks.length > 0) {
          tr.removeMark(pos, pos + node.nodeSize, marks[0]);
          removed = true;
        }
        return true;
      });

      if (removed) {
        editor.view.dispatch(tr);
      }
    }

    onRemoveBookmark(note.id, bookmarkId);
    showSavedIndicator();
  };

  const handleGoToBookmark = (bookmark: Bookmark) => {
    if (!editor || !editorContentRef.current) return;

    const { doc } = editor.state;
    const markType = editor.schema.marks.bookmarkMark;
    let foundPos = -1;
    let foundEnd = -1;

    if (markType) {
      // Find the exact mark with matching bookmark ID
      doc.descendants((node, pos) => {
        if (foundPos !== -1) return false;
        if (!node.isText || !node.text) return true;
        const bookmarkMarks = node.marks.filter(
          (m) => m.type === markType && m.attrs.id === bookmark.id
        );
        if (bookmarkMarks.length > 0) {
          foundPos = pos;
          foundEnd = pos + node.nodeSize;
          return false;
        }
        return true;
      });
    }

    // Fallback: search by text + position proximity
    if (foundPos === -1) {
      const occurrences: number[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return true;
        let idx = node.text.indexOf(bookmark.text);
        while (idx !== -1) {
          occurrences.push(pos + idx);
          idx = node.text.indexOf(bookmark.text, idx + 1);
        }
        return true;
      });

      if (occurrences.length > 0) {
        let closest = occurrences[0];
        let minDist = Math.abs(closest - bookmark.position);
        for (const occ of occurrences) {
          const d = Math.abs(occ - bookmark.position);
          if (d < minDist) {
            minDist = d;
            closest = occ;
          }
        }
        foundPos = closest;
        foundEnd = foundPos + bookmark.text.length;
      }
    }

    if (foundPos !== -1 && foundEnd !== -1) {
      editor.chain().focus().setTextSelection({ from: foundPos, to: foundEnd }).run();

      setTimeout(() => {
        try {
          const coords = editor.view.coordsAtPos(foundPos);
          if (coords && editorContentRef.current) {
            const containerRect = editorContentRef.current.getBoundingClientRect();
            const scrollTop = editorContentRef.current.scrollTop;
            const targetScroll = scrollTop + coords.top - containerRect.top - 100;
            editorContentRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
          }
        } catch (e) {
          // ignore
        }
      }, 50);
    }
  };

  const handleRevert = (versionId: string) => {
    if (versionTimer.current) {
      clearTimeout(versionTimer.current);
      versionTimer.current = null;
    }
    const targetVersion = history.find((version) => version.id === versionId);
    if (!targetVersion) return;
    const latestVersion = history[history.length - 1];
    // Registra o estado atual somente quando ele ainda não está no histórico,
    // preservando uma restauração sem duplicar snapshots idênticos.
    if (!latestVersion || latestVersion.title !== note.title || latestVersion.content !== note.content) {
      onSaveVersion(note.id, latestVersion?.content, latestVersion?.title);
    }
    lastVersionContent.current = targetVersion.content;
    lastVersionTitle.current = targetVersion.title;
    currentTitleRef.current = targetVersion.title;
    onRevertVersion(note.id, versionId);
    showSavedIndicator();
  };

  const handleUndoRevert = (versionId: string) => {
    // Find the version that was saved just before revert (the one after this version in time)
    const history = note.history || [];
    const versionIndex = history.findIndex((v) => v.id === versionId);
    // The version saved right after (which is the state before revert) is the last one
    const undoVersion = history[history.length - 1];
    if (undoVersion && undoVersion.id !== versionId) {
      onRevertVersion(note.id, undoVersion.id);
      showSavedIndicator();
    }
  };

  const handleManualSaveVersion = () => {
    if (versionTimer.current) {
      clearTimeout(versionTimer.current);
      versionTimer.current = null;
    }
    if (saveVersionIfChanged(true)) showSavedIndicator();
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatVersionTimelineDate = (iso: string) => {
    const date = new Date(iso);
    const isCurrentYear = date.getFullYear() === new Date().getFullYear();
    const dateLabel = date.toLocaleDateString('pt-BR', isCurrentYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' });
    const timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateLabel}, ${timeLabel}`;
  };

  const isDeleted = note.status === 'deleted';
  const history = note.history || [];
  const bookmarks = note.bookmarks || [];

  const toggleSideTab = (tab: SideTab) => {
    setSideTab(sideTab === tab ? 'none' : tab);
  };

  const handleInlineTaskSubmit = () => {
    if (!inlineTaskTitle.trim()) {
      // Empty title = exit task creation mode
      setShowInlineTask(false);
      return;
    }

    // Insert visual task in editor at the saved cursor position
    if (editor) {
      const dateLabel = inlineTaskDueDate
        ? new Date(inlineTaskDueDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : '';
      const timeLabel = inlineTaskDueTime ? ` ${inlineTaskDueTime}` : '';
      const metaStr = dateLabel ? ` <em style="color:#6b7394">(${dateLabel}${timeLabel})</em>` : '';

      // Insert at the saved cursor position
      editor.chain().focus().setTextSelection(cursorPosRef.current).insertContent(
        `<p class="inline-note-task"><input type="checkbox" disabled /> <strong>${inlineTaskTitle.trim()}</strong>${metaStr}</p>`
      ).run();

      // Update cursor position for next insert (after the new content)
      cursorPosRef.current = editor.state.selection.to;
    }

    onCreateTaskInNote({
      title: inlineTaskTitle.trim(),
      dueDate: inlineTaskDueDate,
      dueTime: inlineTaskDueTime,
      reminderMinutes: inlineTaskReminderEnabled ? (inlineTaskReminder ?? 0) : null,
      reminderSound: 'bell',
      recurrence: inlineTaskRecurrence,
      recurrenceInterval: 1,
    });
    // Reset for next task (keep inline open for continuous creation)
    setInlineTaskTitle('');
    setInlineTaskDueDate(null);
    setInlineTaskDueTime(null);
    setInlineTaskReminder(30);
    setInlineTaskReminderEnabled(true);
    setInlineTaskRecurrence('none');

    // Recalculate position for next task
    setTimeout(() => {
      if (editor && editorContentRef.current) {
        try {
          const coords = editor.view.coordsAtPos(cursorPosRef.current);
          const containerRect = editorContentRef.current.getBoundingClientRect();
          setInlineTaskPosition(coords.top - containerRect.top + editorContentRef.current.scrollTop);
        } catch (e) { /* ignore */ }
      }
    }, 50);
  };

  const handleOpenInlineTask = () => {
    if (!editor || !editorContentRef.current) return;

    // Get current cursor position in the editor
    const { from } = editor.state.selection;
    cursorPosRef.current = from;

    // Calculate pixel position of cursor relative to editor content area
    try {
      const coords = editor.view.coordsAtPos(from);
      const containerRect = editorContentRef.current.getBoundingClientRect();
      const top = coords.top - containerRect.top + editorContentRef.current.scrollTop;
      setInlineTaskPosition(top);
    } catch (e) {
      setInlineTaskPosition(0);
    }

    setShowInlineTask(true);
    setInlineTaskTitle('');
    setInlineTaskDueDate(null);
    setInlineTaskDueTime(null);
    setInlineTaskReminder(30);
    setInlineTaskReminderEnabled(true);
    setInlineTaskRecurrence('none');
  };

  const handleInlineTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInlineTaskSubmit();
    } else if (e.key === 'Escape') {
      setShowInlineTask(false);
      setInlineTaskTitle('');
      setInlineTaskDueDate(null);
    }
  };

  const getLocalDateStr = (date: Date = new Date()): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const setInlineTaskToday = () => {
    setInlineTaskDueDate(getLocalDateStr());
  };

  const setInlineTaskTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setInlineTaskDueDate(getLocalDateStr(d));
  };

  const toggleFloatingToolbarMenu = (menu: Exclude<FloatingToolbarMenu, null>) => {
    setFloatingToolbarMenu((current) => current === menu ? null : menu);
    setShowFloatingToolbarSettings(false);
  };

  const floatingToolbarActions = {
    bold: { label: 'Negrito', icon: <Bold size={17} />, active: editor?.isActive('bold'), run: () => editor?.chain().focus().toggleBold().run() },
    italic: { label: 'Itálico', icon: <Italic size={17} />, active: editor?.isActive('italic'), run: () => editor?.chain().focus().toggleItalic().run() },
    underline: { label: 'Sublinhado', icon: <UnderlineIcon size={17} />, active: editor?.isActive('underline'), run: () => editor?.chain().focus().toggleUnderline().run() },
    strike: { label: 'Tachado', icon: <Strikethrough size={17} />, active: editor?.isActive('strike'), run: () => editor?.chain().focus().toggleStrike().run() },
    color: { label: 'Cores e destaque', icon: <Palette size={17} />, active: floatingToolbarMenu === 'color', run: () => toggleFloatingToolbarMenu('color') },
    textStyle: { label: 'Parágrafo, títulos e alinhamento', icon: <span className="floating-toolbar-text-style">Aa</span>, active: floatingToolbarMenu === 'textStyle' || editor?.isActive('heading'), run: () => toggleFloatingToolbarMenu('textStyle') },
    lists: { label: 'Listas', icon: <List size={17} />, active: floatingToolbarMenu === 'lists' || editor?.isActive('bulletList') || editor?.isActive('orderedList') || editor?.isActive('taskList'), run: () => toggleFloatingToolbarMenu('lists') },
    quote: { label: 'Citação', icon: <Quote size={17} />, active: editor?.isActive('blockquote'), run: () => editor?.chain().focus().toggleBlockquote().run() },
    link: { label: 'Link', icon: <LinkIcon size={17} />, active: editor?.isActive('link'), run: addLink },
    bookmark: { label: 'Marcador', icon: <BookmarkPlus size={17} />, active: false, run: handleAddBookmark },
    collapsible: { label: 'Bloco colapsável', icon: <ChevronsDownUp size={17} />, active: false, run: insertCollapse },
    comment: { label: 'Adicionar comentário', icon: <MessageSquare size={17} />, active: false, run: handleCreateComment },
    undo: { label: 'Desfazer', icon: <Undo size={17} />, active: false, run: () => editor?.chain().focus().undo().run() },
    redo: { label: 'Refazer', icon: <Redo size={17} />, active: false, run: () => editor?.chain().focus().redo().run() },
    task: { label: 'Criar tarefa na nota', icon: <ListTodo size={17} />, active: false, run: handleOpenInlineTask },
  };

  const activeCommentThread = commentThreads.find((thread) => thread.id === activeCommentThreadId) || pendingCommentThread;
  const selectedVersion: NoteVersion | null = selectedVersionId
    ? history.find((version) => version.id === selectedVersionId) || null
    : null;
  const createVersionComparison = (after: NoteVersion, before: NoteVersion | null) => ({
    before,
    after,
    diff: buildVersionDiff(before?.content || '', after.content),
  });
  const currentVersionSnapshot: NoteVersion = {
    id: 'current',
    title: note.title,
    content: note.content,
    timestamp: note.updatedAt,
    summary: 'Estado atual do documento',
  };
  const currentComparison = createVersionComparison(currentVersionSnapshot, history.length ? history[history.length - 1] : null);
  const getTimelineComparison = (entry: TimelineEntry) => entry.isCurrent
    ? currentComparison
    : createVersionComparison(entry, history[history.findIndex((version) => version.id === entry.id) - 1] || null);
  const selectedComparison = selectedVersion
    ? createVersionComparison(selectedVersion, history[history.findIndex((version) => version.id === selectedVersion.id) - 1] || null)
    : currentComparison;
  const versionDiff = selectedComparison.diff;
  const toggleVersionDetails = (versionId: string, selectedId: string | null) => {
    setSelectedVersionId(selectedId);
    setActiveVersionPane('after');
    setExpandedVersionIds((current) => {
      const next = new Set(current);
      if (next.has(versionId)) next.delete(versionId); else next.add(versionId);
      return next;
    });
  };
  const orderedVersions = [...history].reverse();
  const matchesVersionDate = (date: Date) => (
    (!versionFilterDay || String(date.getDate()) === versionFilterDay)
    && (!versionFilterMonth || String(date.getMonth() + 1) === versionFilterMonth)
    && (!versionFilterYear || String(date.getFullYear()) === versionFilterYear)
  );
  const filteredVersions = orderedVersions.filter((version) => matchesVersionDate(new Date(version.timestamp)));
  const currentVersionMatches = matchesVersionDate(new Date(note.updatedAt));
  const timelineEntries: TimelineEntry[] = [...filteredVersions].reverse();
  if (currentVersionMatches) timelineEntries.push({ ...currentVersionSnapshot, isCurrent: true });
  const historySessions = buildHistorySessions(timelineEntries);
  const hasVersionResults = historySessions.length > 0;
  const availableYears = Array.from(new Set([new Date(note.updatedAt).getFullYear(), ...history.map((version) => new Date(version.timestamp).getFullYear())])).sort((a, b) => b - a);
  const sessionGroups = [...historySessions].reverse().reduce<{ key: string; label: string; sessions: HistorySession[] }[]>((groups, session) => {
    const primaryEntry = session.entries[session.entries.length - 1];
    const date = new Date(primaryEntry.timestamp);
    const today = new Date();
    const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
    const key = isToday ? 'today' : isYesterday ? 'yesterday' : `${date.getFullYear()}-${date.getMonth()}`;
    const label = isToday ? 'Hoje' : isYesterday ? 'Ontem' : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const previousGroup = groups[groups.length - 1];
    if (previousGroup?.key === key) previousGroup.sessions.push(session);
    else groups.push({ key, label, sessions: [session] });
    return groups;
  }, []);

  useEffect(() => {
    if (!showVersionHistory || !selectedVersion || !versionHistoryModalRef.current) return;
    const timer = window.setTimeout(() => {
      const preferredSelector = activeVersionPane === 'before'
        ? '.version-history-document.before .is-removed'
        : '.version-history-document.after .is-added';
      const change = versionHistoryModalRef.current?.querySelector<HTMLElement>(preferredSelector)
        || versionHistoryModalRef.current?.querySelector<HTMLElement>('.version-history-lines .is-added, .version-history-lines .is-removed');
      if (!change) return;
      change.scrollIntoView({ behavior: 'smooth', block: 'center' });
      change.classList.add('is-focused-change');
      window.setTimeout(() => change.classList.remove('is-focused-change'), 1800);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [showVersionHistory, selectedVersion?.id, note.content, activeVersionPane]);

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <input
          ref={titleRef}
          className="editor-title-input"
          placeholder="Título da nota"
          value={note.title}
          onChange={handleTitleChange}
          disabled={isDeleted}
        />
        <div className="editor-actions">
          {saved && (
            <span className="save-indicator">
              <Check size={12} /> Salvo
            </span>
          )}
          {!isDeleted && (
            <>
              <button
                className={`editor-action-btn ${sideTab === 'comments' ? 'active' : ''}`}
                onClick={() => toggleSideTab('comments')}
                title="Comentários desta nota"
              >
                <MessageSquare size={18} />
              </button>
              <button
                className={`editor-action-btn ${sideTab === 'bookmarks' ? 'active' : ''}`}
                onClick={() => toggleSideTab('bookmarks')}
                title="Marcadores"
              >
                <BookmarkIcon size={18} />
              </button>
              <div className="editor-note-history-actions" role="group" aria-label="Edição desta nota">
                <button
                  type="button"
                  className="editor-action-btn"
                  onClick={() => editor?.chain().focus().undo().run()}
                  disabled={!editor?.can().undo()}
                  title="Desfazer edição desta nota"
                  aria-label="Desfazer edição desta nota"
                >
                  <Undo size={18} />
                </button>
                <button
                  type="button"
                  className="editor-action-btn"
                  onClick={() => editor?.chain().focus().redo().run()}
                  disabled={!editor?.can().redo()}
                  title="Refazer edição desta nota"
                  aria-label="Refazer edição desta nota"
                >
                  <Redo size={18} />
                </button>
              </div>
              <button
                className="editor-action-btn"
                onClick={() => { setSelectedVersionId(null); setActiveVersionPane('after'); setShowVersionHistory(true); }}
                title="Histórico de versões"
              >
                <History size={18} />
              </button>
            </>
          )}
          {isDeleted ? (
            <>
              <button className="editor-action-btn" onClick={() => onRestoreNote(note.id)} title="Restaurar">
                <RotateCcw size={18} />
              </button>
              <button className="editor-action-btn danger" onClick={() => onDeleteNote(note.id)} title="Excluir permanentemente">
                <Trash2 size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                className={`editor-action-btn ${note.isFavorite ? 'active' : ''}`}
                onClick={() => onToggleFavorite(note.id)}
                title="Favorita"
              >
                <Star size={18} fill={note.isFavorite ? 'currentColor' : 'none'} />
              </button>
              <button className="editor-action-btn" onClick={() => onArchiveNote(note.id)} title="Arquivar">
                <Archive size={18} />
              </button>
              <button className="editor-action-btn danger" onClick={() => onDeleteNote(note.id)} title="Excluir">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {!isDeleted && (
        <>
          <div className="notebook-selector">
            <span>Caderno:</span>
            <select
              value={note.notebookId || ''}
              onChange={(e) => onMoveNote(note.id, e.target.value || null)}
            >
              <option value="">Nenhum</option>
              {notebooks.map((nb) => (
                <option key={nb.id} value={nb.id}>{nb.name}</option>
              ))}
            </select>
          </div>

          <div className="editor-tags">
            <span className="editor-tags-label">Tags:</span>
            {note.tags.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <span key={tag.id} className="tag-chip" style={{ borderLeft: `3px solid ${tag.color}` }}>
                  {tag.name}
                  <X size={10} className="tag-chip-remove" onClick={() => onToggleTag(note.id, tag.id)} />
                </span>
              );
            })}
            <div className="tag-selector">
              <button className="tag-add-btn" onClick={() => setShowTagSelector(!showTagSelector)}>
                + tag
              </button>
              {showTagSelector && (
                <div className="tag-selector-dropdown">
                  {tags.length === 0 ? (
                    <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Nenhuma tag criada
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <div
                        key={tag.id}
                        className={`tag-selector-item ${note.tags.includes(tag.id) ? 'selected' : ''}`}
                        onClick={() => { onToggleTag(note.id, tag.id); }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color }} />
                        {tag.name}
                        {note.tags.includes(tag.id) && <Check size={12} style={{ marginLeft: 'auto' }} />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="editor-toolbar">
            <button className={`toolbar-btn ${editor?.isActive('bold') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito">
              <Bold size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('italic') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico">
              <Italic size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('underline') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Sublinhado">
              <UnderlineIcon size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('strike') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Tachado">
              <Strikethrough size={16} />
            </button>
            <div className="toolbar-separator" />

            <div style={{ position: 'relative' }}>
              <button className="toolbar-btn" onClick={() => setShowColorPicker(!showColorPicker)} title="Cores">
                <Palette size={16} />
              </button>
              {showColorPicker && (
                <div className="color-picker-dropdown">
                  <div className="color-picker-title">Cor do texto</div>
                  <div className="color-picker-grid">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.value || 'default'}
                        className="color-swatch"
                        style={{ background: c.value || 'var(--text-primary)', border: c.value === '' ? '2px dashed var(--border-light)' : 'none' }}
                        onClick={() => setTextColor(c.value)}
                        title={c.label}
                      />
                    ))}
                  </div>
                  <div className="color-picker-title" style={{ marginTop: '8px' }}>Destaque</div>
                  <div className="color-picker-grid">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.value || 'none'}
                        className="color-swatch"
                        style={{ background: c.value || 'transparent', border: c.value === '' ? '2px dashed var(--border-light)' : 'none' }}
                        onClick={() => setHighlightColor(c.value)}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="toolbar-btn" onClick={handleAddBookmark} title="Marcar texto selecionado">
              <BookmarkPlus size={16} />
            </button>

            <div className="toolbar-separator" />
            <button className={`toolbar-btn ${editor?.isActive('heading', { level: 1 }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">
              <Heading1 size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">
              <Heading2 size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('heading', { level: 3 }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">
              <Heading3 size={16} />
            </button>
            <div className="toolbar-separator" />
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Alinhar à esquerda">
              <AlignLeft size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Centralizar">
              <AlignCenter size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Alinhar à direita">
              <AlignRight size={16} />
            </button>
            <div className="toolbar-separator" />
            <button className={`toolbar-btn ${editor?.isActive('bulletList') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista com marcadores">
              <List size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('orderedList') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada">
              <ListOrdered size={16} />
            </button>
            <button className={`toolbar-btn ${editor?.isActive('taskList') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleTaskList().run()} title="Checklist">
              <CheckSquare size={16} />
            </button>
            <div className="toolbar-separator" />
            <button className={`toolbar-btn ${editor?.isActive('blockquote') ? 'is-active' : ''}`} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Citação">
              <Quote size={16} />
            </button>
            <button className="toolbar-btn" onClick={addLink} title="Link">
              <LinkIcon size={16} />
            </button>
            <button className="toolbar-btn" onClick={insertCollapse} title="Colapsável">
              <ChevronsDownUp size={16} />
            </button>
            <div className="toolbar-separator" />
            <button className="toolbar-btn" onClick={() => editor?.chain().focus().undo().run()} title="Desfazer">
              <Undo size={16} />
            </button>
            <button className="toolbar-btn" onClick={() => editor?.chain().focus().redo().run()} title="Refazer">
              <Redo size={16} />
            </button>
            <div className="toolbar-separator" />
            <button className="toolbar-btn" onClick={handleOpenInlineTask} title="Criar tarefa na nota">
              <ListTodo size={16} />
            </button>
          </div>
        </>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="editor-content" ref={editorContentRef} style={{ flex: 1, position: 'relative' }}>
          {!isDeleted && editor && (
            <BubbleMenu editor={editor} tippyOptions={{ placement: 'top', duration: 120, maxWidth: 'none' }} shouldShow={({ state: editorState }) => !editorState.selection.empty}>
              <div className="floating-toolbar" role="toolbar" aria-label="Formatação do texto selecionado">
                {floatingToolbarItems.map((item) => {
                  const action = floatingToolbarActions[item];
                  return <button key={item} type="button" className={`floating-toolbar-btn ${action.active ? 'is-active' : ''}`} title={action.label} aria-label={action.label} onMouseDown={(event) => event.preventDefault()} onClick={action.run}>{action.icon}</button>;
                })}
                <span className="floating-toolbar-separator" />
                <button type="button" className={`floating-toolbar-btn ${showFloatingToolbarSettings ? 'is-active' : ''}`} title="Configurar atalhos" aria-label="Configurar atalhos" onMouseDown={(event) => event.preventDefault()} onClick={() => { setShowFloatingToolbarSettings((shown) => !shown); setFloatingToolbarMenu(null); }}><MoreHorizontal size={18} /></button>

                {floatingToolbarMenu === 'color' && (
                  <div className="floating-toolbar-menu floating-toolbar-colors" onMouseDown={(event) => event.preventDefault()}>
                    <span>Cor do texto</span>
                    <div>{TEXT_COLORS.slice(1, 7).map((color) => {
                      const selected = (editor.getAttributes('textStyle').color || '').toLowerCase() === color.value.toLowerCase();
                      return <button key={color.value} type="button" className={`floating-color-swatch ${selected ? 'is-selected' : ''}`} title={selected ? `Remover ${color.label}` : color.label} style={{ background: color.value }} onClick={() => setTextColor(color.value)} />;
                    })}</div>
                    <button type="button" className="floating-menu-clear" onClick={() => setTextColor('')}><X size={14} /> Remover cor do texto</button>
                    <span>Destaque</span>
                    <div>{HIGHLIGHT_COLORS.slice(1, 7).map((color) => {
                      const selected = (editor.getAttributes('highlight').color || '').toLowerCase() === color.value.toLowerCase();
                      return <button key={color.value} type="button" className={`floating-color-swatch ${selected ? 'is-selected' : ''}`} title={selected ? `Remover ${color.label}` : color.label} style={{ background: color.value }} onClick={() => setHighlightColor(color.value)} />;
                    })}</div>
                    <button type="button" className="floating-menu-clear" onClick={() => setHighlightColor('')}><X size={14} /> Remover destaque</button>
                  </div>
                )}

                {floatingToolbarMenu === 'textStyle' && (
                  <div className="floating-toolbar-menu floating-toolbar-options" onMouseDown={(event) => event.preventDefault()}>
                    <span>Estilo do texto</span>
                    <button type="button" onClick={() => { editor.chain().focus().setParagraph().run(); setFloatingToolbarMenu(null); }}>Parágrafo</button>
                    <button type="button" onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); setFloatingToolbarMenu(null); }}><Heading1 size={16} /> Título 1</button>
                    <button type="button" onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); setFloatingToolbarMenu(null); }}><Heading2 size={16} /> Título 2</button>
                    <button type="button" onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); setFloatingToolbarMenu(null); }}><Heading3 size={16} /> Título 3</button>
                    <span>Alinhamento</span>
                    <div className="floating-menu-row">
                      <button type="button" className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''} title="Alinhar à esquerda" onClick={() => { editor.chain().focus().setTextAlign('left').run(); setFloatingToolbarMenu(null); }}><AlignLeft size={16} /></button>
                      <button type="button" className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''} title="Centralizar" onClick={() => { editor.chain().focus().setTextAlign('center').run(); setFloatingToolbarMenu(null); }}><AlignCenter size={16} /></button>
                      <button type="button" className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''} title="Alinhar à direita" onClick={() => { editor.chain().focus().setTextAlign('right').run(); setFloatingToolbarMenu(null); }}><AlignRight size={16} /></button>
                    </div>
                  </div>
                )}

                {floatingToolbarMenu === 'lists' && (
                  <div className="floating-toolbar-menu floating-toolbar-options" onMouseDown={(event) => event.preventDefault()}>
                    <span>Listas</span>
                    <button type="button" onClick={() => { editor.chain().focus().toggleBulletList().run(); setFloatingToolbarMenu(null); }}><List size={16} /> Lista com marcadores</button>
                    <button type="button" onClick={() => { editor.chain().focus().toggleOrderedList().run(); setFloatingToolbarMenu(null); }}><ListOrdered size={16} /> Lista numerada</button>
                    <button type="button" onClick={() => { editor.chain().focus().toggleTaskList().run(); setFloatingToolbarMenu(null); }}><CheckSquare size={16} /> Checklist</button>
                  </div>
                )}

                {showFloatingToolbarSettings && (
                  <div className="floating-toolbar-settings" onMouseDown={(event) => event.preventDefault()}>
                    <p>Atalhos da barra</p>
                    <small>Os itens com estrela ficam no topo. Clique para adicionar ou remover.</small>
                    <div className="floating-toolbar-settings-list">
                      {[...FLOATING_TOOLBAR_ITEMS].sort((a, b) => Number(floatingToolbarItems.includes(b.id)) - Number(floatingToolbarItems.includes(a.id))).map((item) => {
                        const action = floatingToolbarActions[item.id];
                        const selected = floatingToolbarItems.includes(item.id);
                        return <button key={item.id} type="button" className={`floating-toolbar-setting ${selected ? 'is-selected' : ''}`} onClick={() => toggleFloatingToolbarItem(item.id)}><span>{action.icon}</span><strong>{item.label}</strong><Star size={17} fill={selected ? 'currentColor' : 'none'} /></button>;
                      })}
                    </div>
                    <small className="floating-toolbar-full-hint">Títulos, alinhamento, listas e cores ficam agrupados em menus para a barra continuar enxuta.</small>
                  </div>
                )}
              </div>
            </BubbleMenu>
          )}
          {isDeleted ? (
            <div style={{ opacity: 0.6 }} dangerouslySetInnerHTML={{ __html: note.content }} />
          ) : (
            <EditorContent
              editor={editor}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                const mark = target.closest('mark[data-comment-thread-id]');
                const threadId = mark?.getAttribute('data-comment-thread-id');
                if (threadId) focusCommentThread(threadId);
              }}
            />
          )}

          {activeCommentThread && commentPopoverPosition && createPortal(
            <aside ref={commentPopoverRef} className="comment-thread-popover" style={commentPopoverPosition} aria-label="Thread de comentário">
              <div className="comment-thread-header">
                <div><MessageSquare size={15} /> Comentário</div>
                <button type="button" onClick={closeCommentPopover} title="Fechar comentário"><X size={15} /></button>
              </div>
              <div className="comment-color-picker" aria-label="Cor do marcador">
                <span>Cor do marcador</span>
                <div>{COMMENT_COLORS.map((color) => <button key={color} type="button" className={activeCommentThread.color === color ? 'is-selected' : ''} title="Alterar cor do marcador" style={{ backgroundColor: color }} onClick={() => handleUpdateCommentColor(color)} />)}</div>
              </div>
              <blockquote>“{activeCommentThread.selectedText}”</blockquote>
              {commentAnchorError && <p className="comment-anchor-error">{commentAnchorError}</p>}
              <div className="comment-thread-messages">
                {activeCommentThread.messages.length > 0 && activeCommentThread.messages.map((message) => (
                  <article key={message.id} className="comment-message">
                    <p>{message.content}</p>
                    <time>{formatDateTime(message.createdAt)}</time>
                  </article>
                ))}
              </div>
              <div className="comment-composer">
                <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder={activeCommentThread.resolved ? 'Reabra o comentário para responder.' : pendingCommentThread ? 'Escreva o comentário…' : 'Adicionar resposta…'} disabled={activeCommentThread.resolved || isSavingComment} rows={3} />
                <button type="button" className="comment-send-btn" disabled={activeCommentThread.resolved || isSavingComment || !commentDraft.trim()} onClick={handleSaveComment}><Send size={14} /> Salvar</button>
              </div>
              <div className="comment-thread-footer">
                <small>{activeCommentThread.resolved ? 'Resolvido' : 'Em aberto'}</small>
                <button type="button" onClick={() => activeCommentThread.resolved ? onReopenCommentThread(note.id, activeCommentThread.id) : onResolveCommentThread(note.id, activeCommentThread.id)}>{activeCommentThread.resolved ? 'Reabrir' : 'Resolver'}</button>
              </div>
            </aside>,
            document.body
          )}

          {/* Inline task creation - positioned inside editor area */}
          {showInlineTask && (
            <div className="inline-task-floating" style={{ top: inlineTaskPosition }}>
              <div className="inline-task-card" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { if (!inlineTaskTitle.trim()) setShowInlineTask(false); } }}>
                <div className="inline-task-row-main">
                  <Circle size={16} className="inline-task-circle" />
                  <input
                    className="inline-task-input"
                    placeholder="Digite a tarefa e pressione Enter..."
                    value={inlineTaskTitle}
                    onChange={(e) => setInlineTaskTitle(e.target.value)}
                    onKeyDown={handleInlineTaskKeyDown}
                    autoFocus
                  />
                  <button className="inline-task-discard" onClick={() => { setShowInlineTask(false); setInlineTaskTitle(''); }} title="Fechar">
                    <X size={14} />
                  </button>
                </div>
                <div className="inline-task-row-options">
                  <button className={`inline-task-chip ${inlineTaskDueDate === getLocalDateStr() ? 'active' : ''}`} onClick={setInlineTaskToday}>Hoje</button>
                  <button className={`inline-task-chip ${inlineTaskDueDate === getLocalDateStr(new Date(Date.now() + 86400000)) ? 'active' : ''}`} onClick={setInlineTaskTomorrow}>Amanhã</button>
                  <input type="date" className="inline-task-date-input" value={inlineTaskDueDate || ''} onChange={(e) => setInlineTaskDueDate(e.target.value || null)} />
                  <input type="time" className="inline-task-date-input" value={inlineTaskDueTime || ''} onChange={(e) => setInlineTaskDueTime(e.target.value || null)} />
                  <span className="inline-task-sep">|</span>
                  <label className="inline-task-mini-label">
                    <input type="checkbox" checked={inlineTaskReminderEnabled} onChange={(e) => setInlineTaskReminderEnabled(e.target.checked)} />
                    <Bell size={12} />
                    {inlineTaskReminderEnabled && (
                      <input type="number" className="inline-task-mini-number" min={0} value={inlineTaskReminder ?? 30} onChange={(e) => setInlineTaskReminder(parseInt(e.target.value) || 0)} />
                    )}
                    {inlineTaskReminderEnabled && <span>min</span>}
                  </label>
                  <span className="inline-task-sep">|</span>
                  <select className="inline-task-mini-select" value={inlineTaskRecurrence} onChange={(e) => setInlineTaskRecurrence(e.target.value as any)}>
                    <option value="none">Sem repetição</option>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
                <div className="inline-task-hint">Enter para criar • Escape para sair</div>
              </div>
            </div>
          )}
        </div>

        {sideTab === 'history' && (
          <div className="history-panel">
            <div className="history-panel-header">
              <h3><History size={14} /> Histórico</h3>
              <button className="history-save-btn" onClick={handleManualSaveVersion}>
                Salvar versão
              </button>
            </div>
            <div className="history-panel-content">
              {history.length === 0 ? (
                <div className="history-empty">
                  <Clock size={24} />
                  <p>Nenhuma versão salva</p>
                  <small>Alterações são salvas continuamente. Uma versão é criada após 5 minutos sem editar quando a sessão tiver mudanças relevantes.</small>
                </div>
              ) : (
                [...history].reverse().map((version) => (
                  <div key={version.id} className="history-item clickable">
                    <div className="history-item-content" onClick={() => handleRevert(version.id)}>
                      <div className="history-item-time">{formatDateTime(version.timestamp)}</div>
                      <div className="history-item-summary">{version.summary || 'Alteração salva'}</div>
                      <div className="history-item-title">{version.title || 'Sem título'}</div>
                    </div>
                    <button
                      className="history-revert-btn"
                      onClick={(e) => { e.stopPropagation(); handleUndoRevert(version.id); }}
                      title="Desfazer restauração desta versão"
                    >
                      <RotateCcw size={11} /> Desfazer
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {sideTab === 'comments' && (
          <div className="history-panel comment-list-panel">
            <div className="history-panel-header">
              <h3><MessageSquare size={14} /> Comentários</h3>
              <span className="comment-list-count">{commentThreads.length}</span>
            </div>
            <div className="history-panel-content">
              {commentThreads.length === 0 ? (
                <div className="history-empty">
                  <MessageSquare size={24} />
                  <p>Nenhum comentário</p>
                  <small>Selecione um trecho e use o atalho de comentário.</small>
                </div>
              ) : (
                [...commentThreads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((thread) => {
                  const mainMessage = thread.messages[0];
                  const replies = thread.messages.slice(1);
                  const isExpanded = expandedCommentIds.has(thread.id);
                  return (
                    <article key={thread.id} className={`comment-list-item ${thread.resolved ? 'is-resolved' : ''}`}>
                      <button type="button" className="comment-list-main" onClick={() => focusCommentThread(thread.id)}>
                        <span className="comment-list-color" style={{ background: thread.color }} />
                        <span>
                          <strong>“{thread.selectedText}”</strong>
                          <small>{mainMessage?.content || 'Sem mensagem'} · {thread.resolved ? 'Resolvido' : 'Em aberto'}</small>
                          <time>{formatDateTime(mainMessage?.createdAt || thread.updatedAt)}</time>
                        </span>
                      </button>
                      {replies.length > 0 && (
                        <>
                          <button type="button" className="comment-list-more" onClick={() => setExpandedCommentIds((current) => {
                            const next = new Set(current);
                            if (next.has(thread.id)) next.delete(thread.id); else next.add(thread.id);
                            return next;
                          })}>{isExpanded ? 'Ocultar respostas' : `Mais ${replies.length} ${replies.length === 1 ? 'resposta' : 'respostas'}`}</button>
                          {isExpanded && <div className="comment-list-replies">{replies.map((message) => <button key={message.id} type="button" onClick={() => focusCommentThread(thread.id)}><span>{message.content}</span><time>{formatDateTime(message.createdAt)}</time></button>)}</div>}
                        </>
                      )}
                      <div className="comment-list-actions">
                        <button type="button" onClick={() => focusCommentThread(thread.id)}>Ir para o trecho</button>
                        <button type="button" className="danger" onClick={() => handleDeleteCommentThread(thread.id)}>Remover</button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        )}

        {sideTab === 'bookmarks' && (
          <div className="history-panel">
            <div className="history-panel-header">
              <h3><BookmarkIcon size={14} /> Marcadores</h3>
            </div>
            <div className="history-panel-content">
              {bookmarks.length === 0 ? (
                <div className="history-empty">
                  <BookmarkIcon size={24} />
                  <p>Nenhum marcador</p>
                  <small>Selecione um trecho de texto e clique no ícone de marcador na toolbar.</small>
                </div>
              ) : (
                bookmarks.map((bm) => (
                  <div key={bm.id} className="bookmark-item" onClick={() => handleGoToBookmark(bm)}>
                    <div className="bookmark-item-text">"{bm.text}"</div>
                    <div className="bookmark-item-time">{formatDateTime(bm.createdAt)}</div>
                    <button
                      className="bookmark-remove-btn"
                      onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(bm.id, bm.text); }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showVersionHistory && createPortal(
        <div className="version-history-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVersionHistory(false); }}>
          <section ref={versionHistoryModalRef} className="version-history-modal" role="dialog" aria-modal="true" aria-label="Histórico de versões">
            <header className="version-history-modal-header">
              <div>
                <h2>Histórico de versões</h2>
                <p>Veja o que mudou em cada versão e compare cada registro apenas com a versão imediatamente anterior.</p>
              </div>
              <div className="version-history-header-actions">
                <button type="button" onClick={handleManualSaveVersion}>Salvar versão</button>
                <button type="button" className="version-history-close" onClick={() => setShowVersionHistory(false)} title="Fechar histórico"><X size={20} /></button>
              </div>
            </header>
            <div className="version-history-layout">
              <main className="version-history-preview">
                <div className="version-history-preview-title">
                  <span>{selectedVersion ? `Alterações registradas em ${formatDateTime(selectedVersion.timestamp)}` : 'Alterações desde a última versão salva'}</span>
                  <strong>{selectedVersion?.summary || 'Estado completo atual'}</strong>
                </div>
                <div className="version-history-documents">
                  <article className={`version-history-document before ${activeVersionPane === 'before' ? 'is-active-pane' : ''}`} onClick={() => setActiveVersionPane('before')}>
                    <header><span>{selectedComparison.before ? 'Versão anterior' : 'Início do documento'} {activeVersionPane === 'before' && '• selecionado'}</span><strong>{selectedComparison.before?.title || 'Sem versão anterior'}</strong></header>
                    <div className="version-history-lines">{versionDiff.before.length ? versionDiff.before.map((row, rowIndex) => <p key={`before-${rowIndex}`}>{row.segments.map((segment, segmentIndex) => <span key={`${segment.text}-${segmentIndex}`} className={`version-diff-segment ${segment.kind === 'removed' ? 'is-removed' : ''}`}>{segment.text}</span>)}</p>) : <p className="version-history-empty">Não havia conteúdo antes desta versão.</p>}</div>
                  </article>
                  <article className={`version-history-document after ${activeVersionPane === 'after' ? 'is-active-pane' : ''}`} onClick={() => setActiveVersionPane('after')}>
                    <header><span>{selectedVersion ? 'Versão selecionada' : 'Versão atual'} {activeVersionPane === 'after' && '• selecionado'}</span><strong>{selectedComparison.after.title || 'Sem título'}</strong></header>
                    <div className="version-history-lines">{versionDiff.after.length ? versionDiff.after.map((row, rowIndex) => <p key={`after-${rowIndex}`}>{row.segments.map((segment, segmentIndex) => <span key={`${segment.text}-${segmentIndex}`} className={`version-diff-segment ${segment.kind === 'added' ? 'is-added' : ''}`}>{segment.text}</span>)}</p>) : <p className="version-history-empty">Esta versão não possui conteúdo.</p>}</div>
                  </article>
                </div>
              </main>
              <aside className="version-history-timeline">
                <h3>Histórico de versões</h3>
                <div className="version-filters">
                  <div className="version-date-filters" aria-label="Filtrar versões por data">
                    <select value={versionFilterDay} onChange={(event) => setVersionFilterDay(event.target.value)} aria-label="Dia">
                      <option value="">Dia</option>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
                    </select>
                    <select value={versionFilterMonth} onChange={(event) => setVersionFilterMonth(event.target.value)} aria-label="Mês">
                      <option value="">Mês</option>{MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                    </select>
                    <select value={versionFilterYear} onChange={(event) => setVersionFilterYear(event.target.value)} aria-label="Ano">
                      <option value="">Ano</option>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                </div>
                <div className="version-timeline-list">
                  {!hasVersionResults ? (
                    <p className="version-timeline-empty">Nada encontrado com estes filtros.</p>
                  ) : (
                    <>
                      {sessionGroups.map((group) => (
                        <section key={group.key} className="version-timeline-group">
                          <h4>{group.label}</h4>
                          {group.sessions.map((session) => {
                            const primaryEntry = session.entries[session.entries.length - 1];
                            const comparison = getTimelineComparison(primaryEntry);
                            const added = changedTexts(comparison.diff.after, 'added');
                            const removed = changedTexts(comparison.diff.before, 'removed');
                            const isExpanded = expandedVersionIds.has(session.id);
                            const childEntries = session.entries.slice(0, -1).reverse();
                            return (
                              <article key={session.id} className={`version-session-card ${isExpanded ? 'is-expanded' : ''}`}>
                                <button
                                  type="button"
                                  className={`version-session-toggle ${((primaryEntry.isCurrent && selectedVersionId === null) || selectedVersion?.id === primaryEntry.id) ? 'is-selected' : ''}`}
                                  aria-expanded={isExpanded}
                                  aria-controls={`version-session-${session.id}`}
                                  onClick={() => toggleVersionDetails(session.id, primaryEntry.isCurrent ? null : primaryEntry.id)}
                                >
                                  <ChevronRight className="version-timeline-chevron" size={18} aria-hidden="true" />
                                  <div>
                                    <strong>{formatVersionTimelineDate(primaryEntry.timestamp)}</strong>
                                    <em>{primaryEntry.isCurrent ? 'Versão atual' : 'Atualização importante'}</em>
                                    <small><i className="version-timeline-author-dot" />Você (local)</small>
                                  </div>
                                </button>
                                <div className="version-session-summary">
                                  <p>Estado atual da sessão</p>
                                  {added.map((text, index) => <span key={`add-${index}`} className="is-added">Adicionado: {text}</span>)}
                                  {removed.map((text, index) => <span key={`remove-${index}`} className="is-removed">Removido: {text}</span>)}
                                  {!added.length && !removed.length && <span className="version-timeline-no-changes">Sem mudanças de texto nesta sessão.</span>}
                                </div>
                                {isExpanded && <div id={`version-session-${session.id}`} className="version-session-children">
                                  {childEntries.length ? childEntries.map((entry) => (
                                    <button key={entry.id} type="button" className={`version-session-child ${selectedVersion?.id === entry.id ? 'is-selected' : ''}`} onClick={() => { setSelectedVersionId(entry.id); setActiveVersionPane('after'); }}>
                                      <span className="version-session-child-dot" />
                                      <span><strong>{formatVersionTimelineDate(entry.timestamp)}</strong><small>{entry.summary || 'Registro detalhado'}</small></span>
                                    </button>
                                  )) : <p className="version-session-empty">Os próximos registros desta sessão aparecerão aqui.</p>}
                                </div>}
                              </article>
                            );
                          })}
                        </section>
                      ))}
                    </>
                  )}
                </div>
              </aside>
            </div>
            <footer className="version-history-footer">
              <small>{selectedVersion ? 'A restauração substitui o título e o conteúdo atuais pela versão selecionada. O estado atual é salvo antes da reversão.' : 'Selecione uma versão salva para restaurá-la.'}</small>
              <div><button type="button" onClick={() => setShowVersionHistory(false)}>Cancelar</button><button type="button" className="version-revert-btn" disabled={!selectedVersion} onClick={() => { if (selectedVersion) { handleRevert(selectedVersion.id); setShowVersionHistory(false); } }}><RotateCcw size={15} /> Reverter para esta versão</button></div>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
