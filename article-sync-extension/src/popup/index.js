(function() {
  var MessageType = {
    SYNC_START: 'sync_start',
    SYNC_PROGRESS: 'sync_progress',
    SYNC_COMPLETE: 'sync_complete',
    SYNC_ERROR: 'sync_error',
    CONFIG_GET: 'config_get',
    CONFIG_RESPONSE: 'config_response',
    PLATFORM_LIST_REQUEST: 'platform_list_request',
    ARTICLE_EXTRACT: 'article_extract',
    ARTICLE_EXTRACTED: 'article_extracted',
    TASK_CANCEL: 'task_cancel',
    TASK_PROGRESS: 'task_progress',
    TASK_COMPLETE: 'task_complete',
    TASK_ERROR: 'task_error',
    PING: 'ping'
  };

  var state = {
    articles: [],
    selectedArticle: null,
    platforms: [],
    selectedPlatforms: [],
    tasks: [],
    connected: false
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function sendToBackground(type, payload) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
        type: type,
        payload: payload || {},
        target: 'background',
        source: 'popup',
        timestamp: Date.now()
      }, function(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response ? response.payload : null);
        }
      });
    });
  }

  function showToast(message, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
  }

  function initTabs() {
    $$('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        $$('.tab').forEach(function(t) { t.classList.remove('active'); });
        $$('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.getAttribute('data-tab');
        $('#tab-' + target).classList.add('active');
      });
    });
  }

  function renderArticleList() {
    var container = $('#articleList');
    if (state.articles.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无文章，请从系统获取或从当前页面提取</div>';
      return;
    }
    container.innerHTML = '';
    state.articles.forEach(function(article, index) {
      var item = document.createElement('div');
      item.className = 'article-item' + (state.selectedArticle && state.selectedArticle.id === article.id ? ' selected' : '');
      item.innerHTML =
        '<div class="article-item-info">' +
          '<div class="article-item-title">' + escapeHtml(article.title || '无标题') + '</div>' +
          '<div class="article-item-meta">' + (article.contentType || 'html') + ' · ' + formatDate(article.extractedAt || article.createdAt) + '</div>' +
        '</div>';
      item.addEventListener('click', function() {
        state.selectedArticle = article;
        renderArticleList();
        updateSyncButton();
      });
      container.appendChild(item);
    });
  }

  function renderPlatformList() {
    var container = $('#platformList');
    if (state.platforms.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无可用平台，请检查系统配置</div>';
      return;
    }
    container.innerHTML = '';
    state.platforms.forEach(function(platform) {
      var item = document.createElement('div');
      var isSelected = state.selectedPlatforms.indexOf(platform.id) >= 0;
      item.className = 'platform-item' + (isSelected ? ' selected' : '');
      item.innerHTML =
        '<div class="platform-item-info">' +
          '<div class="platform-item-name">' + escapeHtml(platform.name) + '</div>' +
          '<div class="platform-item-desc">' + escapeHtml(platform.description || platform.domains ? platform.domains.join(', ') : '') + '</div>' +
        '</div>' +
        '<div class="platform-item-check"></div>';
      item.addEventListener('click', function() {
        var idx = state.selectedPlatforms.indexOf(platform.id);
        if (idx >= 0) {
          state.selectedPlatforms.splice(idx, 1);
        } else {
          state.selectedPlatforms.push(platform.id);
        }
        renderPlatformList();
        updateSyncButton();
      });
      container.appendChild(item);
    });
  }

  function renderTaskList() {
    var container = $('#taskList');
    if (state.tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无同步任务</div>';
      return;
    }
    container.innerHTML = '';
    state.tasks.slice().reverse().forEach(function(task) {
      var item = document.createElement('div');
      item.className = 'task-item';
      var statusText = { pending: '等待中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
      item.innerHTML =
        '<div class="task-item-header">' +
          '<div class="task-item-title">' + escapeHtml(task.platformName || task.platformId) + '</div>' +
          '<span class="task-item-status ' + task.status + '">' + (statusText[task.status] || task.status) + '</span>' +
        '</div>' +
        '<div class="task-progress"><div class="task-progress-bar" style="width:' + (task.progress || 0) + '%"></div></div>' +
        '<div class="task-item-footer">' +
          '<span class="task-item-step">' + escapeHtml(task.currentStep || '') + '</span>' +
          (task.status === 'running' ? '<div class="task-item-actions"><button class="btn btn-danger btn-sm task-cancel" data-id="' + task.id + '">取消</button></div>' : '') +
        '</div>';
      container.appendChild(item);
    });
    container.querySelectorAll('.task-cancel').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var taskId = btn.getAttribute('data-id');
        sendToBackground(MessageType.TASK_CANCEL, { taskId: taskId });
        var task = state.tasks.find(function(t) { return t.id === taskId; });
        if (task) task.status = 'cancelled';
        renderTaskList();
      });
    });
  }

  function updateSyncButton() {
    var btn = $('#btnStartSync');
    btn.disabled = !(state.selectedArticle && state.selectedPlatforms.length > 0);
  }

  async function loadPlatforms() {
    try {
      var result = await sendToBackground(MessageType.PLATFORM_LIST_REQUEST, {});
      if (result && result.platforms) {
        state.platforms = result.platforms;
      }
      renderPlatformList();
    } catch (e) {
      renderPlatformList();
    }
  }

  async function loadArticlesFromSystem() {
    showToast('正在获取文章列表...', 'info');
    try {
      var config = await sendToBackground(MessageType.CONFIG_GET, {});
      if (!config || !config.serverUrl) {
        showToast('请先配置系统地址', 'error');
        return;
      }
      var result = await sendToBackground('cross_fetch', {
        url: config.serverUrl + '/api/v1/articles',
        method: 'GET'
      });
      if (result && result.body) {
        var data = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
        state.articles = Array.isArray(data) ? data : (data.items || data.articles || []);
        renderArticleList();
        showToast('获取成功，共 ' + state.articles.length + ' 篇文章', 'success');
      }
    } catch (e) {
      showToast('获取失败: ' + e.message, 'error');
    }
  }

  async function extractArticleFromPage() {
    showToast('正在提取文章...', 'info');
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        showToast('未找到活动标签页', 'error');
        return;
      }
      var tabId = tabs[0].id;
      var results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function() {
          if (window.__articleSyncExtension) {
            return window.__articleSyncExtension.systemBridge._extractCurrentArticle();
          }
          var titleEl = document.querySelector('h1') || document.querySelector('[data-article-title]');
          var contentEl = document.querySelector('[data-article-content]') || document.querySelector('.article-content') || document.querySelector('article');
          if (!titleEl && !contentEl) return null;
          return {
            id: 'page_' + Date.now(),
            title: titleEl ? titleEl.textContent.trim() : document.title,
            content: contentEl ? contentEl.innerHTML : '',
            contentType: 'html',
            url: window.location.href,
            extractedAt: Date.now()
          };
        }
      });
      var article = results[0] && results[0].result;
      if (article) {
        state.articles.unshift(article);
        state.selectedArticle = article;
        renderArticleList();
        updateSyncButton();
        showToast('提取成功', 'success');
      } else {
        showToast('未能从当前页面提取文章', 'error');
      }
    } catch (e) {
      showToast('提取失败: ' + e.message, 'error');
    }
  }

  async function startSync() {
    if (!state.selectedArticle || state.selectedPlatforms.length === 0) return;
    var article = state.selectedArticle;
    for (var i = 0; i < state.selectedPlatforms.length; i++) {
      var platformId = state.selectedPlatforms[i];
      var platform = state.platforms.find(function(p) { return p.id === platformId; });
      if (!platform) continue;
      try {
        var result = await sendToBackground(MessageType.SYNC_START, {
          article: article,
          platform: platform
        });
        if (result && result.taskId) {
          state.tasks.push({
            id: result.taskId,
            articleId: article.id,
            platformId: platformId,
            platformName: platform.name,
            status: 'running',
            progress: 0,
            currentStep: '初始化',
            createdAt: Date.now()
          });
        }
      } catch (e) {
        showToast('启动同步失败: ' + e.message, 'error');
      }
    }
    renderTaskList();
    var tabsEl = $$('.tab');
    tabsEl.forEach(function(t) { t.classList.remove('active'); });
    $$('.tab-content').forEach(function(c) { c.classList.remove('active'); });
    tabsEl[1].classList.add('active');
    $('#tab-tasks').classList.add('active');
    showToast('已创建 ' + state.selectedPlatforms.length + ' 个同步任务', 'success');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  chrome.runtime.onMessage.addListener(function(message) {
    if (!message || !message.type) return;
    switch (message.type) {
      case MessageType.TASK_PROGRESS:
        var task = state.tasks.find(function(t) { return t.id === message.payload.taskId; });
        if (task) {
          task.progress = message.payload.progress;
          task.currentStep = message.payload.currentStep;
          renderTaskList();
        }
        break;
      case MessageType.TASK_COMPLETE:
        var task = state.tasks.find(function(t) { return t.id === message.payload.taskId; });
        if (task) {
          task.status = 'completed';
          task.progress = 100;
          task.completedAt = Date.now();
          renderTaskList();
        }
        break;
      case MessageType.TASK_ERROR:
        var task = state.tasks.find(function(t) { return t.id === message.payload.taskId; });
        if (task) {
          task.status = 'failed';
          task.error = message.payload.error;
          renderTaskList();
        }
        break;
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    loadPlatforms();

    $('#btnFromSystem').addEventListener('click', loadArticlesFromSystem);
    $('#btnFromPage').addEventListener('click', extractArticleFromPage);
    $('#btnStartSync').addEventListener('click', startSync);

    sendToBackground(MessageType.PING, {}).then(function() {
      state.connected = true;
      $('#connectionStatus').textContent = '已连接';
      $('#connectionStatus').classList.add('connected');
    }).catch(function() {
      state.connected = false;
      $('#connectionStatus').textContent = '未连接';
    });
  });
})();
