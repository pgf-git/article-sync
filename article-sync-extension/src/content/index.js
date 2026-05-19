(function() {
  var MessageType = {
    CROSS_API_REQUEST: 'cross_api_request',
    CROSS_API_RESPONSE: 'cross_api_response',
    GET_COOKIES: 'get_cookies',
    CLEAR_ALL_COOKIES: 'clear_all_cookies',
    CROSS_FETCH: 'cross_fetch',
    EXECUTE_SCRIPT: 'execute_script',
    EXECUTE_SCRIPT_BY_WINDOW: 'execute_script_by_window',
    COVER_NETWORK_HEADER: 'cover_network_header',
    SET_BEFORE_REQUEST_REDIRECT: 'set_before_request_redirect',
    CACHE_CHUNK_BY_URL: 'cache_chunk_by_url',
    FETCH_AND_SEND_FILE: 'fetch_and_send_file',
    GET_TAB_INFO_BY_RULE: 'get_tab_info_by_rule',
    CLOSE_TABS_BY_RULE: 'close_tabs_by_rule',
    GET_GLOBAL_STORAGE: 'get_global_storage',
    SET_GLOBAL_STORAGE: 'set_global_storage',
    REMOVE_GLOBAL_STORAGE: 'remove_global_storage',
    GET_LOCAL_STORAGE: 'get_local_storage',
    SEND_TAB_MESSAGE: 'send_tab_message',
    TASK_START: 'task_start',
    TASK_CANCEL: 'task_cancel',
    TASK_PROGRESS: 'task_progress',
    TASK_COMPLETE: 'task_complete',
    TASK_ERROR: 'task_error',
    ARTICLE_EXTRACT: 'article_extract',
    ARTICLE_EXTRACTED: 'article_extracted',
    PLATFORM_LIST_REQUEST: 'platform_list_request',
    PLATFORM_LIST_RESPONSE: 'platform_list_response',
    SYNC_START: 'sync_start',
    SYNC_PROGRESS: 'sync_progress',
    SYNC_COMPLETE: 'sync_complete',
    SYNC_ERROR: 'sync_error',
    CONFIG_UPDATE: 'config_update',
    CONFIG_GET: 'config_get',
    CONFIG_RESPONSE: 'config_response',
    SCRIPT_REGISTRY_UPDATE: 'script_registry_update',
    ADAPTER_EXECUTE: 'adapter_execute',
    ADAPTER_RESULT: 'adapter_result',
    ADAPTER_LOG: 'adapter_log',
    SANDBOX_READY: 'sandbox_ready',
    FILE_TRANSFER_INIT: 'file_transfer_init',
    FILE_TRANSFER_CHUNK: 'file_transfer_chunk',
    FILE_TRANSFER_COMPLETE: 'file_transfer_complete',
    FILE_TRANSFER_ERROR: 'file_transfer_error',
    WS_CONNECTED: 'ws_connected',
    WS_DISCONNECTED: 'ws_disconnected',
    WS_MESSAGE: 'ws_message',
    PING: 'ping',
    PONG: 'pong'
  };

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  function buildMessage(type, payload) {
    return {
      id: generateId(),
      type: type,
      payload: payload || {},
      target: 'background',
      source: 'content',
      timestamp: Date.now()
    };
  }

  var FileTransferReceiver = {
    _transfers: new Map(),

    init: function() {
      chrome.runtime.onMessage.addListener(function(message) {
        if (!message || !message.type) return;
        switch (message.type) {
          case MessageType.FILE_TRANSFER_INIT:
            FileTransferReceiver._onInit(message.payload);
            break;
          case MessageType.FILE_TRANSFER_CHUNK:
            FileTransferReceiver._onChunk(message.payload);
            break;
          case MessageType.FILE_TRANSFER_COMPLETE:
            FileTransferReceiver._onComplete(message.payload);
            break;
        }
      });
    },

    _onInit: function(payload) {
      this._transfers.set(payload.fileId, {
        totalSize: payload.totalSize,
        mimeType: payload.mimeType,
        chunkCount: payload.chunkCount,
        chunks: new Array(payload.chunkCount),
        receivedChunks: 0,
        resolve: null,
        promise: null
      });
      var transfer = this._transfers.get(payload.fileId);
      transfer.promise = new Promise(function(resolve) {
        transfer.resolve = resolve;
      });
    },

    _onChunk: function(payload) {
      var transfer = this._transfers.get(payload.fileId);
      if (!transfer) return;
      transfer.chunks[payload.index] = new Uint8Array(payload.data);
      transfer.receivedChunks++;
    },

    _onComplete: function(payload) {
      var transfer = this._transfers.get(payload.fileId);
      if (!transfer) return;
      var totalSize = transfer.totalSize;
      var result = new Uint8Array(totalSize);
      var offset = 0;
      for (var i = 0; i < transfer.chunks.length; i++) {
        if (transfer.chunks[i]) {
          result.set(transfer.chunks[i], offset);
          offset += transfer.chunks[i].length;
        }
      }
      var blob = new Blob([result], { type: transfer.mimeType });
      var url = URL.createObjectURL(blob);
      if (transfer.resolve) {
        transfer.resolve({ blob: blob, url: url, size: totalSize });
      }
      this._transfers.delete(payload.fileId);
    },

    getFile: function(fileId) {
      var transfer = this._transfers.get(fileId);
      return transfer ? transfer.promise : Promise.resolve(null);
    }
  };

  var MessageBridge = {
    _handlers: new Map(),
    _pendingRequests: new Map(),

    init: function() {
      chrome.runtime.onMessage.addListener(function(message) {
        if (!message || !message.type) return;
        if (message.correlationId && this._pendingRequests.has(message.correlationId)) {
          var entry = this._pendingRequests.get(message.correlationId);
          clearTimeout(entry.timer);
          this._pendingRequests.delete(message.correlationId);
          if (message.error) {
            entry.reject(new Error(message.error));
          } else {
            entry.resolve(message.payload);
          }
          return;
        }
        if (this._handlers.has(message.type)) {
          var handlers = this._handlers.get(message.type);
          handlers.forEach(function(h) { h(message.payload, message); });
        }
      }.bind(this));
    },

    on: function(type, handler) {
      if (!this._handlers.has(type)) {
        this._handlers.set(type, []);
      }
      this._handlers.get(type).push(handler);
    },

    off: function(type, handler) {
      if (this._handlers.has(type)) {
        var list = this._handlers.get(type);
        var idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    },

    send: function(type, payload, timeout) {
      var msg = buildMessage(type, payload);
      return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
          this._pendingRequests.delete(msg.id);
          reject(new Error('Message timeout: ' + type));
        }.bind(this), timeout || 30000);
        this._pendingRequests.set(msg.id, { resolve: resolve, reject: reject, timer: timer });
        chrome.runtime.sendMessage(msg, function(response) {
          if (chrome.runtime.lastError) {
            if (this._pendingRequests.has(msg.id)) {
              clearTimeout(timer);
              this._pendingRequests.delete(msg.id);
              reject(new Error(chrome.runtime.lastError.message));
            }
            return;
          }
          if (response && response.correlationId === msg.id) {
            clearTimeout(timer);
            this._pendingRequests.delete(msg.id);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.payload);
            }
          }
        }.bind(this));
      }.bind(this));
    },

    sendToBackground: function(type, payload) {
      return this.send(type, payload);
    }
  };

  var AutomationEngine = {
    _variables: {},
    _running: false,
    _cancelled: false,

    run: async function(steps, context) {
      this._variables = {};
      this._running = true;
      this._cancelled = false;
      if (context && context.variables) {
        Object.assign(this._variables, context.variables);
      }
      var results = [];
      for (var i = 0; i < steps.length; i++) {
        if (this._cancelled) break;
        var step = steps[i];
        var result = await this._executeStep(step);
        results.push(result);
        if (step.variable && result.value !== undefined) {
          this._variables[step.variable] = result.value;
        }
      }
      this._running = false;
      return results;
    },

    cancel: function() {
      this._cancelled = true;
    },

    _executeStep: async function(step) {
      switch (step.type) {
        case 'click':
          return await this._click(step);
        case 'type':
          return await this._type(step);
        case 'upload':
          return await this._upload(step);
        case 'wait':
          return await this._wait(step);
        case 'select':
          return await this._select(step);
        case 'navigate':
          return await this._navigate(step);
        case 'conditional':
          return await this._conditional(step);
        case 'extract':
          return await this._extract(step);
        case 'scroll':
          return await this._scroll(step);
        case 'hover':
          return await this._hover(step);
        case 'press':
          return await this._press(step);
        case 'screenshot':
          return { success: true };
        default:
          return { success: true, skipped: true };
      }
    },

    _findElement: function(selector, timeout) {
      timeout = timeout || 5000;
      return new Promise(function(resolve, reject) {
        var el = document.querySelector(selector);
        if (el) return resolve(el);
        var observer = new MutationObserver(function() {
          el = document.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(function() {
          observer.disconnect();
          el = document.querySelector(selector);
          if (el) resolve(el);
          else reject(new Error('Element not found: ' + selector));
        }, timeout);
      });
    },

    _click: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this._delay(100);
      el.click();
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _type: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this._delay(100);
      el.focus();
      if (step.options && step.options.clear) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      var value = this._interpolate(step.value);
      if (step.options && step.options.append) {
        el.value += value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _upload: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      var fileData = await MessageBridge.sendToBackground(MessageType.FETCH_AND_SEND_FILE, {
        url: step.value,
        tabId: 0,
        fileId: generateId()
      });
      return { success: true };
    },

    _wait: async function(step) {
      if (step.selector) {
        await this._findElement(step.selector, step.timeout || 10000);
        if (step.delay) await this._delay(step.delay);
        return { success: true };
      }
      var ms = parseInt(step.value) || 1000;
      await this._delay(ms);
      return { success: true };
    },

    _select: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      el.value = this._interpolate(step.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _navigate: async function(step) {
      var url = this._interpolate(step.value || step.url);
      window.location.href = url;
      return { success: true };
    },

    _conditional: async function(step) {
      var conditionMet = this._evaluateCondition(step.condition);
      if (conditionMet && step.steps) {
        var results = [];
        for (var i = 0; i < step.steps.length; i++) {
          if (this._cancelled) break;
          results.push(await this._executeStep(step.steps[i]));
        }
        return { success: true, conditionMet: true, results: results };
      }
      return { success: true, conditionMet: false };
    },

    _extract: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      var value;
      if (step.attribute) {
        value = el.getAttribute(step.attribute);
      } else {
        value = el.textContent || el.innerText;
      }
      return { success: true, value: value };
    },

    _scroll: async function(step) {
      var el = step.selector ? await this._findElement(step.selector, step.timeout) : window;
      var x = parseInt(step.options && step.options.x) || 0;
      var y = parseInt(step.options && step.options.y) || 0;
      if (el === window) {
        window.scrollBy(x, y);
      } else {
        el.scrollBy(x, y);
      }
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _hover: async function(step) {
      var el = await this._findElement(step.selector, step.timeout);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this._delay(100);
      var events = ['mouseenter', 'mouseover', 'mousemove'];
      events.forEach(function(evtName) {
        el.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true }));
      });
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _press: async function(step) {
      var key = step.value;
      var el = step.selector ? await this._findElement(step.selector, step.timeout) : document.activeElement;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
      if (step.delay) await this._delay(step.delay);
      return { success: true };
    },

    _evaluateCondition: function(condition) {
      if (!condition) return false;
      try {
        var fn = new Function('vars', 'with(vars) { return (' + condition + '); }');
        return !!fn(this._variables);
      } catch (e) {
        return false;
      }
    },

    _interpolate: function(str) {
      if (typeof str !== 'string') return str;
      return str.replace(/\{\{(\w+)\}\}/g, function(match, key) {
        return this._variables[key] !== undefined ? this._variables[key] : match;
      }.bind(this));
    },

    _delay: function(ms) {
      return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }
  };

  var SystemBridge = {
    _isSystemPage: false,
    _syncButton: null,
    _articleData: null,
    _systemPatterns: [],

    init: function() {
      MessageBridge.on(MessageType.CONFIG_RESPONSE, function(config) {
        if (config && config.serverUrl) {
          this._systemPatterns = [new URL(config.serverUrl).origin];
          this._detectSystemPage();
        }
      }.bind(this));

      MessageBridge.sendToBackground(MessageType.CONFIG_GET, {});

      MessageBridge.on(MessageType.ARTICLE_EXTRACT, function(payload) {
        this._extractArticle(payload);
      }.bind(this));

      MessageBridge.on(MessageType.SYNC_START, function(payload) {
        this._startSync(payload);
      }.bind(this));
    },

    _detectSystemPage: function() {
      var pageOrigin = window.location.origin;
      this._isSystemPage = this._systemPatterns.some(function(p) {
        return pageOrigin === p || pageOrigin.indexOf(p) === 0;
      });
      if (this._isSystemPage) {
        this._injectSyncButton();
      }
    },

    _injectSyncButton: function() {
      if (this._syncButton) return;
      var btn = document.createElement('button');
      btn.textContent = '\u540C\u6B65\u53D1\u5E03';
      btn.id = 'article-sync-btn';
      btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;' +
        'background:#1677ff;color:#fff;border:none;border-radius:8px;padding:12px 24px;' +
        'font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(22,119,255,0.4);' +
        'transition:all 0.2s ease;font-family:system-ui,sans-serif;';
      btn.addEventListener('mouseenter', function() {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 6px 16px rgba(22,119,255,0.5)';
      });
      btn.addEventListener('mouseleave', function() {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 12px rgba(22,119,255,0.4)';
      });
      btn.addEventListener('click', function() {
        var article = this._extractCurrentArticle();
        if (article) {
          MessageBridge.sendToBackground(MessageType.ARTICLE_EXTRACTED, { article: article });
        }
      }.bind(this));
      document.body.appendChild(btn);
      this._syncButton = btn;
    },

    _extractCurrentArticle: function() {
      var titleEl = document.querySelector('h1') ||
        document.querySelector('[data-article-title]') ||
        document.querySelector('.article-title') ||
        document.querySelector('.post-title');
      var contentEl = document.querySelector('[data-article-content]') ||
        document.querySelector('.article-content') ||
        document.querySelector('.post-content') ||
        document.querySelector('.editor-content') ||
        document.querySelector('article') ||
        document.querySelector('.content');
      if (!titleEl && !contentEl) return null;
      var article = {
        id: document.querySelector('[data-article-id]') ?
          document.querySelector('[data-article-id]').getAttribute('data-article-id') : generateId(),
        title: titleEl ? titleEl.textContent.trim() : '',
        content: contentEl ? contentEl.innerHTML : '',
        contentType: 'html',
        url: window.location.href,
        extractedAt: Date.now()
      };
      var metaTags = document.querySelectorAll('meta[name="keywords"], meta[name="description"], meta[name="author"]');
      metaTags.forEach(function(tag) {
        var name = tag.getAttribute('name');
        var content = tag.getAttribute('content');
        if (name === 'keywords') article.tags = content.split(',').map(function(t) { return t.trim(); });
        if (name === 'description') article.summary = content;
        if (name === 'author') article.author = content;
      });
      this._articleData = article;
      return article;
    },

    _extractArticle: function(payload) {
      var article = this._extractCurrentArticle();
      MessageBridge.sendToBackground(MessageType.ARTICLE_EXTRACTED, {
        requestId: payload.requestId,
        article: article
      });
    },

    _startSync: function(payload) {
      var steps = payload.steps;
      if (steps && steps.length > 0) {
        AutomationEngine.run(steps, payload.context);
      }
    }
  };

  FileTransferReceiver.init();
  MessageBridge.init();
  SystemBridge.init();

  window.__articleSyncExtension = {
    messageBridge: MessageBridge,
    automationEngine: AutomationEngine,
    fileTransfer: FileTransferReceiver,
    systemBridge: SystemBridge
  };
})();
