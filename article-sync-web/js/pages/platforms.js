var PlatformsPage = (function () {
  var platforms = [];

  function render() {
    return '<div class="toolbar">' +
      '<div class="toolbar-left"><h3 style="font-size:14px;color:var(--text-secondary)">平台总数: <span id="platformCount">0</span></h3></div>' +
      '<div class="toolbar-right"><button class="btn btn-primary" id="btnAddPlatform">+ 新增平台</button></div>' +
      '</div>' +
      '<div class="grid-3" id="platformGrid"></div>';
  }

  function init() {
    document.getElementById('btnAddPlatform').addEventListener('click', openAddModal);
    loadPlatforms();
  }

  function loadPlatforms() {
    App.api.getPlatforms().then(function (res) {
      platforms = res.data || res || [];
      if (!Array.isArray(platforms)) platforms = [];
      document.getElementById('platformCount').textContent = platforms.length;
      renderPlatforms();
    }).catch(function (err) {
      App.toast('error', '加载平台失败: ' + err.message);
    });
  }

  function renderPlatforms() {
    var grid = document.getElementById('platformGrid');
    if (!platforms.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🖥️</div><div class="empty-state-text">暂无平台</div></div>';
      return;
    }
    grid.innerHTML = platforms.map(function (p) {
      var typeClass = { 'api-adapter': 'tag-blue', 'dom-script': 'tag-orange', 'config-dsl': 'tag-green' };
      var typeName = { 'api-adapter': 'API适配器', 'dom-script': 'DOM脚本', 'config-dsl': '配置DSL' };
      var enabled = p.enabled !== false;
      return '<div class="platform-card">' +
        '<div class="platform-icon">' + (p.icon || '🖥️') + '</div>' +
        '<div class="platform-info">' +
        '<div class="platform-name">' + App.escapeHtml(p.name || p.id) + '</div>' +
        '<div class="platform-meta">' +
        '<span class="tag ' + (typeClass[p.type] || 'tag-default') + '" style="margin-right:6px">' + (typeName[p.type] || p.type || '-') + '</span>' +
        '<span style="color:var(--text-tertiary)">v' + App.escapeHtml(p.version || '1.0.0') + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="platform-actions">' +
        '<label class="switch"><input type="checkbox" ' + (enabled ? 'checked' : '') + ' data-action="toggle" data-id="' + p.id + '"><span class="switch-slider"></span></label>' +
        '<button class="btn btn-default btn-sm" data-action="script" data-id="' + p.id + '">脚本</button>' +
        '<button class="btn btn-default btn-sm" data-action="versions" data-id="' + p.id + '">版本</button>' +
        '</div>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('[data-action]').forEach(function (el) {
      el.addEventListener('click', function () {
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        if (action === 'toggle') togglePlatform(id, this.checked);
        if (action === 'script') location.hash = '#/script-editor?platform=' + id;
        if (action === 'versions') openVersionsModal(id);
      });
    });
  }

  function togglePlatform(id, enabled) {
    App.api.updatePlatformScript(id, { enabled: enabled }).then(function () {
      App.toast('success', (enabled ? '已启用' : '已禁用') + '平台');
    }).catch(function (err) {
      App.toast('error', '操作失败: ' + err.message);
      loadPlatforms();
    });
  }

  function openAddModal() {
    var body = '<div class="form-group"><label class="form-label">平台名称</label><input type="text" class="form-input" id="platformName" placeholder="例如: 掘金"></div>' +
      '<div class="form-group"><label class="form-label">平台 ID</label><input type="text" class="form-input" id="platformId" placeholder="例如: juejin"></div>' +
      '<div class="form-group"><label class="form-label">类型</label><select class="form-select" id="platformType"><option value="api-adapter">API适配器</option><option value="dom-script">DOM脚本</option><option value="config-dsl">配置DSL</option></select></div>' +
      '<div class="form-group"><label class="form-label">图标 (Emoji)</label><input type="text" class="form-input" id="platformIcon" placeholder="🖥️" maxlength="4"></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalSaveBtn">添加</button>';
    App.openModal('新增平台', body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalSaveBtn').addEventListener('click', addPlatform);
  }

  function addPlatform() {
    var name = document.getElementById('platformName').value.trim();
    var id = document.getElementById('platformId').value.trim();
    var type = document.getElementById('platformType').value;
    var icon = document.getElementById('platformIcon').value.trim() || '🖥️';
    if (!name || !id) { App.toast('warning', '请填写平台名称和ID'); return; }
    App.api.updatePlatformScript(id, { name: name, type: type, icon: icon, enabled: true }).then(function () {
      App.closeModal();
      App.toast('success', '平台添加成功');
      loadPlatforms();
    }).catch(function (err) {
      App.toast('error', '添加失败: ' + err.message);
    });
  }

  function openVersionsModal(platformId) {
    App.api.getScriptVersions(platformId).then(function (res) {
      var versions = res.data || res || [];
      if (!Array.isArray(versions)) versions = [];
      var body = '';
      if (!versions.length) {
        body = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">暂无版本历史</div></div>';
      } else {
        body = '<div class="table-wrapper"><table><thead><tr><th>版本</th><th>时间</th><th>操作</th></tr></thead><tbody>' +
          versions.map(function (v) {
            return '<tr><td>' + App.escapeHtml(v.version || v.id || '-') + '</td><td>' + App.formatDate(v.createdAt || v.timestamp) + '</td><td><button class="btn btn-link btn-sm" data-rollback="' + App.escapeHtml(v.version || v.id) + '">回滚</button></td></tr>';
          }).join('') +
          '</tbody></table></div>';
      }
      var footer = '<button class="btn btn-default" id="modalCancelBtn">关闭</button>';
      App.openModal('版本历史 - ' + platformId, body, footer, true);
      document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
      document.querySelectorAll('[data-rollback]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var version = this.getAttribute('data-rollback');
          App.showConfirm('回滚版本', '确定要回滚到版本 ' + version + ' 吗？', function () {
            App.api.rollbackScript(platformId, version).then(function () {
              App.toast('success', '已回滚到版本 ' + version);
              App.closeModal();
            }).catch(function (err) {
              App.toast('error', '回滚失败: ' + err.message);
            });
          });
        });
      });
    }).catch(function (err) {
      App.toast('error', '加载版本历史失败: ' + err.message);
    });
  }

  return { render: render, init: init };
})();

App.registerPage('/platforms', PlatformsPage);
