import { useState, useRef, useEffect } from 'react';
import { AppSettings, AppState } from '../types';
import { requestNotificationPermission } from '../notifications';
import { exportStateAsJson, parseBackupJson, exportAsMarkdown, exportAsEnex, exportAsHtmlBundle, importMarkdownFiles, importEnexFile, importHtmlFiles, downloadTextFile, ExportFile, ImportedNote, type BackupRestoreData } from '../backup';
import { getStorageEstimate, formatBytes, StorageEstimate } from '../storage';
import { getStateSizeBytes } from '../store';
import { Bell, CalendarDays, Check, Database, Download, FileText, FolderDown, FolderUp, HardDrive, Image, Monitor, Moon, RefreshCw, Settings as SettingsIcon, Sun, Upload, Volume2, Zap } from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  appState: AppState;
  onRestoreBackup: (data: BackupRestoreData) => void;
  onImportNotes: (notes: ImportedNote[]) => void;
  onSyncCalendar: () => Promise<{ synced: boolean; conflicts: number }>;
}

type CalendarConnectionStatus = { available: boolean; connected: boolean; clientIdConfigured: boolean };
type CalendarChoice = { id: string; summary: string; primary: boolean };

export default function Settings({ settings, onUpdateSettings, appState, onRestoreBackup, onImportNotes, onSyncCalendar }: Props) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [exportStatus, setExportStatus] = useState('');
  const [progress, setProgress] = useState<{ active: boolean; percent: number; label: string }>({ active: false, percent: 0, label: '' });
  const [importProgress, setImportProgress] = useState<{ active: boolean; percent: number; label: string }>({ active: false, percent: 0, label: '' });
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [calendarConnection, setCalendarConnection] = useState<CalendarConnectionStatus | null>(null);
  const [calendarChoices, setCalendarChoices] = useState<CalendarChoice[]>([]);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [calendarBusy, setCalendarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMdRef = useRef<HTMLInputElement>(null);
  const importEnexRef = useRef<HTMLInputElement>(null);
  const importHtmlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getStorageEstimate().then((estimate) => {
        if (!cancelled) setStorage(estimate);
      });
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [appState.notes.length, importProgress.active]);

  const dataSizeBytes = getStateSizeBytes(appState);

  function AutostartToggle() {
    const [autostart, setAutostart] = useState(false);
    useEffect(() => {
      window.electronAPI?.getAutostart().then(setAutostart).catch(() => {});
    }, []);
    return (
      <label className="settings-toggle-row">
        <div><strong>Iniciar com o Windows</strong><span>O app inicia minimizado na bandeja ao ligar o computador.</span></div>
        <input type="checkbox" checked={autostart} onChange={(e) => {
          const value = e.target.checked;
          window.electronAPI?.setAutostart(value).then(setAutostart).catch(() => {});
        }} />
      </label>
    );
  }
  const imageCount = appState.notes.reduce((total, note) => {
    const matches = note.content.match(/<img[^>]+src="data:image/gi);
    return total + (matches ? matches.length : 0);
  }, 0);

  const requestDesktopPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
  };

  const refreshCalendarConnection = async () => {
    const api = window.electronAPI;
    if (!api?.googleCalendarStatus) return;
    try {
      const status = await api.googleCalendarStatus();
      setCalendarConnection(status);
      if (status.connected) {
        const choices = await api.googleCalendarListCalendars();
        setCalendarChoices(choices);
      }
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível verificar a conexão com o Google Calendar.');
    }
  };

  useEffect(() => { void refreshCalendarConnection(); }, []);

  const handleCalendarConnect = async () => {
    const api = window.electronAPI;
    if (!api?.googleCalendarConnect) {
      setCalendarMessage('A conexão com o Google Calendar está disponível somente no aplicativo para Windows.');
      return;
    }
    if (!settings.googleCalendarClientId.trim()) {
      setCalendarMessage('Cole primeiro o ID de cliente criado para o aplicativo no Google Cloud.');
      return;
    }
    setCalendarBusy(true);
    setCalendarMessage('Abrindo o Google para você autorizar a conexão...');
    try {
      const status = await api.googleCalendarConnect(settings.googleCalendarClientId.trim());
      const choices = await api.googleCalendarListCalendars();
      const selected = choices.find((calendar) => calendar.id === settings.googleCalendarId)
        || choices.find((calendar) => calendar.primary)
        || choices[0];
      setCalendarConnection(status);
      setCalendarChoices(choices);
      onUpdateSettings({ googleCalendarEnabled: Boolean(selected), googleCalendarId: selected?.id || 'primary' });
      setCalendarMessage(selected ? `Conexão concluída. Os lembretes serão enviados para “${selected.summary}”.` : 'Conta conectada, mas nenhum calendário editável foi encontrado.');
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível conectar sua conta Google.');
    } finally {
      setCalendarBusy(false);
    }
  };

  const handleCalendarDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.googleCalendarDisconnect) return;
    setCalendarBusy(true);
    try {
      const status = await api.googleCalendarDisconnect();
      setCalendarConnection(status);
      setCalendarChoices([]);
      onUpdateSettings({ googleCalendarEnabled: false });
      setCalendarMessage('A conta Google foi desconectada deste computador. Seus eventos já existentes não foram apagados.');
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível desconectar a conta Google.');
    } finally {
      setCalendarBusy(false);
    }
  };

  const handleCalendarSync = async () => {
    setCalendarBusy(true);
    try {
      const result = await onSyncCalendar();
      setCalendarMessage(result.conflicts > 0
        ? `${result.conflicts} lembrete(s) removido(s) no Google foram preservados no app e precisam ser revisados.`
        : result.synced ? 'Lembretes sincronizados com o Google Calendar.' : 'Nada foi sincronizado. Verifique se a conexão e o calendário estão ativos.');
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível sincronizar os lembretes.');
    } finally {
      setCalendarBusy(false);
    }
  };

  const handleBackupDownload = async () => {
    const json = exportStateAsJson(appState);
    const date = new Date().toISOString().split('T')[0];
    if (window.electronAPI) {
      const result = await window.electronAPI.saveFile({
        content: json,
        defaultName: `notes-app-backup-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.success) {
        setExportStatus(`Backup salvo em: ${result.filePath}`);
        setTimeout(() => setExportStatus(''), 4000);
      }
    } else {
      downloadTextFile(json, `notes-app-backup-${date}.json`, 'application/json');
      setExportStatus('Backup salvo com sucesso!');
      setTimeout(() => setExportStatus(''), 3000);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const data = parseBackupJson(text);
      if (data) {
        if (confirm('Isso substituirá todos os dados atuais. Tem certeza?')) {
          onRestoreBackup(data);
          setExportStatus('Dados restaurados com sucesso!');
          setTimeout(() => setExportStatus(''), 3000);
        }
      } else {
        setExportStatus('Arquivo inválido. Use um backup gerado por este app.');
        setTimeout(() => setExportStatus(''), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportMarkdown = async () => {
    setProgress({ active: true, percent: 20, label: 'Gerando arquivos Markdown...' });
    const files = exportAsMarkdown(appState);
    setProgress({ active: true, percent: 60, label: `Salvando ${files.length} notas...` });
    if (window.electronAPI) {
      const folder = await window.electronAPI.selectFolder();
      if (!folder) { setProgress({ active: false, percent: 0, label: '' }); return; }
      const result = await window.electronAPI.saveFilesToFolder(folder, files);
      if (result.success) {
        setProgress({ active: true, percent: 100, label: `${result.count} notas exportadas em Markdown!` });
        setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
      }
    } else {
      downloadFilesAsZipOrFallback(files, 'notas-markdown');
      setProgress({ active: true, percent: 100, label: `${files.length} notas exportadas em Markdown!` });
      setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
    }
  };

  const handleExportEvernote = async () => {
    setProgress({ active: true, percent: 20, label: 'Gerando arquivo Evernote...' });
    const enex = exportAsEnex(appState);
    setProgress({ active: true, percent: 70, label: 'Salvando arquivo .enex...' });
    const date = new Date().toISOString().split('T')[0];
    if (window.electronAPI) {
      const result = await window.electronAPI.saveFile({
        content: enex,
        defaultName: `notas-evernote-${date}.enex`,
        filters: [{ name: 'Evernote Export', extensions: ['enex'] }],
      });
      if (result.success) {
        setProgress({ active: true, percent: 100, label: 'Exportação Evernote concluída!' });
        setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
      } else { setProgress({ active: false, percent: 0, label: '' }); }
    } else {
      downloadTextFile(enex, `notas-evernote-${date}.enex`, 'application/xml');
      setProgress({ active: true, percent: 100, label: 'Exportação Evernote concluída!' });
      setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
    }
  };

  const handleExportHtml = async () => {
    setProgress({ active: true, percent: 20, label: 'Gerando arquivos HTML...' });
    const files = exportAsHtmlBundle(appState);
    setProgress({ active: true, percent: 60, label: `Salvando ${files.length} notas...` });
    if (window.electronAPI) {
      const folder = await window.electronAPI.selectFolder();
      if (!folder) { setProgress({ active: false, percent: 0, label: '' }); return; }
      const result = await window.electronAPI.saveFilesToFolder(folder, files);
      if (result.success) {
        setProgress({ active: true, percent: 100, label: `${result.count} notas exportadas em HTML!` });
        setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
      }
    } else {
      downloadFilesAsZipOrFallback(files, 'notas-html');
      setProgress({ active: true, percent: 100, label: `${files.length} notas exportadas em HTML!` });
      setTimeout(() => setProgress({ active: false, percent: 0, label: '' }), 2500);
    }
  };

  const downloadFilesAsZipOrFallback = (files: ExportFile[], prefix: string) => {
    if (files.length <= 5) {
      files.forEach((file) => {
        const ext = file.path.endsWith('.md') ? 'text/markdown' : 'text/html';
        downloadTextFile(file.content, file.path.replace(/\//g, '_'), ext);
      });
    } else {
      const bundle = files.map((f) => `===== ${f.path} =====\n${f.content}`).join('\n\n');
      const ext = files[0]?.path.endsWith('.md') ? 'md' : 'html';
      downloadTextFile(bundle, `${prefix}-${new Date().toISOString().split('T')[0]}.${ext}`, 'text/plain');
    }
  };

  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const total = fileList.length;
    setImportProgress({ active: true, percent: 0, label: `Importando 0/${total} arquivos Markdown...` });
    const files: { name: string; content: string }[] = [];
    let loaded = 0;
    for (let i = 0; i < total; i++) {
      const file = fileList[i];
      const reader = new FileReader();
      reader.onload = () => {
        files.push({ name: file.name, content: reader.result as string });
        loaded++;
        setImportProgress({ active: true, percent: Math.round((loaded / total) * 90), label: `Lendo ${loaded}/${total} arquivos...` });
        if (loaded === total) {
          setImportProgress({ active: true, percent: 95, label: 'Processando notas...' });
          setTimeout(() => {
            const imported = importMarkdownFiles(files);
            onImportNotes(imported);
            setImportProgress({ active: true, percent: 100, label: `${imported.length} nota${imported.length > 1 ? 's' : ''} importada${imported.length > 1 ? 's' : ''}!` });
            setTimeout(() => setImportProgress({ active: false, percent: 0, label: '' }), 2500);
          }, 100);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleImportEnex = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress({ active: true, percent: 10, label: `Lendo ${file.name}...` });
    const reader = new FileReader();
    reader.onload = () => {
      setImportProgress({ active: true, percent: 50, label: 'Processando notas do Evernote...' });
      setTimeout(() => {
        const imported = importEnexFile(reader.result as string, file.name);
        setImportProgress({ active: true, percent: 90, label: `Importando ${imported.length} notas...` });
        setTimeout(() => {
          onImportNotes(imported);
          setImportProgress({ active: true, percent: 100, label: `${imported.length} nota${imported.length > 1 ? 's' : ''} importada${imported.length > 1 ? 's' : ''} do Evernote!` });
          setTimeout(() => setImportProgress({ active: false, percent: 0, label: '' }), 2500);
        }, 100);
      }, 100);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const total = fileList.length;
    setImportProgress({ active: true, percent: 0, label: `Importando 0/${total} arquivos HTML...` });
    const files: { name: string; content: string }[] = [];
    let loaded = 0;
    for (let i = 0; i < total; i++) {
      const file = fileList[i];
      const reader = new FileReader();
      reader.onload = () => {
        files.push({ name: file.name, content: reader.result as string });
        loaded++;
        setImportProgress({ active: true, percent: Math.round((loaded / total) * 90), label: `Lendo ${loaded}/${total} arquivos...` });
        if (loaded === total) {
          setImportProgress({ active: true, percent: 95, label: 'Processando notas...' });
          setTimeout(() => {
            const imported = importHtmlFiles(files);
            onImportNotes(imported);
            setImportProgress({ active: true, percent: 100, label: `${imported.length} nota${imported.length > 1 ? 's' : ''} importada${imported.length > 1 ? 's' : ''}!` });
            setTimeout(() => setImportProgress({ active: false, percent: 0, label: '' }), 2500);
          }, 100);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div className="settings-page-icon"><SettingsIcon size={24} /></div>
        <div><h1>Configurações</h1><p>Personalize o funcionamento do seu aplicativo.</p></div>
      </header>

      <section className="settings-section">
        <div className="settings-section-heading"><Monitor size={18} /><div><h2>Aparência</h2><p>Escolha o tema visual mais confortável.</p></div></div>
        <div className="settings-choice-grid">
          <button className={`settings-choice ${settings.theme === 'dark' ? 'selected' : ''}`} onClick={() => onUpdateSettings({ theme: 'dark' })}>
            <Moon size={18} /><span>Escuro</span>{settings.theme === 'dark' && <Check size={16} />}
          </button>
          <button className={`settings-choice ${settings.theme === 'light' ? 'selected' : ''}`} onClick={() => onUpdateSettings({ theme: 'light' })}>
            <Sun size={18} /><span>Claro</span>{settings.theme === 'light' && <Check size={16} />}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><FileText size={18} /><div><h2>Novas notas</h2><p>Defina onde as próximas notas serão criadas.</p></div></div>
        <label className="settings-select-label">Local padrão
          <select className="settings-select" value={settings.newNoteLocation} onChange={(e) => onUpdateSettings({ newNoteLocation: e.target.value as AppSettings['newNoteLocation'] })}>
            <option value="current-notebook">No caderno aberto</option>
            <option value="inbox">Sem caderno</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><Bell size={18} /><div><h2>Lembretes e notificações</h2><p>Controle como as tarefas avisam você.</p></div></div>
        <label className="settings-toggle-row">
          <div><strong>Ativar lembretes de tarefas</strong><span>Verifica os horários de vencimento das suas tarefas.</span></div>
          <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => onUpdateSettings({ remindersEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Notificações no Windows</strong><span>Mostra um aviso na área de trabalho quando houver um lembrete.</span></div>
          <input type="checkbox" checked={settings.desktopNotifications} disabled={!settings.remindersEnabled} onChange={(e) => onUpdateSettings({ desktopNotifications: e.target.checked })} />
        </label>
        <div className="settings-notification-permission">
          <span>Permissão do navegador: <strong>{notificationPermission === 'granted' ? 'permitida' : notificationPermission === 'denied' ? 'bloqueada' : notificationPermission === 'unsupported' ? 'não disponível' : 'não solicitada'}</strong></span>
          {notificationPermission === 'default' && <button className="settings-small-btn" onClick={requestDesktopPermission}>Permitir notificações</button>}
        </div>
        <label className="settings-toggle-row">
          <div><strong>Som dos lembretes</strong><span>Reproduz o som escolhido para cada tarefa.</span></div>
          <input type="checkbox" checked={settings.soundNotifications} disabled={!settings.remindersEnabled} onChange={(e) => onUpdateSettings({ soundNotifications: e.target.checked })} />
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><CalendarDays size={18} /><div><h2>Google Calendar</h2><p>Envie lembretes escolhidos para a sua agenda e receba mudanças feitas por lá.</p></div></div>
        {!window.electronAPI?.googleCalendarStatus ? (
          <p className="settings-backup-hint">A conexão com o Google Calendar é configurada no aplicativo para Windows.</p>
        ) : (
          <>
            <label className="settings-select-label">ID de conexão do Google
              <input
                className="settings-select"
                value={settings.googleCalendarClientId}
                onChange={(event) => onUpdateSettings({ googleCalendarClientId: event.target.value.trim() })}
                placeholder="...apps.googleusercontent.com"
                spellCheck={false}
              />
            </label>
            <p className="settings-backup-hint">Este identificador não dá acesso às suas notas. A autorização da sua conta fica protegida apenas neste computador e não entra no backup.</p>

            {calendarConnection?.connected ? (
              <div className="settings-backup-actions">
                <button className="settings-action-btn" onClick={handleCalendarDisconnect} disabled={calendarBusy}>Desconectar conta</button>
                <button className="settings-action-btn" onClick={handleCalendarSync} disabled={calendarBusy || !settings.googleCalendarEnabled}>
                  <RefreshCw size={16} /> Sincronizar agora
                </button>
              </div>
            ) : (
              <button className="settings-action-btn" onClick={handleCalendarConnect} disabled={calendarBusy || calendarConnection?.available === false}>
                <CalendarDays size={16} /> {calendarBusy ? 'Aguardando autorização...' : 'Conectar conta Google'}
              </button>
            )}

            {calendarConnection?.connected && (
              <>
                <label className="settings-select-label">Calendário usado para os lembretes
                  <select
                    className="settings-select"
                    value={settings.googleCalendarId}
                    onChange={(event) => onUpdateSettings({ googleCalendarId: event.target.value })}
                  >
                    {calendarChoices.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.primary ? `${calendar.summary} (principal)` : calendar.summary}</option>)}
                  </select>
                </label>
                <label className="settings-toggle-row">
                  <div><strong>Ativar conexão com o Google Calendar</strong><span>Permite que o app envie e receba atualizações dos lembretes selecionados.</span></div>
                  <input type="checkbox" checked={settings.googleCalendarEnabled} onChange={(event) => onUpdateSettings({ googleCalendarEnabled: event.target.checked })} />
                </label>
                <label className="settings-toggle-row">
                  <div><strong>Sincronizar todas as tarefas pendentes</strong><span>Enquanto estiver ligado, envia todas as tarefas pendentes, mesmo as que não foram marcadas individualmente.</span></div>
                  <input type="checkbox" checked={settings.googleCalendarSyncAllActiveTasks} disabled={!settings.googleCalendarEnabled} onChange={(event) => onUpdateSettings({ googleCalendarSyncAllActiveTasks: event.target.checked })} />
                </label>
                <label className="settings-toggle-row">
                  <div><strong>Sincronizar novas tarefas por padrão</strong><span>Ao criar um novo lembrete, a opção individual de sincronizar com a agenda já vem marcada.</span></div>
                  <input type="checkbox" checked={settings.googleCalendarSyncNewTasks} disabled={!settings.googleCalendarEnabled} onChange={(event) => onUpdateSettings({ googleCalendarSyncNewTasks: event.target.checked })} />
                </label>
                {appState.tasks.some((task) => task.calendarSyncState === 'remote-deleted') && (
                  <p className="settings-backup-hint">Há lembretes apagados no Google Calendar que foram preservados aqui. Edite cada tarefa para recriá-la na agenda ou exclua-a se ela não for mais necessária.</p>
                )}
              </>
            )}
            {calendarMessage && <p className="settings-export-status">{calendarMessage}</p>}
          </>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><Database size={18} /><div><h2>Armazenamento</h2><p>Espaço utilizado pelas suas notas, imagens e anexos.</p></div></div>
        <div className="storage-stats">
          <div className="storage-stat">
            <span className="storage-stat-label">Dados das notas</span>
            <strong>{formatBytes(dataSizeBytes)}</strong>
          </div>
          <div className="storage-stat">
            <span className="storage-stat-label">Notas</span>
            <strong>{appState.notes.filter((n) => n.status === 'active').length}</strong>
          </div>
          <div className="storage-stat">
            <span className="storage-stat-label"><Image size={11} /> Imagens</span>
            <strong>{imageCount}</strong>
          </div>
          <div className="storage-stat">
            <span className="storage-stat-label">Cadernos</span>
            <strong>{appState.notebooks.length}</strong>
          </div>
        </div>
        {storage?.supported && storage.quotaBytes > 0 && (
          <div className="storage-quota">
            <div className="storage-quota-bar">
              <div
                className={`storage-quota-fill ${storage.percentUsed > 85 ? 'is-critical' : storage.percentUsed > 65 ? 'is-warning' : ''}`}
                style={{ width: `${Math.max(storage.percentUsed, 0.5)}%` }}
              />
            </div>
            <span className="storage-quota-label">
              {formatBytes(storage.usedBytes)} de {formatBytes(storage.quotaBytes)} disponíveis
              {' · '}
              {storage.percentUsed < 1 ? 'menos de 1%' : `${storage.percentUsed.toFixed(1)}%`} utilizado
            </span>
          </div>
        )}
        {storage && !storage.supported && (
          <p className="settings-backup-hint">Seu navegador não informa o espaço disponível, mas os dados estão sendo salvos normalmente.</p>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><HardDrive size={18} /><div><h2>Backup e restauração</h2><p>Salve seus dados para não perder nada.</p></div></div>
        <div className="settings-backup-actions">
          <button className="settings-action-btn" onClick={handleBackupDownload}>
            <Download size={16} /> Baixar backup completo (JSON)
          </button>
          <button className="settings-action-btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Restaurar backup
          </button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleRestoreFile} />
        </div>
        <p className="settings-backup-hint">
          O backup inclui as imagens incorporadas nas notas e verifica sua integridade na restauração. Imagens por link externo não são copiadas. Baixe um backup periodicamente para maior segurança.
        </p>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><FolderDown size={18} /><div><h2>Exportar notas</h2><p>Exporte suas notas em formatos compatíveis com outros aplicativos.</p></div></div>
        <div className="settings-export-grid">
          <button className="settings-export-btn" onClick={handleExportMarkdown}>
            <FileText size={20} />
            <strong>Markdown</strong>
            <span>Obsidian, Notion, Joplin, VS Code</span>
          </button>
          <button className="settings-export-btn" onClick={handleExportEvernote}>
            <FileText size={20} />
            <strong>Evernote (.enex)</strong>
            <span>Importar direto no Evernote</span>
          </button>
          <button className="settings-export-btn" onClick={handleExportHtml}>
            <FileText size={20} />
            <strong>HTML</strong>
            <span>Abrir em qualquer navegador</span>
          </button>
        </div>
        {exportStatus && <p className="settings-export-status">{exportStatus}</p>}
        {progress.active && (
          <div className="settings-progress-container">
            <div className="settings-progress-bar">
              <div className="settings-progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="settings-progress-label">{progress.label}</span>
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><FolderUp size={18} /><div><h2>Importar notas</h2><p>Traga notas de outros aplicativos para cá.</p></div></div>
        <div className="settings-export-grid">
          <button className="settings-export-btn" onClick={() => importMdRef.current?.click()}>
            <FileText size={20} />
            <strong>Markdown (.md)</strong>
            <span>Obsidian, Notion, Joplin, VS Code</span>
          </button>
          <button className="settings-export-btn" onClick={() => importEnexRef.current?.click()}>
            <FileText size={20} />
            <strong>Evernote (.enex)</strong>
            <span>Exportação do Evernote</span>
          </button>
          <button className="settings-export-btn" onClick={() => importHtmlRef.current?.click()}>
            <FileText size={20} />
            <strong>HTML (.html)</strong>
            <span>Páginas ou exportações HTML</span>
          </button>
        </div>
        <input ref={importMdRef} type="file" accept=".md" multiple style={{ display: 'none' }} onChange={handleImportMarkdown} />
        <input ref={importEnexRef} type="file" accept=".enex" style={{ display: 'none' }} onChange={handleImportEnex} />
        <input ref={importHtmlRef} type="file" accept=".html,.htm" multiple style={{ display: 'none' }} onChange={handleImportHtml} />
        {importProgress.active && (
          <div className="settings-progress-container">
            <div className="settings-progress-bar">
              <div className="settings-progress-fill" style={{ width: `${importProgress.percent}%` }} />
            </div>
            <span className="settings-progress-label">{importProgress.label}</span>
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><Zap size={18} /><div><h2>Recursos</h2><p>Ative ou desative funcionalidades do aplicativo.</p></div></div>
        {window.electronAPI?.getAutostart && (
          <AutostartToggle />
        )}
        <label className="settings-toggle-row">
          <div><strong>Busca com preview</strong><span>Mostra trechos destacados nos resultados da busca.</span></div>
          <input type="checkbox" checked={settings.searchPreviewEnabled} onChange={(e) => onUpdateSettings({ searchPreviewEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Templates de notas</strong><span>Permite criar notas a partir de modelos (Ctrl+T).</span></div>
          <input type="checkbox" checked={settings.templatesEnabled} onChange={(e) => onUpdateSettings({ templatesEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Arrastar notas entre cadernos</strong><span>Arraste notas na sidebar para mover entre cadernos.</span></div>
          <input type="checkbox" checked={settings.dragDropEnabled} onChange={(e) => onUpdateSettings({ dragDropEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Atalhos de teclado</strong><span>Ctrl+N nova nota, Ctrl+Shift+N nota rápida, Ctrl+Shift+F busca, Ctrl+1/2/3 navegar.</span></div>
          <input type="checkbox" checked={settings.keyboardShortcutsEnabled} onChange={(e) => onUpdateSettings({ keyboardShortcutsEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Contagem de palavras</strong><span>Exibe palavras e caracteres no rodapé do editor.</span></div>
          <input type="checkbox" checked={settings.wordCountEnabled} onChange={(e) => onUpdateSettings({ wordCountEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Nota rápida</strong><span>Janela flutuante para anotar rapidamente (Ctrl+Shift+N).</span></div>
          <input type="checkbox" checked={settings.quickNoteEnabled} onChange={(e) => onUpdateSettings({ quickNoteEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Links entre notas</strong><span>Permite criar referências para outras notas com [[título]].</span></div>
          <input type="checkbox" checked={settings.noteLinksEnabled} onChange={(e) => onUpdateSettings({ noteLinksEnabled: e.target.checked })} />
        </label>
        <label className="settings-toggle-row">
          <div><strong>Resumo automático</strong><span>Gera um resumo curto da nota automaticamente.</span></div>
          <input type="checkbox" checked={settings.autoSummaryEnabled} onChange={(e) => onUpdateSettings({ autoSummaryEnabled: e.target.checked })} />
        </label>
      </section>

      <section className="settings-section settings-info-section">
        <div className="settings-section-heading"><Volume2 size={18} /><div><h2>Sobre</h2><p>Informações do aplicativo.</p></div></div>
        <span className="settings-version">Notes App • versão 1.0.0</span>
      </section>
    </main>
  );
}
