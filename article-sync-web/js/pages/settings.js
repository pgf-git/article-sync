var SettingsPage = (function () {
  var webhooks = [];
  var currentTab = 'webhooks';

  function render() {
    return '<div class="tabs" id="settingsTabs">' +
      '<div class="tab-item active" data-tab="webhooks">Webhook 管理</div>' +
      '<div class="tab-item" data-tab="extension">扩展管理</div>' +
      '<div class="tab-item" data-tab="stats">数据统计</div>' +
      '<div class="tab-item" data-tab="about">关于</div>' +
      '</div>' +
      '<div id="settingsContent"></div>';
  }

  function init() {
    document.querySelectorAll('#settingsTabs .tab-item').forEach(function (tab) {
      tab.addEventListener('click', function () {
        currentTab = this.getAttribute('data-tab');
        document.querySelectorAll('#settingsTabs .tab-item').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        renderTab();
      });
    });
    renderTab();
  }

  function renderTab() {
    var content = document.getElementById('settingsContent');
    switch (currentTab) {
      case 'webhooks': renderWebhooks(content); break;
      case 'extension': renderExtension(content); break;
      case 'stats': renderStats(content); break;
      case 'about': renderAbout(content); break;
    }
  }

  function renderWebhooks(container) {
    App.api.getWebhooks().then(function (res) {
      webhooks = res.data || res || [];
      if (!Array.isArray(webhooks)) webhooks = [];
      container.innerHTML = '<div class="toolbar"><div class="toolbar-left"><h3 style="font-size:14px;color:var(--text-secondary)">Webhook 列表</h3></div><div class="toolbar-right"><button class="btn btn-primary" id="btnAddWebhook">+ 新增 Webhook</button></div></div>' +
        '<div id="webhookList">' + renderWebhookList() + '</div>';
      document.getElementById('btnAddWebhook').addEventListener('click', function () { openWebhookModal(); });
      bindWebhookEvents();
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">加载失败: ' + App.escapeHtml(err.message) + '</div></div>';
    });
  }

  function renderWebhookList() {
    if (!webhooks.length) {
      return '<div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">暂无 Webhook</div></div>';
    }
    return webhooks.map(function (w) {
      return '<div class="webhook-item">' +
        '<div class="webhook-info">' +
        '<div class="webhook-url">' + App.escapeHtml(w.url || '-') + '</div>' +
        '<div class="webhook-events">事件: ' + App.escapeHtml((w.events || []).join(', ') || '-') + '</div>' +
        '</div>' +
        '<div class="btn-group">' +
        '<button class="btn btn-default btn-sm" data-action="edit-webhook" data-id="' + w.id + '">编辑</button>' +
        '<button class="btn btn-danger btn-sm" data-action="delete-webhook" data-id="' + w.id + '">删除</button>' +
        '</div></div>';
    }).join('');
  }

  function bindWebhookEvents() {
    document.querySelectorAll('[data-action="edit-webhook"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var wh = webhooks.find(function (w) { return w.id == id; });
        if (wh) openWebhookModal(wh);
      });
    });
    document.querySelectorAll('[data-action="delete-webhook"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        App.showConfirm('删除 Webhook', '确定要删除此 Webhook 吗？', function () {
          App.api.deleteWebhook(id).then(function () {
            App.toast('success', 'Webhook 已删除');
            renderTab();
          }).catch(function (err) {
            App.toast('error', '删除失败: ' + err.message);
          });
        });
      });
    });
  }

  function openWebhookModal(webhook) {
    var isEdit = !!webhook;
    var body = '<div class="form-group"><label class="form-label">URL</label><input type="text" class="form-input" id="webhookUrl" value="' + App.escapeHtml(webhook ? webhook.url || '' : '') + '" placeholder="https://example.com/webhook"></div>' +
      '<div class="form-group"><label class="form-label">密钥 (Secret)</label><input type="text" class="form-input" id="webhookSecret" value="' + App.escapeHtml(webhook ? webhook.secret || '' : '') + '" placeholder="用于签名验证"></div>' +
      '<div class="form-group"><label class="form-label">事件</label><div class="checkbox-group">' +
      '<div class="checkbox-item"><input type="checkbox" class="webhook-event" value="sync.started" ' + (isEdit && webhook.events && webhook.events.indexOf('sync.started') > -1 ? 'checked' : '') + '><label>同步开始</label></div>' +
      '<div class="checkbox-item"><input type="checkbox" class="webhook-event" value="sync.completed" ' + (isEdit && webhook.events && webhook.events.indexOf('sync.completed') > -1 ? 'checked' : '') + '><label>同步完成</label></div>' +
      '<div class="checkbox-item"><input type="checkbox" class="webhook-event" value="sync.failed" ' + (isEdit && webhook.events && webhook.events.indexOf('sync.failed') > -1 ? 'checked' : '') + '><label>同步失败</label></div>' +
      '<div class="checkbox-item"><input type="checkbox" class="webhook-event" value="article.created" ' + (isEdit && webhook.events && webhook.events.indexOf('article.created') > -1 ? 'checked' : '') + '><label>文章创建</label></div>' +
      '<div class="checkbox-item"><input type="checkbox" class="webhook-event" value="article.updated" ' + (isEdit && webhook.events && webhook.events.indexOf('article.updated') > -1 ? 'checked' : '') + '><label>文章更新</label></div>' +
      '</div></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalSaveBtn">' + (isEdit ? '保存' : '创建') + '</button>';
    App.openModal(isEdit ? '编辑 Webhook' : '新增 Webhook', body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalSaveBtn').addEventListener('click', function () {
      var url = document.getElementById('webhookUrl').value.trim();
      var secret = document.getElementById('webhookSecret').value.trim();
      var events = [];
      document.querySelectorAll('.webhook-event:checked').forEach(function (cb) { events.push(cb.value); });
      if (!url) { App.toast('warning', '请输入 Webhook URL'); return; }
      var data = { url: url, secret: secret, events: events };
      var promise = isEdit ? App.api.updateWebhook(webhook.id, data) : App.api.createWebhook(data);
      promise.then(function () {
        App.closeModal();
        App.toast('success', isEdit ? 'Webhook 已更新' : 'Webhook 已创建');
        renderTab();
      }).catch(function (err) {
        App.toast('error', (isEdit ? '更新' : '创建') + '失败: ' + err.message);
      });
    });
  }

  function renderExtension(container) {
    var online = App.isExtensionOnline();
    container.innerHTML = '<div class="card"><div class="card-header"><h3 class="card-title">扩展状态</h3></div><div class="card-body">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
      '<span class="status-dot ' + (online ? 'online' : 'offline') + '"></span>' +
      '<span style="font-size:16px;font-weight:500">' + (online ? '在线' : '离线') + '</span>' +
      '</div>' +
      '<p style="color:var(--text-secondary);margin-bottom:16px">扩展通过 postMessage 与本系统通信，心跳间隔为 30 秒。</p>' +
      '<button class="btn btn-primary" id="btnCheckExtension">检测扩展</button>' +
      '</div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card-header"><h3 class="card-title">心跳记录</h3></div><div class="card-body" id="heartbeatLog"><div class="empty-state"><div class="empty-state-icon">💓</div><div class="empty-state-text">暂无心跳记录</div></div></div></div>';
    document.getElementById('btnCheckExtension').addEventListener('click', function () {
      window.postMessage({ type: 'ARTICLE_SYNC_WEB', action: 'ping' }, '*');
      App.toast('info', '已发送检测请求');
      setTimeout(function () {
        var isOnline = App.isExtensionOnline();
        App.toast(isOnline ? 'success' : 'warning', isOnline ? '扩展在线' : '扩展未响应');
        renderExtension(container);
      }, 3000);
    });
    App.api.getExtensionConfig().then(function (res) {
      var config = res.data || res || {};
      if (config.lastHeartbeat) {
        document.getElementById('heartbeatLog').innerHTML = '<div style="color:var(--text-secondary)">' +
          '<p>最后心跳: ' + App.formatDate(config.lastHeartbeat) + '</p>' +
          '<p>扩展版本: ' + App.escapeHtml(config.version || '-') + '</p>' +
          '</div>';
      }
    }).catch(function () {});
  }

  function renderStats(container) {
    container.innerHTML = '<div class="stat-cards" id="settingsStatsCards"><div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card-header"><h3 class="card-title">耗时分析</h3></div><div class="card-body" id="timeAnalysis"><div class="loading-spinner"><div class="spinner"></div></div></div></div>';
    App.api.getStatsOverview().then(function (res) {
      var d = res.data || res || {};
      document.getElementById('settingsStatsCards').innerHTML =
        '<div class="stat-card"><div class="stat-icon blue">📊</div><div class="stat-info"><div class="stat-value">' + (d.successRate || 0) + '%</div><div class="stat-label">成功率</div></div></div>' +
        '<div class="stat-card"><div class="stat-icon green">⏱️</div><div class="stat-info"><div class="stat-value">' + (d.avgDuration || '-') + '</div><div class="stat-label">平均耗时</div></div></div>' +
        '<div class="stat-card"><div class="stat-icon orange">📈</div><div class="stat-info"><div class="stat-value">' + (d.totalSyncs || 0) + '</div><div class="stat-label">总同步次数</div></div></div>' +
        '<div class="stat-card"><div class="stat-icon red">❌</div><div class="stat-info"><div class="stat-value">' + (d.failedCount || 0) + '</div><div class="stat-label">失败次数</div></div></div>';
    }).catch(function () {
      document.getElementById('settingsStatsCards').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-text">加载统计数据失败</div></div>';
    });
    App.api.getPlatformStats().then(function (res) {
      var data = res.data || res || [];
      if (!Array.isArray(data) || !data.length) {
        document.getElementById('timeAnalysis').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无数据</div></div>';
        return;
      }
      document.getElementById('timeAnalysis').innerHTML = '<div class="table-wrapper"><table><thead><tr><th>平台</th><th>同步次数</th><th>成功率</th><th>平均耗时</th></tr></thead><tbody>' +
        data.map(function (d) {
          return '<tr><td>' + App.escapeHtml(d.platform || d.name || '-') + '</td><td>' + (d.count || 0) + '</td><td>' + (d.successRate || 0) + '%</td><td>' + (d.avgDuration || '-') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }).catch(function () {
      document.getElementById('timeAnalysis').innerHTML = '<div class="empty-state"><div class="empty-state-text">加载失败</div></div>';
    });
  }

  function renderAbout(container) {
    container.innerHTML = '<div class="card"><div class="card-header"><h3 class="card-title">关于</h3></div><div class="card-body">' +
      '<div style="text-align:center;padding:24px">' +
      '<div style="font-size:48px;margin-bottom:16px">📄</div>' +
      '<h2 style="font-size:20px;margin-bottom:8px">文章同步管理系统</h2>' +
      '<p style="color:var(--text-secondary);margin-bottom:16px">Article Sync Web Management System</p>' +
      '<p style="color:var(--text-tertiary);margin-bottom:8px">版本: 1.0.0</p>' +
      '<p style="color:var(--text-tertiary);margin-bottom:8px">后端 API: http://localhost:3001</p>' +
      '<p style="color:var(--text-tertiary);margin-bottom:8px">WebSocket: ws://localhost:3001/ws</p>' +
      '<p style="color:var(--text-tertiary)">与文章同步助手浏览器扩展配套使用的 Web 管理系统</p>' +
      '</div></div></div>';
  }

  return { render: render, init: init };
})();

App.registerPage('/settings', SettingsPage);
