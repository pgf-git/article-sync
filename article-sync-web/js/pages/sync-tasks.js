var SyncTasksPage = (function () {
  var tasks = [];
  var articles = [];
  var platforms = [];
  var statusFilter = '';
  var currentPage = 1;
  var pageSize = 10;
  var total = 0;
  var wsUnsubscribe = null;
  var selectedIds = [];

  function render() {
    return '<div class="toolbar">' +
      '<div class="toolbar-left">' +
      '<button class="btn btn-primary" id="btnCreateTask">+ 创建同步任务</button>' +
      '<button class="btn btn-default" id="btnBatchCancel" disabled>批量取消</button>' +
      '<button class="btn btn-default" id="btnBatchRetry" disabled>批量重试</button>' +
      '</div>' +
      '</div>' +
      '<div class="search-bar">' +
      '<select class="filter-select" id="statusFilter"><option value="">全部状态</option><option value="pending">等待中</option><option value="running">运行中</option><option value="completed">已完成</option><option value="failed">失败</option><option value="cancelled">已取消</option></select>' +
      '</div>' +
      '<div class="card"><div class="table-wrapper"><table><thead><tr><th><input type="checkbox" id="selectAll"></th><th>文章标题</th><th>平台</th><th>状态</th><th>进度</th><th>创建时间</th><th>操作</th></tr></thead><tbody id="taskList"></tbody></table></div></div>' +
      '<div class="pagination" id="pagination"></div>' +
      '<div class="slide-panel-overlay" id="detailOverlay"></div>' +
      '<div class="slide-panel" id="detailPanel">' +
      '<div class="slide-panel-header"><h3 class="slide-panel-title" id="detailTitle">任务详情</h3><button class="slide-panel-close" id="detailClose">&times;</button></div>' +
      '<div class="slide-panel-body" id="detailBody"></div>' +
      '</div>';
  }

  function init() {
    document.getElementById('btnCreateTask').addEventListener('click', openCreateModal);
    document.getElementById('statusFilter').addEventListener('change', function () { statusFilter = this.value; currentPage = 1; loadTasks(); });
    document.getElementById('selectAll').addEventListener('change', function () {
      var checked = this.checked;
      selectedIds = [];
      document.querySelectorAll('.task-checkbox').forEach(function (cb) {
        cb.checked = checked;
        if (checked) selectedIds.push(cb.getAttribute('data-id'));
      });
      updateBatchButtons();
    });
    document.getElementById('btnBatchCancel').addEventListener('click', batchCancel);
    document.getElementById('btnBatchRetry').addEventListener('click', batchRetry);
    document.getElementById('detailOverlay').addEventListener('click', closeDetail);
    document.getElementById('detailClose').addEventListener('click', closeDetail);
    wsUnsubscribe = App.onWsMessage(function (msg) {
      if (msg.type === 'syncProgress' || msg.type === 'syncComplete') {
        loadTasks();
      }
    });
    loadTasks();
    loadArticles();
    loadPlatforms();
  }

  function loadTasks() {
    var params = { page: currentPage, pageSize: pageSize };
    if (statusFilter) params.status = statusFilter;
    App.api.getSyncTasks(params).then(function (res) {
      var data = res.data || res || {};
      tasks = data.items || data.list || [];
      total = data.total || tasks.length;
      renderTasks();
      renderPagination();
    }).catch(function (err) {
      App.toast('error', '加载任务失败: ' + err.message);
    });
  }

  function loadArticles() {
    App.api.getArticles({ pageSize: 100 }).then(function (res) {
      var data = res.data || res || {};
      articles = data.items || data.list || [];
    }).catch(function () {});
  }

  function loadPlatforms() {
    App.api.getPlatforms().then(function (res) {
      platforms = res.data || res || [];
    }).catch(function () {});
  }

  function renderTasks() {
    var tbody = document.getElementById('taskList');
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🔄</div><div class="empty-state-text">暂无同步任务</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = tasks.map(function (t) {
      var statusMap = { pending: '等待中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
      return '<tr>' +
        '<td><input type="checkbox" class="task-checkbox" data-id="' + t.id + '"></td>' +
        '<td>' + App.escapeHtml(t.articleTitle || t.article?.title || '-') + '</td>' +
        '<td>' + App.escapeHtml(t.platformName || t.platform?.name || '-') + '</td>' +
        '<td><span class="status-badge ' + (t.status || 'pending') + '">' + (statusMap[t.status] || t.status || '-') + '</span></td>' +
        '<td><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="width:100px"><div class="progress-bar-fill ' + progressClass(t.status) + '" style="width:' + (t.progress || 0) + '%"></div></div><span style="font-size:12px;color:var(--text-tertiary)">' + (t.progress || 0) + '%</span></div></td>' +
        '<td>' + App.formatRelativeTime(t.createdAt) + '</td>' +
        '<td><div class="btn-group">' +
        '<button class="btn btn-link btn-sm" data-action="detail" data-id="' + t.id + '">详情</button>' +
        (t.status === 'running' ? '<button class="btn btn-link btn-sm" style="color:var(--warning)" data-action="cancel" data-id="' + t.id + '">取消</button>' : '') +
        (t.status === 'failed' ? '<button class="btn btn-link btn-sm" style="color:var(--primary)" data-action="retry" data-id="' + t.id + '">重试</button>' : '') +
        '</div></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('.task-checkbox').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = this.getAttribute('data-id');
        if (this.checked) { if (selectedIds.indexOf(id) === -1) selectedIds.push(id); }
        else { selectedIds = selectedIds.filter(function (sid) { return sid !== id; }); }
        updateBatchButtons();
      });
    });
    tbody.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        if (action === 'detail') openDetail(id);
        if (action === 'cancel') cancelTask(id);
        if (action === 'retry') retryTask(id);
      });
    });
  }

  function progressClass(status) {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'error';
    return '';
  }

  function renderPagination() {
    var totalPages = Math.ceil(total / pageSize) || 1;
    var container = document.getElementById('pagination');
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    var html = '<button class="pagination-btn" ' + (currentPage <= 1 ? 'disabled' : '') + ' data-page="' + (currentPage - 1) + '">‹</button>';
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
        html += '<button class="pagination-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
      } else if (i === currentPage - 3 || i === currentPage + 3) {
        html += '<span style="padding:0 4px">...</span>';
      }
    }
    html += '<button class="pagination-btn" ' + (currentPage >= totalPages ? 'disabled' : '') + ' data-page="' + (currentPage + 1) + '">›</button>';
    container.innerHTML = html;
    container.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentPage = parseInt(this.getAttribute('data-page'));
        loadTasks();
      });
    });
  }

  function updateBatchButtons() {
    document.getElementById('btnBatchCancel').disabled = selectedIds.length === 0;
    document.getElementById('btnBatchRetry').disabled = selectedIds.length === 0;
  }

  function openCreateModal() {
    var articleOptions = articles.map(function (a) { return '<option value="' + a.id + '">' + App.escapeHtml(a.title) + '</option>'; }).join('');
    var platformCheckboxes = platforms.map(function (p) {
      return '<div class="checkbox-item"><input type="checkbox" class="create-task-platform" data-id="' + p.id + '" id="ctp_' + p.id + '"><label for="ctp_' + p.id + '">' + App.escapeHtml(p.name || p.id) + '</label></div>';
    }).join('');
    var body = '<div class="form-group"><label class="form-label">选择文章</label><select class="form-select" id="taskArticle"><option value="">请选择文章</option>' + articleOptions + '</select></div>' +
      '<div class="form-group"><label class="form-label">选择平台</label><div class="checkbox-group">' + (platformCheckboxes || '<span style="color:var(--text-tertiary)">暂无可用平台</span>') + '</div></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalCreateBtn">创建</button>';
    App.openModal('创建同步任务', body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalCreateBtn').addEventListener('click', createTask);
  }

  function createTask() {
    var articleId = document.getElementById('taskArticle').value;
    if (!articleId) { App.toast('warning', '请选择文章'); return; }
    var selectedPlatforms = [];
    document.querySelectorAll('.create-task-platform:checked').forEach(function (cb) {
      selectedPlatforms.push(cb.getAttribute('data-id'));
    });
    if (!selectedPlatforms.length) { App.toast('warning', '请至少选择一个平台'); return; }
    Promise.all(selectedPlatforms.map(function (pid) {
      return App.api.createSyncTask({ articleId: articleId, platformId: pid });
    })).then(function () {
      App.closeModal();
      App.toast('success', '同步任务已创建');
      loadTasks();
    }).catch(function (err) {
      App.toast('error', '创建失败: ' + err.message);
    });
  }

  function cancelTask(id) {
    App.showConfirm('取消任务', '确定要取消此同步任务吗？', function () {
      App.api.cancelSyncTask(id).then(function () {
        App.toast('success', '任务已取消');
        loadTasks();
      }).catch(function (err) {
        App.toast('error', '取消失败: ' + err.message);
      });
    });
  }

  function retryTask(id) {
    App.api.retrySyncTask(id).then(function () {
      App.toast('success', '任务已重新开始');
      loadTasks();
    }).catch(function (err) {
      App.toast('error', '重试失败: ' + err.message);
    });
  }

  function batchCancel() {
    App.showConfirm('批量取消', '确定要取消选中的 ' + selectedIds.length + ' 个任务吗？', function () {
      App.api.batchUpdateStatus({ taskIds: selectedIds, status: 'cancelled' }).then(function () {
        App.toast('success', '已批量取消');
        selectedIds = [];
        loadTasks();
      }).catch(function (err) {
        App.toast('error', '批量取消失败: ' + err.message);
      });
    });
  }

  function batchRetry() {
    App.api.batchUpdateStatus({ taskIds: selectedIds, status: 'pending' }).then(function () {
      App.toast('success', '已批量重试');
      selectedIds = [];
      loadTasks();
    }).catch(function (err) {
      App.toast('error', '批量重试失败: ' + err.message);
    });
  }

  function openDetail(id) {
    App.api.getSyncTask(id).then(function (res) {
      var t = res.data || res;
      var statusMap = { pending: '等待中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
      document.getElementById('detailTitle').textContent = '任务详情 - ' + (t.articleTitle || t.id);
      document.getElementById('detailBody').innerHTML =
        '<div class="form-group"><label class="form-label">文章标题</label><div>' + App.escapeHtml(t.articleTitle || t.article?.title || '-') + '</div></div>' +
        '<div class="form-group"><label class="form-label">平台</label><div>' + App.escapeHtml(t.platformName || t.platform?.name || '-') + '</div></div>' +
        '<div class="form-group"><label class="form-label">状态</label><div><span class="status-badge ' + (t.status || 'pending') + '">' + (statusMap[t.status] || t.status || '-') + '</span></div></div>' +
        '<div class="form-group"><label class="form-label">进度</label><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-bar-fill ' + progressClass(t.status) + '" style="width:' + (t.progress || 0) + '%"></div></div><span>' + (t.progress || 0) + '%</span></div></div>' +
        '<div class="form-group"><label class="form-label">创建时间</label><div>' + App.formatDate(t.createdAt) + '</div></div>' +
        '<div class="form-group"><label class="form-label">更新时间</label><div>' + App.formatDate(t.updatedAt) + '</div></div>' +
        '<div class="form-group"><label class="form-label">结果</label><div>' + App.escapeHtml(t.result || t.error || '-') + '</div></div>' +
        '<div class="form-group"><label class="form-label">执行日志</label><div class="console-output" id="taskLogs">加载中...</div></div>';
      document.getElementById('detailOverlay').classList.add('active');
      document.getElementById('detailPanel').classList.add('active');
      loadTaskLogs(id);
    }).catch(function (err) {
      App.toast('error', '加载任务详情失败: ' + err.message);
    });
  }

  function loadTaskLogs(id) {
    App.api.getTaskLogs(id).then(function (res) {
      var logs = res.data || res || [];
      if (!Array.isArray(logs)) logs = [];
      var el = document.getElementById('taskLogs');
      if (!logs.length) {
        el.innerHTML = '<div class="console-line info">暂无日志</div>';
        return;
      }
      el.innerHTML = logs.map(function (log) {
        var cls = log.level === 'error' ? 'error' : log.level === 'success' ? 'success' : 'info';
        return '<div class="console-line ' + cls + '">[' + App.formatDate(log.timestamp || log.createdAt) + '] ' + App.escapeHtml(log.message || log.msg || JSON.stringify(log)) + '</div>';
      }).join('');
    }).catch(function () {
      var el = document.getElementById('taskLogs');
      if (el) el.innerHTML = '<div class="console-line error">加载日志失败</div>';
    });
  }

  function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('active');
    document.getElementById('detailPanel').classList.remove('active');
  }

  function destroy() {
    if (wsUnsubscribe) { wsUnsubscribe(); wsUnsubscribe = null; }
    closeDetail();
  }

  return { render: render, init: init, destroy: destroy };
})();

App.registerPage('/sync-tasks', SyncTasksPage);
