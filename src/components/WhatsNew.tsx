import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  CHANGE_KIND_LABELS,
  CHANGE_KIND_ICONS,
  RELEASE_NOTES,
  findReleaseNote,
  formatReleaseDate,
  getPreviousReleaseNotes,
  groupChangesByKind,
  type ReleaseNote,
  type ReleaseChangeKind,
} from '../releaseNotes';

interface Props {
  onClose: () => void;
}

function ReleaseChanges({ note }: { note: ReleaseNote }) {
  const groups = groupChangesByKind(note.changes);
  const kindOrder: ReleaseChangeKind[] = ['novo', 'melhoria', 'correcao'];

  return (
    <div className="release-changes-grouped">
      {kindOrder.map((kind) => {
        const items = groups[kind];
        if (items.length === 0) return null;
        return (
          <div key={kind} className="release-group">
            <h5 className="release-group-title">
              <span className="release-group-icon">{CHANGE_KIND_ICONS[kind]}</span>
              {CHANGE_KIND_LABELS[kind]}
              <span className="release-group-count">{items.length}</span>
            </h5>
            <ul className="release-changes">
              {items.map((change, index) => (
                <li key={index}>
                  <span>{change.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function WhatsNew({ onClose }: Props) {
  const [version, setVersion] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!window.electronAPI?.getAppVersion) {
      setVersion(RELEASE_NOTES[0]?.version || '');
      return;
    }
    window.electronAPI.getAppVersion()
      .then((value) => { if (!cancelled) setVersion(value); })
      .catch(() => { if (!cancelled) setVersion(RELEASE_NOTES[0]?.version || ''); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  const currentNote = useMemo(() => findReleaseNote(version), [version]);
  const previousNotes = useMemo(() => getPreviousReleaseNotes(version), [version]);
  const selectedNote = useMemo(
    () => previousNotes.find((note) => note.version === selectedVersion) || null,
    [previousNotes, selectedVersion],
  );

  return (
    <div className="whatsnew-overlay" onClick={onClose}>
      <aside
        className="whatsnew-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="whatsnew-header">
          <h2 id="whatsnew-title"><Sparkles size={16} /> Novidades</h2>
          <button type="button" ref={closeButtonRef} className="whatsnew-close" onClick={onClose} aria-label="Fechar novidades">
            <X size={18} />
          </button>
        </header>

        <div className="whatsnew-content">
          {currentNote ? (
            <section className="whatsnew-current">
              <div className="whatsnew-current-badge">Versão atual</div>
              <h3>{currentNote.title}</h3>
              <div className="whatsnew-meta">
                <strong>v{currentNote.version}</strong>
                <span>{formatReleaseDate(currentNote.date)}</span>
              </div>
              <p className="whatsnew-summary">{currentNote.summary}</p>
              <ReleaseChanges note={currentNote} />
            </section>
          ) : (
            <p className="whatsnew-empty">Ainda não há novidades registradas para esta versão.</p>
          )}

          {previousNotes.length > 0 && (
            <section className="whatsnew-previous">
              <div className="whatsnew-previous-header">
                <h4>Versões anteriores</h4>
                <select
                  className="whatsnew-filter"
                  value={selectedVersion}
                  onChange={(event) => setSelectedVersion(event.target.value)}
                  aria-label="Escolher uma versão anterior"
                >
                  <option value="">Selecione uma versão</option>
                  {previousNotes.map((note) => (
                    <option key={note.version} value={note.version}>
                      v{note.version} — {note.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedNote ? (
                <article className="whatsnew-selected">
                  <div className="whatsnew-meta">
                    <strong>v{selectedNote.version}</strong>
                    <span>{formatReleaseDate(selectedNote.date)}</span>
                  </div>
                  <h3>{selectedNote.title}</h3>
                  <p className="whatsnew-summary">{selectedNote.summary}</p>
                  <ReleaseChanges note={selectedNote} />
                  <button type="button" className="whatsnew-clear" onClick={() => setSelectedVersion('')}>
                    Voltar para a lista
                  </button>
                </article>
              ) : (
                <ul className="whatsnew-version-list">
                  {previousNotes.map((note) => (
                    <li key={note.version}>
                      <button type="button" onClick={() => setSelectedVersion(note.version)}>
                        <strong>v{note.version}</strong>
                        <span>{note.title}</span>
                        <small>{formatReleaseDate(note.date)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
