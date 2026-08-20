import { useState, useEffect } from 'react';
import { Download, X, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      checkForUpdates: () => Promise<string>;
      restartAndUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      onUpdateStatus: (callback: (message: string) => void) => void;
      onUpdateDownloaded: (callback: (version: string) => void) => void;
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

    window.electronAPI.onUpdateStatus((message) => {
      setStatus(message);
    });

    window.electronAPI.onUpdateDownloaded((version) => {
      setUpdateReady(true);
      setNewVersion(version);
      setDismissed(false);
    });
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
