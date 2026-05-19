var ArticlesPage = (function () {
  var articles = [];
  var platforms = [];
  var searchKeyword = '';
  var statusFilter = '';
  var currentPage = 1;
  var pageSize = 10;
  var total = 0;

  function render() {
    return '<div class="toolbar">' +
      '<div class="toolbar-left"><button class="btn btn-primary" id="btnCreateArticle">+ 新建文章</button></div>' +
      '<div class="toolbar-right"><button class="btn btn-default" id="btnSyncToExtension">🔗 同步到扩展</button></div>' +
      '</div>' +
      '<div class="search-bar">' +
      '<input type="text" class="search-input" id="searchInput" placeholder="搜索文章标题...">' +
      '<select class="filter-select" id="statusFilter"><option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select>' +
      '<button class="btn btn-primary" id="btnSearch">搜索</button>' +
      '</div>' +
      '<div class="card"><div class="table-wrapper"><table><thead><tr><th><input type="checkbox" id="selectAll"></th><th>标题</th><th>标签</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody id="articleList"></tbody></table></div></div>' +
      '<div class="pagination" id="pagination"></div>';
  }

  function init() {
    document.getElementById('btnCreateArticle').addEventListener('click', openCreateModal);
    document.getElementById('btnSearch').addEventListener('click', function () { currentPage = 1; loadArticles(); });
    document.getElementById('searchInput').addEventListener('keyup', function (e) { if (e.key === 'Enter') { currentPage = 1; loadArticles(); } });
    document.getElementById('statusFilter').addEventListener('change', function () { currentPage = 1; statusFilter = this.value; loadArticles(); });
    document.getElementById('selectAll').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('.article-checkbox').forEach(function (cb) { cb.checked = checked; });
    });
    document.getElementById('btnSyncToExtension').addEventListener('click', syncToExtension);
    loadArticles();
    loadPlatforms();
  }

  function loadArticles() {
    searchKeyword = document.getElementById('searchInput') ? document.getElementById('searchInput').value : searchKeyword;
    var params = { page: currentPage, pageSize: pageSize };
    if (searchKeyword) params.keyword = searchKeyword;
    if (statusFilter) params.status = statusFilter;
    App.api.getArticles(params).then(function (res) {
      var data = res.data || res || {};
      articles = data.items || data.list || [];
      total = data.total || articles.length;
      renderArticles();
      renderPagination();
    }).catch(function (err) {
      App.toast('error', '加载文章失败: ' + err.message);
    });
  }

  function loadPlatforms() {
    App.api.getPlatforms().then(function (res) {
      platforms = res.data || res || [];
    }).catch(function () {});
  }

  function renderArticles() {
    var tbody = document.getElementById('articleList');
    if (!articles.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">暂无文章</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = articles.map(function (a) {
      var tags = (a.tags || []).map(function (t) { return '<span class="tag tag-blue">' + App.escapeHtml(t) + '</span>'; }).join(' ');
      var statusMap = { draft: '草稿', published: '已发布', archived: '已归档' };
      var statusClassMap = { draft: 'tag-default', published: 'tag-green', archived: 'tag-orange' };
      return '<tr>' +
        '<td><input type="checkbox" class="article-checkbox" data-id="' + a.id + '"></td>' +
        '<td>' + App.escapeHtml(a.title) + '</td>' +
        '<td>' + (tags || '<span class="tag tag-default">无标签</span>') + '</td>' +
        '<td><span class="tag ' + (statusClassMap[a.status] || 'tag-default') + '">' + (statusMap[a.status] || a.status || '-') + '</span></td>' +
        '<td>' + App.formatRelativeTime(a.createdAt) + '</td>' +
        '<td><div class="btn-group">' +
        '<button class="btn btn-link btn-sm" data-action="edit" data-id="' + a.id + '">编辑</button>' +
        '<button class="btn btn-link btn-sm" data-action="sync" data-id="' + a.id + '">同步</button>' +
        '<button class="btn btn-link btn-sm" style="color:var(--error)" data-action="delete" data-id="' + a.id + '">删除</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        if (action === 'edit') openEditModal(id);
        if (action === 'sync') openSyncModal(id);
        if (action === 'delete') confirmDelete(id);
      });
    });
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
        loadArticles();
      });
    });
  }

  function openCreateModal() {
    var body = '<div class="form-group"><label class="form-label">标题</label><input type="text" class="form-input" id="articleTitle" placeholder="请输入文章标题"></div>' +
      '<div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="articleContent" rows="12" placeholder="支持 HTML 和 Markdown 格式"></textarea></div>' +
      '<div class="form-group"><label class="form-label">标签（逗号分隔）</label><input type="text" class="form-input" id="articleTags" placeholder="标签1,标签2"></div>' +
      '<div class="form-group"><label class="form-label">封面图 URL</label><input type="text" class="form-input" id="articleCover" placeholder="https://example.com/cover.jpg"></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalSaveBtn">创建</button>';
    App.openModal('新建文章', body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalSaveBtn').addEventListener('click', saveArticle);
  }

  function openEditModal(id) {
    App.api.getArticle(id).then(function (res) {
      var a = res.data || res;
      var body = '<div class="form-group"><label class="form-label">标题</label><input type="text" class="form-input" id="articleTitle" value="' + App.escapeHtml(a.title || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="articleContent" rows="12">' + App.escapeHtml(a.content || '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label">标签（逗号分隔）</label><input type="text" class="form-input" id="articleTags" value="' + App.escapeHtml((a.tags || []).join(',')) + '"></div>' +
        '<div class="form-group"><label class="form-label">封面图 URL</label><input type="text" class="form-input" id="articleCover" value="' + App.escapeHtml(a.coverImage || '') + '"></div>';
      var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalSaveBtn">保存</button>';
      App.openModal('编辑文章', body, footer);
      document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
      document.getElementById('modalSaveBtn').addEventListener('click', function () { updateArticle(id); });
    }).catch(function (err) {
      App.toast('error', '加载文章失败: ' + err.message);
    });
  }

  function saveArticle() {
    var title = document.getElementById('articleTitle').value.trim();
    var content = document.getElementById('articleContent').value;
    var tags = document.getElementById('articleTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var coverImage = document.getElementById('articleCover').value.trim();
    if (!title) { App.toast('warning', '请输入文章标题'); return; }
    App.api.createArticle({ title: title, content: content, tags: tags, coverImage: coverImage }).then(function () {
      App.closeModal();
      App.toast('success', '文章创建成功');
      loadArticles();
    }).catch(function (err) {
      App.toast('error', '创建失败: ' + err.message);
    });
  }

  function updateArticle(id) {
    var title = document.getElementById('articleTitle').value.trim();
    var content = document.getElementById('articleContent').value;
    var tags = document.getElementById('articleTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var coverImage = document.getElementById('articleCover').value.trim();
    if (!title) { App.toast('warning', '请输入文章标题'); return; }
    App.api.updateArticle(id, { title: title, content: content, tags: tags, coverImage: coverImage }).then(function () {
      App.closeModal();
      App.toast('success', '文章更新成功');
      loadArticles();
    }).catch(function (err) {
      App.toast('error', '更新失败: ' + err.message);
    });
  }

  function confirmDelete(id) {
    var article = articles.find(function (a) { return a.id == id; });
    App.showConfirm('删除文章', '确定要删除文章"' + (article ? article.title : '') + '"吗？此操作不可撤销。', function () {
      App.api.deleteArticle(id).then(function () {
        App.toast('success', '文章已删除');
        loadArticles();
      }).catch(function (err) {
        App.toast('error', '删除失败: ' + err.message);
      });
    });
  }

  function openSyncModal(articleId) {
    var article = articles.find(function (a) { return a.id == articleId; });
    var platformOptions = platforms.map(function (p) {
      return '<div class="checkbox-item"><input type="checkbox" class="sync-platform-checkbox" data-id="' + p.id + '" id="sync_plat_' + p.id + '"><label for="sync_plat_' + p.id + '">' + App.escapeHtml(p.name || p.id) + '</label></div>';
    }).join('');
    var body = '<div class="form-group"><label class="form-label">文章: ' + App.escapeHtml(article ? article.title : '') + '</label></div>' +
      '<div class="form-group"><label class="form-label">选择发布平台</label><div class="checkbox-group" id="syncPlatforms">' + (platformOptions || '<span style="color:var(--text-tertiary)">暂无可用平台</span>') + '</div></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalSyncBtn">创建同步任务</button>';
    App.openModal('同步发布', body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalSyncBtn').addEventListener('click', function () {
      var selectedPlatforms = [];
      document.querySelectorAll('.sync-platform-checkbox:checked').forEach(function (cb) {
        selectedPlatforms.push(cb.getAttribute('data-id'));
      });
      if (!selectedPlatforms.length) { App.toast('warning', '请至少选择一个平台'); return; }
      Promise.all(selectedPlatforms.map(function (pid) {
        return App.api.createSyncTask({ articleId: articleId, platformId: pid });
      })).then(function () {
        App.closeModal();
        App.toast('success', '同步任务已创建');
      }).catch(function (err) {
        App.toast('error', '创建同步任务失败: ' + err.message);
      });
    });
  }

  function syncToExtension() {
    var selected = [];
    document.querySelectorAll('.article-checkbox:checked').forEach(function (cb) {
      var id = cb.getAttribute('data-id');
      var a = articles.find(function (art) { return art.id == id; });
      if (a) selected.push(a);
    });
    if (!selected.length) { App.toast('warning', '请先选择要同步的文章'); return; }
    if (typeof ArticleSyncSDK !== 'undefined') {
      ArticleSyncSDK.syncArticles(selected);
    } else {
      App.toast('warning', '扩展 SDK 未加载');
    }
  }

  return { render: render, init: init };
})();

App.registerPage('/articles', ArticlesPage);
