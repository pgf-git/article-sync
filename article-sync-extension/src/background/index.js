importScripts(
  '../shared/types.js',
  '../shared/message-protocol.js'
);

class ApiClient {
  constructor() {
    this._baseUrl = '';
  }

  async init() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    if (data[STORAGE_KEYS.CONFIG]) {
      this._baseUrl = data[STORAGE_KEYS.CONFIG].serverUrl || '';
    }
  }

  async _request(path, options) {
    options = options || {};
    const url = this._baseUrl + path;
    const headers = Object.assign({}, options.headers || {});
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!resp.ok) {
      throw new Error('API request failed: ' + resp.status + ' ' + resp.statusText);
    }
    return resp.json();
  }

  async getPlatforms() {
    return this._request('/api/v1/platforms/registry');
  }

  async getPlatformScript(platformId) {
    return this._request('/api/v1/platforms/' + platformId + '/script');
  }

  async getArticles() {
    return this._request('/api/v1/articles');
  }

  async getArticle(id) {
    return this._request('/api/v1/articles/' + id);
  }

  async reportResult(taskId, result) {
    return this._request('/api/v1/sync/tasks/' + taskId + '/status', {
      method: 'PUT',
      body: { result: result }
    });
  }

  async getRegistry() {
    return this._request('/api/v1/platforms/registry');
  }

  updateConfig(config) {
    this._baseUrl = config.serverUrl || this._baseUrl;
  }
}

class WebSocketClient {
  constructor() {
    this._ws = null;
    this._url = '';
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 10;
    this._handlers = new Map();
    this._connected = false;
  }

  async init() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    if (data[STORAGE_KEYS.CONFIG] && data[STORAGE_KEYS.CONFIG].wsUrl) {
      this._url = data[STORAGE_KEYS.CONFIG].wsUrl;
      this.connect();
    }
  }

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)) {
      return;
    }
    try {
      this._ws = new WebSocket(this._url);
      this._ws.onopen = () => {
        this._connected = true;
        this._reconnectAttempts = 0;
        this._emit(MessageType.WS_CONNECTED, {});
      };
      this._ws.onclose = () => {
        this._connected = false;
        this._emit(MessageType.WS_DISCONNECTED, {});
        this._scheduleReconnect();
      };
      this._ws.onerror = () => {
        this._connected = false;
      };
      this._ws.onmessage = (event) => {
        const msg = parseMessage(event.data);
        if (msg) {
          this._emit(MessageType.WS_MESSAGE, msg);
        }
      };
    } catch (e) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return;
    clearTimeout(this._reconnectTimer);
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectAttempts++;
      this.connect();
    }, delay);
  }

  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push(handler);
  }

  off(type, handler) {
    if (this._handlers.has(type)) {
      const list = this._handlers.get(type);
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  _emit(type, data) {
    if (this._handlers.has(type)) {
      this._handlers.get(type).forEach(function(h) { h(data); });
    }
  }

  send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
  }

  updateUrl(url) {
    this._url = url;
    this.disconnect();
    if (url) this.connect();
  }

  isConnected() {
    return this._connected;
  }
}

class CrossApiBridge {
  constructor() {
    this._pendingRequests = new Map();
    this._headerRuleCounter = 1;
    this._redirectRuleCounter = 1;
  }

  async getCookies(details) {
    return chrome.cookies.getAll(details || {});
  }

  async clearAllCookies(domain) {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    for (const cookie of cookies) {
      const protocol = cookie.secure ? 'https:' : 'http:';
      const url = protocol + '//' + cookie.domain + cookie.path;
      await chrome.cookies.remove({ url: url, name: cookie.name });
    }
    return { removed: cookies.length };
  }

  async crossFetch(request) {
    const headers = new Headers(request.headers || {});
    if (request.withCredentials) {
      const cookies = await chrome.cookies.getAll({ url: request.url });
      if (cookies.length > 0) {
        const cookieStr = cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');
        headers.set('Cookie', cookieStr);
      }
    }
    const fetchOptions = {
      method: request.method || 'GET',
      headers: Object.fromEntries(headers.entries())
    };
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
    }
    const resp = await fetch(request.url, fetchOptions);
    const respHeaders = {};
    resp.headers.forEach(function(v, k) { respHeaders[k] = v; });
    let body;
    if (request.responseType === 'arraybuffer') {
      body = await resp.arrayBuffer();
      body = Array.from(new Uint8Array(body));
    } else if (request.responseType === 'blob') {
      const blob = await resp.blob();
      body = await blob.text();
    } else {
      body = await resp.text();
    }
    return {
      status: resp.status,
      headers: respHeaders,
      body: body,
      ok: resp.ok
    };
  }

  async executeScript(params) {
    const tab = await chrome.tabs.create({
      url: params.url,
      active: false
    });
    await new Promise(function(resolve) {
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
    if (params.delay) {
      await new Promise(function(r) { setTimeout(r, params.delay); });
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: new Function('args', params.script),
      args: [params.args || {}],
      world: 'MAIN'
    });
    return { tabId: tab.id, result: results[0] ? results[0].result : null };
  }

  async executeScriptByWindow(params) {
    const win = await chrome.windows.create({
      url: params.url,
      type: 'popup',
      width: params.width || 800,
      height: params.height || 600,
      focused: false
    });
    const tab = win.tabs[0];
    await new Promise(function(resolve) {
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
    if (params.delay) {
      await new Promise(function(r) { setTimeout(r, params.delay); });
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: new Function('args', params.script),
      args: [params.args || {}],
      world: 'MAIN'
    });
    return { tabId: tab.id, windowId: win.id, result: results[0] ? results[0].result : null };
  }

  async coverNetworkHeader(rules) {
    const removeRuleIds = [];
    const addRules = rules.map(function(rule) {
      var id = rule.id || (this._headerRuleCounter++);
      removeRuleIds.push(id);
      return {
        id: id,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: (rule.requestHeaders || []).map(function(h) {
            return { header: h.name, operation: h.operation || 'set', value: h.value };
          }),
          responseHeaders: (rule.responseHeaders || []).map(function(h) {
            return { header: h.name, operation: h.operation || 'set', value: h.value };
          })
        },
        condition: {
          urlFilter: rule.urlFilter || '*',
          resourceTypes: ['xmlhttprequest', 'sub_frame', 'main_frame', 'script', 'stylesheet', 'image']
        }
      };
    }.bind(this));
    if (removeRuleIds.length > 0) {
      await chrome.declarativeNetRequest.removeRules({ removeRuleIds: removeRuleIds });
    }
    if (addRules.length > 0) {
      await chrome.declarativeNetRequest.addRules(addRules);
    }
    return { ruleIds: addRules.map(function(r) { return r.id; }) };
  }

  async setBeforeRequestRedirect(rules) {
    const removeRuleIds = [];
    const addRules = rules.map(function(rule) {
      var id = rule.id || (this._redirectRuleCounter++);
      removeRuleIds.push(id);
      return {
        id: id,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { url: rule.redirectUrl }
        },
        condition: {
          urlFilter: rule.urlFilter,
          resourceTypes: ['xmlhttprequest', 'sub_frame', 'main_frame', 'script', 'stylesheet', 'image']
        }
      };
    }.bind(this));
    if (removeRuleIds.length > 0) {
      await chrome.declarativeNetRequest.removeRules({ removeRuleIds: removeRuleIds });
    }
    if (addRules.length > 0) {
      await chrome.declarativeNetRequest.addRules(addRules);
    }
    return { ruleIds: addRules.map(function(r) { return r.id; }) };
  }

  async cacheChunkByUrl(params) {
    const resp = await fetch(params.url);
    if (!resp.ok) throw new Error('Failed to fetch: ' + resp.status);
    const buffer = await resp.arrayBuffer();
    const chunks = [];
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i += MAX_FILE_CHUNK_SIZE) {
      chunks.push(Array.from(view.slice(i, i + MAX_FILE_CHUNK_SIZE)));
    }
    return { chunks: chunks, totalSize: view.length, mimeType: resp.headers.get('content-type') || 'application/octet-stream' };
  }

  async fetchAndSendFileToContentScript(params) {
    const cacheResult = await this.cacheChunkByUrl(params);
    const tabId = params.tabId;
    chrome.tabs.sendMessage(tabId, buildMessage(MessageType.FILE_TRANSFER_INIT, {
      fileId: params.fileId || generateId(),
      totalSize: cacheResult.totalSize,
      mimeType: cacheResult.mimeType,
      chunkCount: cacheResult.chunks.length
    }));
    for (let i = 0; i < cacheResult.chunks.length; i++) {
      chrome.tabs.sendMessage(tabId, buildMessage(MessageType.FILE_TRANSFER_CHUNK, {
        fileId: params.fileId || generateId(),
        index: i,
        data: cacheResult.chunks[i]
      }));
      await new Promise(function(r) { setTimeout(r, 10); });
    }
    chrome.tabs.sendMessage(tabId, buildMessage(MessageType.FILE_TRANSFER_COMPLETE, {
      fileId: params.fileId || generateId()
    }));
    return { success: true };
  }

  async getTabInfoByRule(rule) {
    const tabs = await chrome.tabs.query(rule);
    return tabs.map(function(t) {
      return {
        id: t.id,
        url: t.url,
        title: t.title,
        windowId: t.windowId,
        active: t.active,
        status: t.status
      };
    });
  }

  async closeTabsByRule(rule) {
    const tabs = await chrome.tabs.query(rule);
    const ids = tabs.map(function(t) { return t.id; });
    if (ids.length > 0) {
      await chrome.tabs.remove(ids);
    }
    return { closed: ids.length };
  }

  async getGlobalStorage(keys) {
    const data = await chrome.storage.local.get(keys);
    return data;
  }

  async setGlobalStorage(items) {
    await chrome.storage.local.set(items);
    return { success: true };
  }

  async removeGlobalStorage(keys) {
    await chrome.storage.local.remove(keys);
    return { success: true };
  }

  async getLocalStorage(params) {
    const tab = await chrome.tabs.create({ url: params.url, active: false });
    await new Promise(function(resolve) {
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function(keys) {
        var result = {};
        keys.forEach(function(k) {
          result[k] = localStorage.getItem(k);
        });
        return result;
      },
      args: [params.keys || []],
      world: 'MAIN'
    });
    await chrome.tabs.remove(tab.id);
    return results[0] ? results[0].result : {};
  }

  async sendTabMessage(params) {
    chrome.tabs.sendMessage(params.tabId, buildMessage(params.type, params.payload));
    return { success: true };
  }

  async handleRequest(message) {
    var payload = message.payload;
    switch (message.type) {
      case MessageType.GET_COOKIES:
        return await this.getCookies(payload);
      case MessageType.CLEAR_ALL_COOKIES:
        return await this.clearAllCookies(payload.domain);
      case MessageType.CROSS_FETCH:
        return await this.crossFetch(payload);
      case MessageType.EXECUTE_SCRIPT:
        return await this.executeScript(payload);
      case MessageType.EXECUTE_SCRIPT_BY_WINDOW:
        return await this.executeScriptByWindow(payload);
      case MessageType.COVER_NETWORK_HEADER:
        return await this.coverNetworkHeader(payload.rules);
      case MessageType.SET_BEFORE_REQUEST_REDIRECT:
        return await this.setBeforeRequestRedirect(payload.rules);
      case MessageType.CACHE_CHUNK_BY_URL:
        return await this.cacheChunkByUrl(payload);
      case MessageType.FETCH_AND_SEND_FILE:
        return await this.fetchAndSendFileToContentScript(payload);
      case MessageType.GET_TAB_INFO_BY_RULE:
        return await this.getTabInfoByRule(payload);
      case MessageType.CLOSE_TABS_BY_RULE:
        return await this.closeTabsByRule(payload);
      case MessageType.GET_GLOBAL_STORAGE:
        return await this.getGlobalStorage(payload.keys);
      case MessageType.SET_GLOBAL_STORAGE:
        return await this.setGlobalStorage(payload.items);
      case MessageType.REMOVE_GLOBAL_STORAGE:
        return await this.removeGlobalStorage(payload.keys);
      case MessageType.GET_LOCAL_STORAGE:
        return await this.getLocalStorage(payload);
      case MessageType.SEND_TAB_MESSAGE:
        return await this.sendTabMessage(payload);
      default:
        throw new Error('Unknown API method: ' + message.type);
    }
  }
}

class TaskScheduler {
  constructor(concurrency) {
    this._concurrency = concurrency || DEFAULT_CONCURRENCY;
    this._queue = [];
    this._running = new Map();
    this._tasks = new Map();
    this._cancelled = new Set();
  }

  setConcurrency(n) {
    this._concurrency = n;
  }

  addTask(taskId, executor) {
    this._tasks.set(taskId, executor);
    this._queue.push(taskId);
    this._processQueue();
  }

  cancelTask(taskId) {
    this._cancelled.add(taskId);
    if (this._running.has(taskId)) {
      var entry = this._running.get(taskId);
      if (entry.abortController) {
        entry.abortController.abort();
      }
      this._running.delete(taskId);
    }
    var idx = this._queue.indexOf(taskId);
    if (idx >= 0) this._queue.splice(idx, 1);
  }

  getTaskStatus(taskId) {
    if (this._cancelled.has(taskId)) return 'cancelled';
    if (this._running.has(taskId)) return 'running';
    if (this._queue.indexOf(taskId) >= 0) return 'pending';
    return 'unknown';
  }

  getRunningCount() {
    return this._running.size;
  }

  getQueueLength() {
    return this._queue.length;
  }

  async _processQueue() {
    while (this._queue.length > 0 && this._running.size < this._concurrency) {
      var taskId = this._queue.shift();
      if (this._cancelled.has(taskId)) continue;
      var executor = this._tasks.get(taskId);
      if (!executor) continue;
      var abortController = new AbortController();
      var entry = { abortController: abortController, startedAt: Date.now() };
      this._running.set(taskId, entry);
      this._runTask(taskId, executor, abortController.signal);
    }
  }

  async _runTask(taskId, executor, signal) {
    try {
      await executor(signal, function(progress, step) {
        broadcastMessage(MessageType.TASK_PROGRESS, {
          taskId: taskId,
          progress: progress,
          currentStep: step
        });
      });
      this._running.delete(taskId);
      this._tasks.delete(taskId);
      broadcastMessage(MessageType.TASK_COMPLETE, { taskId: taskId });
    } catch (e) {
      this._running.delete(taskId);
      if (this._cancelled.has(taskId)) {
        broadcastMessage(MessageType.TASK_COMPLETE, { taskId: taskId, cancelled: true });
      } else {
        broadcastMessage(MessageType.TASK_ERROR, { taskId: taskId, error: e.message });
      }
    } finally {
      this._cancelled.delete(taskId);
      this._processQueue();
    }
  }
}

class ScriptLoader {
  constructor(apiClient) {
    this._apiClient = apiClient;
    this._cache = new Map();
    this._updateTimer = null;
  }

  async init() {
    await this.loadFromStorage();
  }

  async loadFromStorage() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.REGISTRY, STORAGE_KEYS.SCRIPTS]);
    if (data[STORAGE_KEYS.REGISTRY]) {
      var registry = data[STORAGE_KEYS.REGISTRY];
      if (registry.platforms) {
        registry.platforms.forEach(function(p) {
          this._cache.set(p.id, p);
        }.bind(this));
      }
    }
  }

  async updateRegistry() {
    try {
      var registry = await this._apiClient.getRegistry();
      await chrome.storage.local.set({ [STORAGE_KEYS.REGISTRY]: registry });
      if (registry.platforms) {
        registry.platforms.forEach(function(p) {
          this._cache.set(p.id, p);
        }.bind(this));
      }
      return registry;
    } catch (e) {
      return null;
    }
  }

  async getPlatformScript(platformId) {
    var scriptsData = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
    var scripts = scriptsData[STORAGE_KEYS.SCRIPTS] || {};
    if (scripts[platformId]) {
      var cached = scripts[platformId];
      var platform = this._cache.get(platformId);
      if (platform && platform.version && cached.version === platform.version) {
        return cached.script;
      }
    }
    try {
      var result = await this._apiClient.getPlatformScript(platformId);
      scripts[platformId] = { script: result.script, version: result.version, fetchedAt: Date.now() };
      await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts });
      return result.script;
    } catch (e) {
      if (scripts[platformId]) return scripts[platformId].script;
      throw e;
    }
  }

  getPlatforms() {
    return Array.from(this._cache.values());
  }

  getPlatform(id) {
    return this._cache.get(id) || null;
  }

  startAutoUpdate(intervalMs) {
    this.stopAutoUpdate();
    this._updateTimer = setInterval(function() {
      this.updateRegistry();
    }.bind(this), intervalMs || DEFAULT_SCRIPT_UPDATE_INTERVAL);
  }

  stopAutoUpdate() {
    if (this._updateTimer) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
  }
}

class AdapterRuntime {
  constructor() {
    this._pendingExecutions = new Map();
  }

  async execute(adapterScript, context) {
    var platform = context.platform;
    var article = context.article;
    var targetUrl = platform.adapterUrl || platform.loginUrl || (platform.domains && platform.domains.length > 0 ? 'https://' + platform.domains[0] : null);

    if (targetUrl) {
      return await this._executeInTab(adapterScript, article, platform, targetUrl);
    }
    return await this._executeInWorker(adapterScript, article, platform);
  }

  async _executeInTab(adapterScript, article, platform, url) {
    var tab = await chrome.tabs.create({ url: url, active: false });
    await new Promise(function(resolve) {
      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: new Function('article', 'platform', '"use strict"; return (async () => { ' + adapterScript + '})();'),
        args: [article, platform],
        world: 'MAIN'
      });
      return results[0] ? results[0].result : null;
    } finally {
      await chrome.tabs.remove(tab.id);
    }
  }

  async _executeInWorker(adapterScript, article, platform) {
    var fn = new Function('article', 'platform', '"use strict"; return (async () => { ' + adapterScript + '})();');
    return await fn(article, platform);
  }

  handleResult(executionId, result, error) {
    if (this._pendingExecutions.has(executionId)) {
      var entry = this._pendingExecutions.get(executionId);
      this._pendingExecutions.delete(executionId);
      if (error) {
        entry.reject(new Error(error));
      } else {
        entry.resolve(result);
      }
    }
  }
}

class ContentPipeline {
  markdownToHtml(md) {
    var html = md;
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/```[\s\S]*?```/g, function(m) {
      return '<pre><code>' + m.slice(3, -3).trim() + '</code></pre>';
    });
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    return html;
  }

  htmlToMarkdown(html) {
    var md = html;
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    md = md.replace(/<[^>]+>/g, '');
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");
    md = md.replace(/\n{3,}/g, '\n\n');
    return md.trim();
  }

  convert(content, fromType, toType) {
    if (fromType === toType) return content;
    if (fromType === 'markdown' && toType === 'html') {
      return this.markdownToHtml(content);
    }
    if (fromType === 'html' && toType === 'markdown') {
      return this.htmlToMarkdown(content);
    }
    if (fromType === 'plain' && toType === 'html') {
      return content.split('\n').map(function(l) { return '<p>' + l + '</p>'; }).join('');
    }
    return content;
  }
}

class ResultReporter {
  constructor(apiClient) {
    this._apiClient = apiClient;
    this._queue = [];
    this._processing = false;
  }

  async report(taskId, result) {
    this._queue.push({ taskId: taskId, result: result });
    this._processQueue();
  }

  async _processQueue() {
    if (this._processing) return;
    this._processing = true;
    while (this._queue.length > 0) {
      var item = this._queue.shift();
      try {
        await this._apiClient.reportResult(item.taskId, item.result);
      } catch (e) {
        this._queue.unshift(item);
        await new Promise(function(r) { setTimeout(r, 5000); });
      }
    }
    this._processing = false;
  }
}

var apiClient = new ApiClient();
var wsClient = new WebSocketClient();
var crossApi = new CrossApiBridge();
var scheduler = new TaskScheduler();
var scriptLoader = new ScriptLoader(apiClient);
var adapterRuntime = new AdapterRuntime();
var contentPipeline = new ContentPipeline();
var resultReporter = new ResultReporter(apiClient);

function broadcastMessage(type, payload) {
  chrome.runtime.sendMessage(buildMessage(type, payload)).catch(function() {});
}

async function handleCrossApiMessage(message, sendResponse) {
  try {
    var result = await crossApi.handleRequest(message);
    sendResponse(buildResponse(message, result));
  } catch (e) {
    sendResponse(buildResponse(message, null, e.message));
  }
  return true;
}

async function handleSyncStart(message, sendResponse) {
  var payload = message.payload;
  var article = payload.article;
  var platform = payload.platform;
  var taskId = generateId();

  try {
    var adapterScript = await scriptLoader.getPlatformScript(platform.id);
    if (!adapterScript) {
      sendResponse(buildResponse(message, null, 'Platform script not found'));
      return;
    }

    var convertedContent = contentPipeline.convert(
      article.content,
      article.contentType || 'markdown',
      platform.config && platform.config.contentType || 'html'
    );

    var context = {
      article: Object.assign({}, article, { content: convertedContent }),
      platform: platform
    };

    scheduler.addTask(taskId, async function(signal, onProgress) {
      onProgress(0, 'Initializing');
      var result = await adapterRuntime.execute(adapterScript, context);
      onProgress(100, 'Completed');
      await resultReporter.report(taskId, result);
      return result;
    });

    sendResponse(buildResponse(message, { taskId: taskId }));
  } catch (e) {
    sendResponse(buildResponse(message, null, e.message));
  }
  return true;
}

function handleTaskCancel(message, sendResponse) {
  scheduler.cancelTask(message.payload.taskId);
  sendResponse(buildResponse(message, { cancelled: true }));
  return true;
}

async function handleConfigGet(message, sendResponse) {
  var data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  sendResponse(buildResponse(message, data[STORAGE_KEYS.CONFIG] || {}));
  return true;
}

async function handleConfigUpdate(message, sendResponse) {
  var config = message.payload;
  await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: config });
  apiClient.updateConfig(config);
  if (config.wsUrl) wsClient.updateUrl(config.wsUrl);
  scheduler.setConcurrency(config.concurrency || DEFAULT_CONCURRENCY);
  scriptLoader.startAutoUpdate(config.scriptUpdateInterval);
  sendResponse(buildResponse(message, { success: true }));
  return true;
}

async function handlePlatformList(message, sendResponse) {
  var platforms = scriptLoader.getPlatforms();
  sendResponse(buildResponse(message, { platforms: platforms }));
  return true;
}

function handleAdapterResult(message, sendResponse) {
  if (message.payload && message.payload.executionId) {
    adapterRuntime.handleResult(
      message.payload.executionId,
      message.payload.result,
      message.payload.error
    );
  }
  if (sendResponse) sendResponse(buildResponse(message, { received: true }));
  return true;
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  var msg = parseMessage(message);
  if (!msg) return false;

  switch (msg.type) {
    case MessageType.GET_COOKIES:
    case MessageType.CLEAR_ALL_COOKIES:
    case MessageType.CROSS_FETCH:
    case MessageType.EXECUTE_SCRIPT:
    case MessageType.EXECUTE_SCRIPT_BY_WINDOW:
    case MessageType.COVER_NETWORK_HEADER:
    case MessageType.SET_BEFORE_REQUEST_REDIRECT:
    case MessageType.CACHE_CHUNK_BY_URL:
    case MessageType.FETCH_AND_SEND_FILE:
    case MessageType.GET_TAB_INFO_BY_RULE:
    case MessageType.CLOSE_TABS_BY_RULE:
    case MessageType.GET_GLOBAL_STORAGE:
    case MessageType.SET_GLOBAL_STORAGE:
    case MessageType.REMOVE_GLOBAL_STORAGE:
    case MessageType.GET_LOCAL_STORAGE:
    case MessageType.SEND_TAB_MESSAGE:
      return handleCrossApiMessage(msg, sendResponse);

    case MessageType.SYNC_START:
      return handleSyncStart(msg, sendResponse);

    case MessageType.TASK_CANCEL:
      return handleTaskCancel(msg, sendResponse);

    case MessageType.CONFIG_GET:
      return handleConfigGet(msg, sendResponse);

    case MessageType.CONFIG_UPDATE:
      return handleConfigUpdate(msg, sendResponse);

    case MessageType.PLATFORM_LIST_REQUEST:
      return handlePlatformList(msg, sendResponse);

    case MessageType.ADAPTER_RESULT:
      return handleAdapterResult(msg, sendResponse);

    case MessageType.PING:
      sendResponse(buildResponse(msg, { pong: true }));
      return false;

    default:
      return false;
  }
});

wsClient.on(MessageType.WS_MESSAGE, function(data) {
  if (data.type === 'sync_request') {
    broadcastMessage(MessageType.SYNC_START, data.payload);
  } else if (data.type === 'config_update') {
    chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: data.payload });
    apiClient.updateConfig(data.payload);
  }
});

chrome.runtime.onInstalled.addListener(async function() {
  await apiClient.init();
  await scriptLoader.init();
  await scriptLoader.updateRegistry();
  var configData = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  if (configData[STORAGE_KEYS.CONFIG]) {
    var config = configData[STORAGE_KEYS.CONFIG];
    scheduler.setConcurrency(config.concurrency || DEFAULT_CONCURRENCY);
    scriptLoader.startAutoUpdate(config.scriptUpdateInterval);
    await wsClient.init();
  }
});

chrome.runtime.onStartup.addListener(async function() {
  await apiClient.init();
  await scriptLoader.init();
  var configData = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  if (configData[STORAGE_KEYS.CONFIG]) {
    var config = configData[STORAGE_KEYS.CONFIG];
    scheduler.setConcurrency(config.concurrency || DEFAULT_CONCURRENCY);
    scriptLoader.startAutoUpdate(config.scriptUpdateInterval);
    await wsClient.init();
  }
});
