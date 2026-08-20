import { Task } from './types';

export const REMINDER_SOUNDS = [
  { id: 'bell', name: 'Sino' },
  { id: 'chime', name: 'Chime' },
  { id: 'alert', name: 'Alerta' },
  { id: 'soft', name: 'Suave' },
  { id: 'urgent', name: 'Urgente' },
];

const audioCtxRef: { ctx: AudioContext | null } = { ctx: null };

function getAudioContext(): AudioContext {
  if (!audioCtxRef.ctx) {
    audioCtxRef.ctx = new AudioContext();
  }
  return audioCtxRef.ctx;
}

export function playSound(soundId: string): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0.4, ctx.currentTime);

  switch (soundId) {
    case 'bell':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.6);
      break;
    case 'chime':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523, ctx.currentTime);
      oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
      oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.4);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.8);
      break;
    case 'alert':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.2);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      break;
    case 'soft':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.8);
      break;
    case 'urgent':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(900, ctx.currentTime);
      oscillator.frequency.setValueAtTime(700, ctx.currentTime + 0.08);
      oscillator.frequency.setValueAtTime(900, ctx.currentTime + 0.16);
      oscillator.frequency.setValueAtTime(700, ctx.currentTime + 0.24);
      oscillator.frequency.setValueAtTime(900, ctx.currentTime + 0.32);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      break;
    default:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
  }
}

export function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Promise.resolve(Notification.permission);
}

export function showDesktopNotification(task: Task): void {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    const minutes = task.reminderMinutes ?? 0;
    const timeStr = task.dueTime ? ` às ${task.dueTime}` : '';
    const dateStr = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';

    const title = `⏰ ${task.title}`;

    let body = '';
    if (minutes > 0) {
      body = `Vence em ${minutes} minutos`;
    } else {
      body = `Vence agora`;
    }
    if (dateStr) body += ` • ${dateStr}${timeStr}`;
    if (task.description) body += `\n${task.description.slice(0, 100)}`;

    const priorityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta' };
    body += `\nPrioridade: ${priorityLabels[task.priority] || 'Média'}`;

    new Notification(title, {
      body,
      icon: '/vite.svg',
      tag: task.id,
      requireInteraction: true,
    });
  }
}

export interface ReminderDeliveryOptions {
  soundNotifications: boolean;
  desktopNotifications: boolean;
}

export function checkTaskReminders(
  tasks: Task[],
  onReminderFired: (taskId: string) => void,
  options: ReminderDeliveryOptions = { soundNotifications: true, desktopNotifications: true }
): void {
  const now = new Date();

  tasks.forEach((task) => {
    if (
      task.status === 'completed' ||
      task.reminderFired ||
      task.reminderMinutes === null ||
      !task.dueDate ||
      !task.dueTime
    ) {
      return;
    }

    // Calculate the reminder time
    const dueDateTime = new Date(`${task.dueDate}T${task.dueTime}:00`);
    const reminderMinutes = task.reminderMinutes ?? 0;
    const reminderTime = new Date(dueDateTime.getTime() - reminderMinutes * 60 * 1000);

    // Fire if we're past the reminder time but not more than 5 min past due
    const fiveMinAfterDue = new Date(dueDateTime.getTime() + 5 * 60 * 1000);
    if (now >= reminderTime && now < fiveMinAfterDue) {
      if (options.soundNotifications) playSound(task.reminderSound || 'bell');
      if (options.desktopNotifications) showDesktopNotification(task);
      onReminderFired(task.id);
    }
  });
}
