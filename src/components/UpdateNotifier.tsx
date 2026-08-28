import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X, RefreshCw, Sparkles } from 'lucide-react';
import type { Task } from '../types';

declare global {
  interface Window {
    electronAPI?: {
      checkForUpdates: () => Promise<string>;
      restartAndUpdate: () => Promise<{ success: boolean; version?: string; error?: string }>;
      getAppVersion: () => Promise<string>;
      getPendingUpdate: () => Promise<{ version: string | null }>;
      saveFile: (options: { content: string; defaultName: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ success: boolean; filePath?: string }>;
      selectFolder: () => Promise<string | null>;
      saveFilesToFolder: (folder: string, files: { path: string; content: string }[]) => Promise<{ success: boolean; count?: number; error?: string }>;
      getBackupPath: () => Promise<string>;
      openWebVersion: () => Promise<{ success: boolean; url: string }>;
      diskSaveState: (state: unknown) => Promise<{ success: boolean; error?: string }>;
      diskLoadState: () => Promise<{ state: unknown; source: string }>;
      diskListBackups: () => Promise<{ file: string; path: string; size: number; date: string }[]>;
      diskRestoreBackup: (backupPath: string) => Promise<{ success: boolean; state?: unknown; error?: string }>;
      onFlushBeforeQuit: (callback: () => void) => () => void;
      confirmFlushBeforeQuit: () => void;      getAutostart: () => Promise<boolean>;
      setAutostart: (enabled: boolean) => Promise<boolean>;
      googleCalendarStatus: () => Promise<{ available: boolean; connected: boolean; clientIdConfigured: boolean }>;
      googleCalendarConnect: (clientId: string) => Promise<{ available: boolean; connected: boolean; clientIdConfigured: boolean }>;
      googleCalendarDisconnect: () => Promise<{ available: boolean; connected: boolean; clientIdConfigured: boolean }>;
      googleCalendarListCalendars: () => Promise<{ id: string; summary: string; primary: boolean }[]>;
      googleCalendarSync: (tasks: Task[], calendarId: string, syncAllActiveTasks: boolean) => Promise<{ tasks: Task[]; conflicts: { taskId: string; type: 'deleted-remotely' }[]; syncedAt: string }>;
      googleCalendarDeleteEvent: (calendarId: string, eventId: string, etag?: string | null) => Promise<{ success: boolean; error?: string }>;
      onUpdateStatus: (callback: (message: string) => void) => () => void;
      onUpdateDownloaded: (callback: (version: string) => void) => () => void;
      ollamaStatus: () => Promise<{ available: boolean; models: string[] }>;
      ollamaAsk: (question: string, notes: unknown[], model?: string) => Promise<{ success: boolean; response?: string; relevantNoteIds?: string[]; error?: string }>;
    };
  }
}

export default function UpdateNotifier() {
  const [updateReady, setUpdateReady] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [status, setStatus] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const installTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const removeStatusListener = window.electronAPI.onUpdateStatus((message) => {
      setStatus(message);
    });

    const removeDownloadedListener = window.electronAPI.onUpdateDownloaded((version) => {
      setUpdateReady(true);
      setNewVersion(version);
      setDismissed(false);
    });

    // Se a atualização terminou de baixar antes desta tela existir, recupera o aviso.
    window.electronAPI.getPendingUpdate?.()
      .then((pending) => {
        if (!pending?.version) return;
        setUpdateReady(true);
        setNewVersion(pending.version);
      })
      .catch(() => undefined);

    return () => {
      removeStatusListener();
      removeDownloadedListener();
    };
  }, []);

  const stopInstalling = useCallback((message: string) => {
    if (installTimeoutRef.current) {
      clearTimeout(installTimeoutRef.current);
      installTimeoutRef.current = null;
    }
    setInstalling(false);
    setInstallError(message);
  }, []);

  const handleRestart = useCallback(async () => {
    if (!window.electronAPI) return;
    setInstalling(true);
    setInstallError('');

    // Em caso de sucesso o app encerra sozinho. Se isso não acontecer, devolve
    // o controle ao usuário em vez de deixar a janela travada.
    if (installTimeoutRef.current) clearTimeout(installTimeoutRef.current);
    installTimeoutRef.current = setTimeout(() => {
      installTimeoutRef.current = null;
      setInstalling(false);
      setInstallError('A atualização não foi concluída. Tente novamente ou feche e abra o app.');
    }, 20000);

    try {
      const result = await window.electronAPI.restartAndUpdate();
      if (result && result.success === false) {
        stopInstalling(result.error || 'Não foi possível iniciar a atualização.');
      }
    } catch (error) {
      stopInstalling('Não foi possível iniciar a atualização.');
      console.error('Falha ao instalar a atualização:', error);
    }
  }, [stopInstalling]);

  useEffect(() => () => {
    if (installTimeoutRef.current) clearTimeout(installTimeoutRef.current);
  }, []);

  // Foco inicial e Escape enquanto a janela de atualização está aberta.
  useEffect(() => {
    if (!updateReady || dismissed) return;
    confirmButtonRef.current?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !installing) setDismissed(true);
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [updateReady, dismissed, installing]);

  if (!window.electronAPI) return null;

  if (updateReady && !dismissed) {
    return (
      <div className="update-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        <div className="update-modal">
          <div className="update-modal-header">
            <span className="update-modal-icon" aria-hidden="true"><Sparkles size={20} /></span>
            <div>
              <h2 id="update-modal-title">Nova versão disponível</h2>
              <p>A versão <strong>{newVersion}</strong> foi baixada e está pronta.</p>
            </div>
            <button
              type="button"
              className="update-modal-close"
              onClick={() => setDismissed(true)}
              aria-label="Fechar e atualizar depois"
              disabled={installing}
            >
              <X size={18} />
            </button>
          </div>

          <div className="update-modal-body">
            <div className="update-modal-illustration" aria-hidden="true">
              <Sparkles size={32} />
            </div>
            <p className="update-modal-info">O app vai fechar, instalar a atualização e reabrir automaticamente.</p>
            <p className="update-modal-subinfo">Ao reabrir você verá o resumo completo das novidades.</p>
          </div>

          {installError && <p className="update-modal-error">{installError}</p>}

          <div className="update-modal-footer">
            <span className="update-modal-hint">Suas notas serão salvas antes de fechar.</span>
            <div className="update-modal-actions">
              <button type="button" className="update-modal-btn-secondary" onClick={() => setDismissed(true)} disabled={installing}>
                Depois
              </button>
              <button type="button" ref={confirmButtonRef} className="update-modal-btn-primary" onClick={handleRestart} disabled={installing}>
                <RefreshCw size={14} className={installing ? 'is-spinning' : undefined} />
                {installing ? 'Instalando...' : 'Atualizar agora'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Aviso discreto: reabre o modal quando o usuário adiou a atualização.
  if (updateReady && dismissed) {
    return (
      <button type="button" className="update-banner update-banner-action" onClick={() => setDismissed(false)}>
        <Download size={14} />
        <span>Atualização {newVersion} pronta para instalar</span>
      </button>
    );
  }

  if (status && !status.includes('mais recente') && !status.toLowerCase().includes('error') && !status.includes('HttpError') && !status.includes('406') && status.length < 120) {
    return (
      <div className="update-banner subtle">
        <span>{status}</span>
      </div>
    );
  }

  return null;
}
