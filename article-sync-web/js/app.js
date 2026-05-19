var App = (function () {
  var pages = {};
  var currentPage = null;
  var ws = null;
  var wsReconnectTimer = null;
  var wsListeners = [];
  var extensionOnline = false;

  var API_BASE = 'http://localhost:3001/api/v1';
  var WS_BASE = 'ws://localhost:3001/ws';

  var pageTitles = {
    '/dashboard': '仪表盘',
    '/articles': '文章管理',
    '/platforms': '平台管理',
    '/sync-tasks': '同步任务',
    '/script-editor': '脚本调试',
    '/settings': '系统设置'
  };

  function init() {
    initRouter();
    initSidebar();
    initModal();
    initConfirm();
    initWebSocket();
    initExtensionListener();
    var hash = location.hash.slice(1) || '/dashboard';
    navigate(hash);
  }

  function initRouter() {
    window.addEventListener('hashchange', function () {
      var hash = location.hash.slice(1) || '/dashboard';
      navigate(hash);
    });
  }

  function navigate(route) {
    var path = route.split('?')[0];
    var query = {};
    if (route.indexOf('?') > -1) {
      var qs = route.split('?')[1];
      qs.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    updateSidebarActive(path);
    updatePageTitle(path);
    renderPage(path, query);
  }

  function registerPage(path, pageModule) {
    pages[path] = pageModule;
  }

  function updateSidebarActive(path) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === path);
    });
  }

  function updatePageTitle(path) {
    var title = pageTitles[path] || '文章同步管理系统';
    document.getElementById('pageTitle').textContent = title;
    document.title = title + ' - 文章同步管理系统';
  }

  function renderPage(path, query) {
    var content = document.getElementById('mainContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    currentPage = path;
    var page = pages[path];
    if (page && typeof page.render === 'function') {
      try {
        content.innerHTML = page.render(query);
        if (typeof page.init === 'function') {
          page.init(query);
        }
      } catch (e) {
        content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">页面加载失败: ' + e.message + '</div></div>';
        console.error(e);
      }
    } else {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">页面未找到</div></div>';
    }
  }

  function initSidebar() {
    var toggle = document.getElementById('sidebarToggle');
    var sidebar = document.getElementById('sidebar');
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
        sidebar.classList.remove('open');
      }
    });
  }

  function initModal() {
    var overlay = document.getElementById('modalOverlay');
    var closeBtn = document.getElementById('modalClose');
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  function openModal(title, bodyHtml, footerHtml, large) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    var modal = document.getElementById('modal');
    modal.classList.toggle('modal-large', !!large);
    document.getElementById('modalOverlay').classList.add('active');
  }

  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  }

  function initConfirm() {
    var overlay = document.getElementById('confirmOverlay');
    var cancelBtn = document.getElementById('confirmCancel');
    var okBtn = document.getElementById('confirmOk');
    cancelBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      if (confirmCancelCallback) confirmCancelCallback();
    });
    okBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      if (confirmOkCallback) confirmOkCallback();
    });
  }

  var confirmOkCallback = null;
  var confirmCancelCallback = null;

  function showConfirm(title, message, onOk, onCancel, icon) {
    document.getElementById('confirmIcon').textContent = icon || '⚠️';
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmOkCallback = onOk;
    confirmCancelCallback = onCancel;
    document.getElementById('confirmOverlay').classList.add('active');
  }

  function toast(type, message, duration) {
    var container = document.getElementById('toastContainer');
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span><span>' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast-removing');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, duration || 3000);
  }

  function initWebSocket() {
    try {
      ws = new WebSocket(WS_BASE);
      ws.onopen = function () {
        console.log('WebSocket connected');
      };
      ws.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          wsListeners.forEach(function (cb) {
            try { cb(data); } catch (e) { console.error(e); }
          });
        } catch (e) { console.error(e); }
      };
      ws.onclose = function () {
        wsReconnectTimer = setTimeout(initWebSocket, 5000);
      };
      ws.onerror = function () {
        ws.close();
      };
    } catch (e) {
      wsReconnectTimer = setTimeout(initWebSocket, 5000);
    }
  }

  function onWsMessage(callback) {
    wsListeners.push(callback);
    return function () {
      wsListeners = wsListeners.filter(function (cb) { return cb !== callback; });
    };
  }

  function initExtensionListener() {
    window.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'ARTICLE_SYNC_EXTENSION') {
        if (event.data.action === 'heartbeat') {
          setExtensionOnline(true);
        }
        if (event.data.action === 'syncProgress') {
          wsListeners.forEach(function (cb) {
            try { cb({ type: 'syncProgress', data: event.data.payload }); } catch (e) { console.error(e); }
          });
        }
        if (event.data.action === 'syncComplete') {
          wsListeners.forEach(function (cb) {
            try { cb({ type: 'syncComplete', data: event.data.payload }); } catch (e) { console.error(e); }
          });
        }
      }
    });
  }

  function setExtensionOnline(online) {
    extensionOnline = online;
    var statusDot = document.querySelector('#extensionStatus .status-dot');
    var statusText = document.querySelector('#extensionStatus .status-text');
    var indicatorDot = document.querySelector('#extensionIndicator .indicator-dot');
    var indicatorText = document.querySelector('#extensionIndicator .indicator-text');
    if (statusDot) {
      statusDot.classList.toggle('online', online);
      statusDot.classList.toggle('offline', !online);
    }
    if (statusText) statusText.textContent = online ? '扩展在线' : '扩展离线';
    if (indicatorDot) {
      indicatorDot.classList.toggle('online', online);
      indicatorDot.classList.toggle('offline', !online);
    }
    if (indicatorText) indicatorText.textContent = online ? '扩展在线' : '扩展离线';
  }

  function isExtensionOnline() {
    return extensionOnline;
  }

  var api = {
    request: function (method, path, body) {
      var opts = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== undefined) {
        opts.body = JSON.stringify(body);
      }
      return fetch(API_BASE + path, opts).then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.message || err.error || '请求失败');
          }, function () {
            throw new Error('请求失败: ' + res.status);
          });
        }
        return res.json();
      });
    },
    getPlatforms: function () { return api.request('GET', '/platforms/registry'); },
    getPlatformScript: function (id) { return api.request('GET', '/platforms/' + id + '/script'); },
    updatePlatformScript: function (id, data) { return api.request('PUT', '/platforms/' + id + '/script', data); },
    getScriptVersions: function (id) { return api.request('GET', '/platforms/' + id + '/script/versions'); },
    rollbackScript: function (id, version) { return api.request('POST', '/platforms/' + id + '/script/rollback', { version: version }); },
    getArticles: function (params) {
      var qs = params ? '?' + Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
      return api.request('GET', '/articles' + qs);
    },
    getArticle: function (id) { return api.request('GET', '/articles/' + id); },
    createArticle: function (data) { return api.request('POST', '/articles', data); },
    updateArticle: function (id, data) { return api.request('PUT', '/articles/' + id, data); },
    deleteArticle: function (id) { return api.request('DELETE', '/articles/' + id); },
    createSyncTask: function (data) { return api.request('POST', '/sync/tasks', data); },
    getSyncTasks: function (params) {
      var qs = params ? '?' + Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '';
      return api.request('GET', '/sync/tasks' + qs);
    },
    getSyncTask: function (id) { return api.request('GET', '/sync/tasks/' + id); },
    updateSyncTaskStatus: function (id, data) { return api.request('PUT', '/sync/tasks/' + id + '/status', data); },
    cancelSyncTask: function (id) { return api.request('POST', '/sync/tasks/' + id + '/cancel'); },
    retrySyncTask: function (id) { return api.request('POST', '/sync/tasks/' + id + '/retry'); },
    getTaskLogs: function (id) { return api.request('GET', '/sync/tasks/' + id + '/logs'); },
    reportTaskLogs: function (id, data) { return api.request('POST', '/sync/tasks/' + id + '/logs', data); },
    batchUpdateStatus: function (data) { return api.request('POST', '/sync/tasks/batch-status', data); },
    getExtensionConfig: function () { return api.request('GET', '/extension/config'); },
    heartbeat: function (data) { return api.request('POST', '/extension/heartbeat', data); },
    getStatsOverview: function () { return api.request('GET', '/stats/overview'); },
    getSyncTrend: function (days) { return api.request('GET', '/stats/sync-trend?days=' + (days || 7)); },
    getPlatformStats: function () { return api.request('GET', '/stats/platform-stats'); },
    getWebhooks: function () { return api.request('GET', '/webhooks'); },
    createWebhook: function (data) { return api.request('POST', '/webhooks', data); },
    updateWebhook: function (id, data) { return api.request('PUT', '/webhooks/' + id, data); },
    deleteWebhook: function (id) { return api.request('DELETE', '/webhooks/' + id); }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '-';
    var now = Date.now();
    var d = new Date(dateStr).getTime();
    var diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    return formatDate(dateStr);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    registerPage: registerPage,
    navigate: navigate,
    openModal: openModal,
    closeModal: closeModal,
    showConfirm: showConfirm,
    toast: toast,
    api: api,
    onWsMessage: onWsMessage,
    setExtensionOnline: setExtensionOnline,
    isExtensionOnline: isExtensionOnline,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatRelativeTime: formatRelativeTime
  };
})();
