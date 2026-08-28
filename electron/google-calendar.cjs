const { safeStorage, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API_URL = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_FILE = 'google-calendar-auth.bin';
const DELETION_QUEUE_FILE = 'google-calendar-deletions.json';
const AUTH_TIMEOUT_MS = 2 * 60 * 1000;
const EVENT_DURATION_MINUTES = 30;

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isValidClientId(clientId) {
  return typeof clientId === 'string' && /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId.trim());
}

function isValidCalendarId(calendarId) {
  return typeof calendarId === 'string' && calendarId.length > 0 && calendarId.length <= 512;
}

function asForm(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== null)).toString();
}

function dateValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function dateAfter(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return formatLocalDateTime(date).slice(0, 10);
}

function eventBodyFromTask(task) {
  const privateProperties = {
    notesAppManaged: 'true',
    notesAppTaskId: task.id,
    notesAppTaskStatus: task.status,
  };
  const description = [
    task.description || '',
    `Prioridade: ${task.priority === 'high' ? 'alta' : task.priority === 'low' ? 'baixa' : 'média'}`,
  ].filter(Boolean).join('\n\n');
  const body = {
    summary: task.status === 'completed' ? `✓ ${task.title}` : task.title,
    description,
    extendedProperties: { private: privateProperties },
  };

  if (task.dueTime) {
    const start = `${task.dueDate}T${task.dueTime}:00`;
    const end = new Date(new Date(start).getTime() + EVENT_DURATION_MINUTES * 60 * 1000);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    body.start = { dateTime: start, timeZone };
    body.end = { dateTime: formatLocalDateTime(end), timeZone };
  } else {
    body.start = { date: task.dueDate };
    body.end = { date: dateAfter(task.dueDate) };
  }

  return body;
}

function eventStillMatchesTask(event, task) {
  const expected = eventBodyFromTask(task);
  const currentStart = event.start?.date || event.start?.dateTime?.slice(0, 16);
  const expectedStart = expected.start.date || expected.start.dateTime.slice(0, 16);
  return event.summary === expected.summary
    && (event.description || '') === expected.description
    && currentStart === expectedStart
    && event.extendedProperties?.private?.notesAppTaskStatus === task.status;
}

function taskChangesFromEvent(task, event, calendarId) {
  const start = event.start || {};
  const dateTime = typeof start.dateTime === 'string' ? start.dateTime : null;
  const remoteDescription = (event.description || '').replace(/\n\nPrioridade: (alta|média|baixa)$/u, '');
  return {
    ...task,
    title: (event.summary || task.title).replace(/^✓\s*/, ''),
    description: remoteDescription,
    dueDate: start.date || (dateTime ? dateTime.slice(0, 10) : task.dueDate),
    dueTime: dateTime ? dateTime.slice(11, 16) : null,
    updatedAt: event.updated || new Date().toISOString(),
    calendarId,
    calendarEventId: event.id,
    calendarEtag: event.etag || null,
    calendarLastSyncedAt: new Date().toISOString(),
    calendarRemoteDeletedAt: null,
    calendarSyncState: 'synced',
  };
}

function createGoogleCalendarService(userDataPath) {
  const authFilePath = path.join(userDataPath, AUTH_FILE);
  const deletionQueuePath = path.join(userDataPath, DELETION_QUEUE_FILE);

  function readDeletionQueue() {
    try {
      const queued = JSON.parse(fs.readFileSync(deletionQueuePath, 'utf-8'));
      return Array.isArray(queued) ? queued.filter((entry) => entry && typeof entry.calendarId === 'string' && typeof entry.eventId === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeDeletionQueue(entries) {
    fs.writeFileSync(deletionQueuePath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  function queueDeletion(calendarId, eventId, etag) {
    const queue = readDeletionQueue().filter((entry) => entry.calendarId !== calendarId || entry.eventId !== eventId);
    queue.push({ calendarId, eventId, etag: etag || null });
    writeDeletionQueue(queue);
  }

  function clearQueuedDeletion(calendarId, eventId) {
    const next = readDeletionQueue().filter((entry) => entry.calendarId !== calendarId || entry.eventId !== eventId);
    writeDeletionQueue(next);
  }

  function readAuth() {
    if (!fs.existsSync(authFilePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O armazenamento seguro do Windows não está disponível para proteger a conexão com o Google.');
    }
    try {
      const encrypted = fs.readFileSync(authFilePath);
      return JSON.parse(safeStorage.decryptString(encrypted));
    } catch {
      try { fs.unlinkSync(authFilePath); } catch {}
      return null;
    }
  }

  function writeAuth(auth) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O armazenamento seguro do Windows não está disponível para proteger a conexão com o Google.');
    }
    fs.writeFileSync(authFilePath, safeStorage.encryptString(JSON.stringify(auth)));
  }

  function getStatus() {
    const auth = readAuth();
    return {
      available: safeStorage.isEncryptionAvailable(),
      connected: Boolean(auth?.refreshToken),
      clientIdConfigured: Boolean(auth?.clientId),
    };
  }

  async function tokenRequest(values) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: asForm(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || 'Não foi possível autorizar a conexão com o Google.');
    }
    return payload;
  }

  async function accessToken() {
    const auth = readAuth();
    if (!auth?.refreshToken || !auth?.clientId) {
      throw new Error('Conecte uma conta Google antes de sincronizar.');
    }
    const refreshed = await tokenRequest({
      client_id: auth.clientId,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    });
    return refreshed.access_token;
  }

  async function request(endpoint, options = {}) {
    const token = await accessToken();
    const response = await fetch(`${GOOGLE_API_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.ifMatch ? { 'If-Match': options.ifMatch } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || 'O Google Calendar recusou a sincronização.');
    }
    return payload;
  }

  async function waitForAuthorizationCode(server, expectedState) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('O tempo para confirmar a conta Google terminou. Tente conectar novamente.')), AUTH_TIMEOUT_MS);
      const finish = (error, code) => {
        clearTimeout(timeout);
        server.close();
        if (error) reject(error);
        else resolve(code);
      };
      server.on('request', (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/google-calendar-callback') {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (error || state !== expectedState || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h2>Conexão não concluída</h2><p>Você pode fechar esta janela e tentar novamente no Notes App.</p>');
          finish(new Error(error === 'access_denied' ? 'A permissão do Google não foi concedida.' : 'A resposta de autorização do Google não é válida.'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Conta conectada</h2><p>Você já pode fechar esta janela e voltar ao Notes App.</p>');
        finish(null, code);
      });
    });
  }

  async function connect(clientId) {
    if (!isValidClientId(clientId)) {
      throw new Error('Informe um ID de cliente OAuth para aplicativo de computador criado no Google Cloud.');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O Windows não disponibilizou o armazenamento seguro para guardar esta conexão.');
    }

    const verifier = base64Url(crypto.randomBytes(64));
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64Url(crypto.randomBytes(32));
    const server = http.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}/google-calendar-callback`;
    const authorization = new URL(GOOGLE_AUTH_URL);
    authorization.search = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    const codePromise = waitForAuthorizationCode(server, state);
    await shell.openExternal(authorization.toString());
    const code = await codePromise;
    const tokens = await tokenRequest({
      client_id: clientId.trim(),
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!tokens.refresh_token) {
      throw new Error('O Google não forneceu uma autorização permanente. Remova o acesso do Notes App na sua conta Google e tente novamente.');
    }
    writeAuth({ clientId: clientId.trim(), refreshToken: tokens.refresh_token });
    return getStatus();
  }

  async function disconnect() {
    try { fs.unlinkSync(authFilePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return getStatus();
  }

  async function listCalendars() {
    const result = await request('/users/me/calendarList?minAccessRole=writer');
    return (result.items || []).map((calendar) => ({
      id: calendar.id,
      summary: calendar.summary || calendar.id,
      primary: calendar.primary === true,
    }));
  }

  async function deleteEvent(calendarId, eventId, etag = null, shouldQueueOnFailure = true) {
    if (!isValidCalendarId(calendarId) || !eventId) return { success: true };
    try {
      await request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', ifMatch: etag || undefined });
      clearQueuedDeletion(calendarId, eventId);
      return { success: true };
    } catch (error) {
      // Conflitos precisam ser revisados, não repetidos cegamente; indisponibilidade de rede entra na fila local.
      if (shouldQueueOnFailure && !/precondition|etag|412/i.test(error.message || '')) {
        queueDeletion(calendarId, eventId, etag);
      }
      return { success: false, error: error.message };
    }
  }

  async function flushDeletionQueue() {
    const queue = readDeletionQueue();
    for (const entry of queue) {
      await deleteEvent(entry.calendarId, entry.eventId, entry.etag, false);
    }
  }

  async function listManagedEvents(calendarId) {
    const events = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({
        privateExtendedProperty: 'notesAppManaged=true',
        showDeleted: 'true',
        maxResults: '2500',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const result = await request(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
      events.push(...(result.items || []));
      pageToken = result.nextPageToken || null;
    } while (pageToken);
    return events;
  }

  async function sync(tasks, calendarId, syncAllActiveTasks = false) {
    if (!Array.isArray(tasks)) throw new Error('As tarefas enviadas para sincronização são inválidas.');
    if (!isValidCalendarId(calendarId)) throw new Error('Escolha o calendário que receberá os lembretes.');

    await flushDeletionQueue();
    const events = await listManagedEvents(calendarId);
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const eventsByTaskId = new Map(events
      .filter((event) => event.extendedProperties?.private?.notesAppTaskId)
      .map((event) => [event.extendedProperties.private.notesAppTaskId, event]));
    const resultTasks = [];
    const conflicts = [];

    for (const originalTask of tasks) {
      let task = { ...originalTask };
      const shouldSync = task.calendarSyncEnabled || (syncAllActiveTasks === true && task.status === 'pending');
      if (!shouldSync) {
        resultTasks.push(task);
        continue;
      }

      // Ao trocar o calendário nas configurações, move o evento em vez de deixá-lo duplicado.
      if (task.calendarId && task.calendarId !== calendarId && task.calendarEventId) {
        const removal = await deleteEvent(task.calendarId, task.calendarEventId, task.calendarEtag);
        if (!removal.success) {
          resultTasks.push({ ...task, calendarSyncState: 'error' });
          continue;
        }
        task = { ...task, calendarId: null, calendarEventId: null, calendarEtag: null, calendarLastSyncedAt: null };
      }

      let event = (task.calendarEventId && eventsById.get(task.calendarEventId)) || eventsByTaskId.get(task.id);
      if (!task.dueDate) {
        if (event && event.status !== 'cancelled') await deleteEvent(calendarId, event.id, task.calendarEtag);
        resultTasks.push({ ...task, calendarId: null, calendarEventId: null, calendarEtag: null, calendarLastSyncedAt: new Date().toISOString(), calendarSyncState: 'idle' });
        continue;
      }

      if (event?.status === 'cancelled') {
        const deletedAt = event.updated || new Date().toISOString();
        const changedLocallyAfterDelete = dateValue(task.updatedAt) > dateValue(deletedAt);
        if (!changedLocallyAfterDelete) {
          conflicts.push({ taskId: task.id, type: 'deleted-remotely' });
          resultTasks.push({ ...task, calendarId, calendarEventId: null, calendarEtag: null, calendarRemoteDeletedAt: deletedAt, calendarLastSyncedAt: new Date().toISOString(), calendarSyncState: 'remote-deleted' });
          continue;
        }
        event = null;
      }

      if (event) {
        if (!eventStillMatchesTask(event, task) && dateValue(event.updated) > dateValue(task.updatedAt)) {
          resultTasks.push(taskChangesFromEvent(task, event, calendarId));
          continue;
        }
        if (!eventStillMatchesTask(event, task)) {
          event = await request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: eventBodyFromTask(task), ifMatch: task.calendarEtag || undefined });
        }
        resultTasks.push({ ...task, calendarId, calendarEventId: event.id, calendarEtag: event.etag || null, calendarLastSyncedAt: new Date().toISOString(), calendarRemoteDeletedAt: null, calendarSyncState: 'synced' });
        continue;
      }

      if (task.calendarRemoteDeletedAt && dateValue(task.calendarRemoteDeletedAt) >= dateValue(task.updatedAt)) {
        resultTasks.push(task);
        continue;
      }

      const created = await request(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: eventBodyFromTask(task) });
      resultTasks.push({ ...task, calendarId, calendarEventId: created.id, calendarEtag: created.etag || null, calendarLastSyncedAt: new Date().toISOString(), calendarRemoteDeletedAt: null, calendarSyncState: 'synced' });
    }

    return { tasks: resultTasks, conflicts, syncedAt: new Date().toISOString() };
  }

  return { getStatus, connect, disconnect, listCalendars, deleteEvent, sync };
}

module.exports = { createGoogleCalendarService };
