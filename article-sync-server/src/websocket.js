const { WebSocketServer } = require('ws');
const store = require('./store');

const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    clients.set(clientId, { ws, subscriptions: new Set(), extensionId: null });

    ws.send(JSON.stringify({ type: 'connected', data: { clientId } }));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid JSON' } }));
        return;
      }
      handleMessage(clientId, msg);
    });

    ws.on('close', () => {
      const client = clients.get(clientId);
      if (client && client.extensionId && store.heartbeats[client.extensionId]) {
        store.heartbeats[client.extensionId].status = 'offline';
      }
      clients.delete(clientId);
    });

    ws.on('error', () => {
      clients.delete(clientId);
    });
  });

  return wss;
}

function handleMessage(clientId, msg) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case 'subscribe':
      if (Array.isArray(msg.channels)) {
        msg.channels.forEach(ch => client.subscriptions.add(ch));
      }
      client.ws.send(JSON.stringify({ type: 'subscribed', data: { channels: Array.from(client.subscriptions) } }));
      break;

    case 'unsubscribe':
      if (Array.isArray(msg.channels)) {
        msg.channels.forEach(ch => client.subscriptions.delete(ch));
      }
      client.ws.send(JSON.stringify({ type: 'unsubscribed', data: { channels: Array.from(client.subscriptions) } }));
      break;

    case 'heartbeat':
      if (msg.data && msg.data.extensionId) {
        client.extensionId = msg.data.extensionId;
        store.heartbeats[msg.data.extensionId] = {
          extensionId: msg.data.extensionId,
          version: msg.data.version || 'unknown',
          platforms: msg.data.platforms || [],
          lastSeen: Date.now(),
          status: 'online'
        };
      }
      client.ws.send(JSON.stringify({ type: 'heartbeat_ack', data: { serverTime: Date.now() } }));
      break;

    case 'sync_progress':
      broadcast('sync', { type: 'sync_progress', data: msg.data });
      break;

    case 'sync_result':
      broadcast('sync', { type: 'sync_result', data: msg.data });
      break;

    default:
      client.ws.send(JSON.stringify({ type: 'error', data: { message: 'Unknown message type: ' + msg.type } }));
  }
}

function broadcast(channel, message) {
  const payload = JSON.stringify(message);
  for (const [, client] of clients) {
    if (client.subscriptions.has(channel) && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

function pushSyncTask(task) {
  broadcast('sync', { type: 'sync_task_created', data: task });
}

function pushScriptUpdate(platformId, version) {
  broadcast('platform', { type: 'script_updated', data: { platformId, version } });
}

function pushPlatformListChange() {
  broadcast('platform', { type: 'platform_list_changed', data: {} });
}

function getOnlineCount() {
  return clients.size;
}

module.exports = {
  setupWebSocket,
  pushSyncTask,
  pushScriptUpdate,
  pushPlatformListChange,
  getOnlineCount
};
