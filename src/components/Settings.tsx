import { useState } from 'react';
import { AppSettings } from '../types';
import { requestNotificationPermission } from '../notifications';
import { Bell, Check, FileText, Monitor, Moon, Settings as SettingsIcon, Sun, Volume2 } from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

export default function Settings({ settings, onUpdateSettings }: Props) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  );

  const requestDesktopPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
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

      <section className="settings-section settings-info-section">
        <div className="settings-section-heading"><Volume2 size={18} /><div><h2>Dados do aplicativo</h2><p>As notas, tarefas e preferências são salvas automaticamente neste dispositivo.</p></div></div>
        <span className="settings-version">Notes App • versão 1.0.0</span>
      </section>
    </main>
  );
}
