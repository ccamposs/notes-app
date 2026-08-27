import { Cloud, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';
import { SyncStatus as SyncStatusData } from '../sync';

interface Props {
  status: SyncStatusData;
  onRetry: () => void;
}

export default function SyncStatus({ status, onRetry }: Props) {
  const lastSync = status.lastSyncedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(status.lastSyncedAt)
    : null;

  if (status.phase === 'synced') {
    return (
      <div className="sync-status is-synced" title={lastSync ? `Sincronizado às ${lastSync}` : 'Sincronizado'}>
        <Cloud size={14} />
        <span>Sincronizado{lastSync ? ` às ${lastSync}` : ''}</span>
      </div>
    );
  }

  if (status.phase === 'connecting' || status.phase === 'syncing') {
    return (
      <div className="sync-status is-syncing" title="Conectando ao serviço de sincronização local">
        <LoaderCircle size={14} className="sync-status-spinner" />
        <span>{status.phase === 'syncing' ? 'Sincronizando…' : 'Conectando…'}</span>
      </div>
    );
  }

  return (
    <button className="sync-status is-offline" onClick={onRetry} title={status.message || 'Tentar conectar ao serviço local'}>
      <CloudOff size={14} />
      <span>{status.pendingChanges ? 'Alterações pendentes' : 'Sincronização offline'}</span>
      <RefreshCw size={12} />
    </button>
  );
}
