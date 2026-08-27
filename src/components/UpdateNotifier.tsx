import { useState, useEffect } from 'react';
import { Download, X, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      checkForUpdates: () => Promise<string>;
      restartAndUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      saveFile: (options: { content: string; defaultName: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ success: boolean; filePath?: string }>;
      selectFolder: () => Promise<string | null>;
      saveFilesToFolder: (folder: string, files: { path: string; content: string }[]) => Promise<{ success: boolean; count?: number; error?: string }>;
      getBackupPath: () => Promise<string>;
      onUpdateStatus: (callback: (message: string) => void) => () => void;
      onUpdateDownloaded: (callback: (version: string) => void) => () => void;
    };
  }
}

export default function UpdateNotifier() {
  const [updateReady, setUpdateReady] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [status, setStatus] = useState('');
  const [dismissed, setDismissed] = useState(false);

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

    return () => {
      removeStatusListener();
      removeDownloadedListener();
    };
  }, []);

  const handleRestart = () => {
    if (window.electronAPI) {
      window.electronAPI.restartAndUpdate();
    }
  };

  if (!window.electronAPI) return null;
  if (dismissed) return null;

  if (updateReady) {
    return (
      <div className="update-banner">
        <Download size={14} />
        <span>Nova versão v{newVersion} disponível!</span>
        <button className="update-banner-btn" onClick={handleRestart}>
          <RefreshCw size={12} /> Reiniciar e atualizar
        </button>
        <button className="update-banner-close" onClick={() => setDismissed(true)}>
          <X size={12} />
        </button>
      </div>
    );
  }

  if (status && !status.includes('mais recente') && !status.toLowerCase().includes('error') && !status.includes('HttpError') && !status.includes('406')) {
    return (
      <div className="update-banner subtle">
        <span>{status}</span>
      </div>
    );
  }

  return null;
}
