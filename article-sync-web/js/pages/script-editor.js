var ScriptEditorPage = (function () {
  var platforms = [];
  var currentPlatform = null;
  var scriptContent = '';
  var scriptType = 'dom-script';
  var visualSteps = [];
  var mode = 'code';
  var versions = [];

  function render(query) {
    var preselect = query && query.platform ? query.platform : '';
    return '<div style="display:flex;gap:16px;height:calc(100vh - var(--topbar-height) - 48px)">' +
      '<div style="width:220px;flex-shrink:0;overflow-y:auto" class="card" id="platformList"></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0">' +
      '<div class="toolbar" style="flex-shrink:0">' +
      '<div class="toolbar-left">' +
      '<button class="btn btn-primary" id="btnSave">💾 保存</button>' +
      '<button class="btn btn-default" id="btnVersions">📋 版本历史</button>' +
      '<button class="btn btn-default" id="btnDeploy">🚀 部署到扩展</button>' +
      '<button class="btn btn-default" id="btnTest">🧪 测试</button>' +
      '</div>' +
      '<div class="toolbar-right">' +
      '<div class="tabs" style="margin-bottom:0;border-bottom:none" id="modeTabs">' +
      '<div class="tab-item active" data-mode="code">代码模式</div>' +
      '<div class="tab-item" data-mode="visual">可视化模式</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="editorArea" style="flex:1;min-height:0;overflow:hidden"></div>' +
      '<div id="consoleArea" style="flex-shrink:0;margin-top:8px"></div>' +
      '</div>' +
      '</div>' +
      '<input type="hidden" id="preselectPlatform" value="' + App.escapeHtml(preselect) + '">';
  }

  function init() {
    document.getElementById('btnSave').addEventListener('click', saveScript);
    document.getElementById('btnVersions').addEventListener('click', openVersions);
    document.getElementById('btnDeploy').addEventListener('click', deployToExtension);
    document.getElementById('btnTest').addEventListener('click', openTestPanel);
    document.querySelectorAll('#modeTabs .tab-item').forEach(function (tab) {
      tab.addEventListener('click', function () {
        mode = this.getAttribute('data-mode');
        document.querySelectorAll('#modeTabs .tab-item').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        renderEditor();
      });
    });
    loadPlatforms();
  }

  function loadPlatforms() {
    App.api.getPlatforms().then(function (res) {
      platforms = res.data || res || [];
      if (!Array.isArray(platforms)) platforms = [];
      renderPlatformList();
      var preselect = document.getElementById('preselectPlatform');
      if (preselect && preselect.value) {
        selectPlatform(preselect.value);
      } else if (platforms.length) {
        selectPlatform(platforms[0].id);
      }
    }).catch(function (err) {
      App.toast('error', '加载平台失败: ' + err.message);
    });
  }

  function renderPlatformList() {
    var list = document.getElementById('platformList');
    list.innerHTML = '<h3 style="font-size:14px;font-weight:600;margin-bottom:12px">平台列表</h3>' +
      platforms.map(function (p) {
        var isActive = currentPlatform && currentPlatform.id === p.id;
        return '<div class="nav-item ' + (isActive ? 'active' : '') + '" data-platform-id="' + p.id + '" style="margin:0 0 4px 0;padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;' +
          (isActive ? 'background:var(--primary);color:var(--text-inverse)' : 'background:var(--bg-tertiary)') + '">' +
          '<span style="margin-right:6px">' + (p.icon || '🖥️') + '</span>' +
          '<span>' + App.escapeHtml(p.name || p.id) + '</span>' +
          '</div>';
      }).join('');
    list.querySelectorAll('[data-platform-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectPlatform(this.getAttribute('data-platform-id'));
      });
    });
  }

  function selectPlatform(id) {
    currentPlatform = platforms.find(function (p) { return p.id === id; });
    if (currentPlatform) {
      scriptType = currentPlatform.type || 'dom-script';
      if (scriptType !== 'config-dsl') {
        mode = 'code';
        document.querySelectorAll('#modeTabs .tab-item').forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-mode') === 'code');
        });
      }
    }
    renderPlatformList();
    loadScript(id);
  }

  function loadScript(id) {
    App.api.getPlatformScript(id).then(function (res) {
      var data = res.data || res || {};
      scriptContent = data.content || data.script || '';
      if (scriptType === 'config-dsl' && typeof scriptContent === 'string') {
        try { visualSteps = JSON.parse(scriptContent); } catch (e) { visualSteps = []; }
      }
      renderEditor();
    }).catch(function (err) {
      scriptContent = '';
      visualSteps = [];
      renderEditor();
    });
  }

  function renderEditor() {
    var area = document.getElementById('editorArea');
    if (mode === 'visual' && scriptType === 'config-dsl') {
      renderVisualEditor(area);
    } else {
      renderCodeEditor(area);
    }
    renderConsole();
  }

  function renderCodeEditor(area) {
    var lines = (scriptContent || '').split('\n');
    var lineNums = lines.map(function (_, i) { return '<div class="code-editor-line-num">' + (i + 1) + '</div>'; }).join('');
    area.innerHTML = '<div class="code-editor" style="height:100%">' +
      '<div class="code-editor-header"><span class="code-editor-lang">' + App.escapeHtml(scriptType || 'javascript') + '</span></div>' +
      '<div class="code-editor-body" style="height:calc(100% - 36px)">' +
      '<div class="code-editor-lines" id="codeLines">' + lineNums + '</div>' +
      '<textarea class="code-editor-textarea" id="codeTextarea" spellcheck="false">' + App.escapeHtml(scriptContent || '') + '</textarea>' +
      '</div></div>';
    var textarea = document.getElementById('codeTextarea');
    var linesEl = document.getElementById('codeLines');
    textarea.addEventListener('input', function () {
      scriptContent = this.value;
      updateLineNumbers();
    });
    textarea.addEventListener('scroll', function () {
      linesEl.scrollTop = this.scrollTop;
    });
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        scriptContent = this.value;
        updateLineNumbers();
      }
    });
  }

  function updateLineNumbers() {
    var linesEl = document.getElementById('codeLines');
    var textarea = document.getElementById('codeTextarea');
    if (!linesEl || !textarea) return;
    var lines = textarea.value.split('\n');
    linesEl.innerHTML = lines.map(function (_, i) { return '<div class="code-editor-line-num">' + (i + 1) + '</div>'; }).join('');
  }

  function renderVisualEditor(area) {
    if (!visualSteps.length) {
      visualSteps = [{ type: 'navigate', selector: '', value: '', timeout: 5000 }];
    }
    area.innerHTML = '<div style="height:100%;overflow-y:auto;padding:16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:600">步骤列表</h3>' +
      '<button class="btn btn-primary btn-sm" id="btnAddStep">+ 添加步骤</button>' +
      '</div>' +
      '<ul class="step-list" id="stepList">' + visualSteps.map(function (step, i) {
        return renderStepItem(step, i);
      }).join('') + '</ul>' +
      '</div>';
    document.getElementById('btnAddStep').addEventListener('click', function () {
      visualSteps.push({ type: 'click', selector: '', value: '', timeout: 5000 });
      renderVisualEditor(area);
    });
    bindStepEvents();
  }

  function renderStepItem(step, index) {
    var types = ['navigate', 'click', 'type', 'wait', 'screenshot', 'upload', 'evaluate'];
    var typeOptions = types.map(function (t) { return '<option value="' + t + '"' + (step.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    return '<li class="step-item" draggable="true" data-index="' + index + '">' +
      '<span class="step-handle">⠿</span>' +
      '<span class="step-index">' + (index + 1) + '</span>' +
      '<div class="step-content">' +
      '<select class="form-input step-type" data-index="' + index + '" style="max-width:120px">' + typeOptions + '</select>' +
      '<input type="text" class="form-input step-selector" data-index="' + index + '" placeholder="selector" value="' + App.escapeHtml(step.selector || '') + '">' +
      '<input type="text" class="form-input step-value" data-index="' + index + '" placeholder="value" value="' + App.escapeHtml(step.value || '') + '">' +
      '<input type="number" class="form-input step-timeout" data-index="' + index + '" placeholder="timeout" value="' + (step.timeout || 5000) + '" style="max-width:100px">' +
      '</div>' +
      '<button class="step-remove" data-index="' + index + '">✕</button>' +
      '</li>';
  }

  function bindStepEvents() {
    document.querySelectorAll('.step-type').forEach(function (el) {
      el.addEventListener('change', function () {
        var i = parseInt(this.getAttribute('data-index'));
        visualSteps[i].type = this.value;
      });
    });
    document.querySelectorAll('.step-selector').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(this.getAttribute('data-index'));
        visualSteps[i].selector = this.value;
      });
    });
    document.querySelectorAll('.step-value').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(this.getAttribute('data-index'));
        visualSteps[i].value = this.value;
      });
    });
    document.querySelectorAll('.step-timeout').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(this.getAttribute('data-index'));
        visualSteps[i].timeout = parseInt(this.value) || 5000;
      });
    });
    document.querySelectorAll('.step-remove').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(this.getAttribute('data-index'));
        visualSteps.splice(i, 1);
        var area = document.getElementById('editorArea');
        renderVisualEditor(area);
      });
    });
    var stepItems = document.querySelectorAll('.step-item');
    stepItems.forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', this.getAttribute('data-index'));
        this.classList.add('dragging');
      });
      item.addEventListener('dragend', function () {
        this.classList.remove('dragging');
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        var fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        var toIndex = parseInt(this.getAttribute('data-index'));
        if (fromIndex !== toIndex) {
          var moved = visualSteps.splice(fromIndex, 1)[0];
          visualSteps.splice(toIndex, 0, moved);
          var area = document.getElementById('editorArea');
          renderVisualEditor(area);
        }
      });
    });
  }

  function renderConsole() {
    var consoleArea = document.getElementById('consoleArea');
    consoleArea.innerHTML = '<div class="console-output" id="scriptConsole"><div class="console-line info">准备就绪</div></div>';
  }

  function appendConsole(msg, level) {
    var el = document.getElementById('scriptConsole');
    if (!el) return;
    var cls = level || 'info';
    el.innerHTML += '<div class="console-line ' + cls + '">[' + new Date().toLocaleTimeString() + '] ' + App.escapeHtml(msg) + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function saveScript() {
    if (!currentPlatform) { App.toast('warning', '请先选择平台'); return; }
    var content = mode === 'visual' && scriptType === 'config-dsl' ? JSON.stringify(visualSteps, null, 2) : scriptContent;
    App.api.updatePlatformScript(currentPlatform.id, { content: content, type: scriptType }).then(function () {
      App.toast('success', '脚本已保存');
      appendConsole('脚本保存成功', 'success');
    }).catch(function (err) {
      App.toast('error', '保存失败: ' + err.message);
      appendConsole('保存失败: ' + err.message, 'error');
    });
  }

  function openVersions() {
    if (!currentPlatform) { App.toast('warning', '请先选择平台'); return; }
    App.api.getScriptVersions(currentPlatform.id).then(function (res) {
      versions = res.data || res || [];
      if (!Array.isArray(versions)) versions = [];
      var body = '';
      if (!versions.length) {
        body = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">暂无版本历史</div></div>';
      } else {
        body = '<div class="table-wrapper"><table><thead><tr><th>版本</th><th>时间</th><th>操作</th></tr></thead><tbody>' +
          versions.map(function (v) {
            return '<tr><td>' + App.escapeHtml(v.version || v.id || '-') + '</td><td>' + App.formatDate(v.createdAt || v.timestamp) + '</td><td><div class="btn-group"><button class="btn btn-link btn-sm" data-view="' + App.escapeHtml(v.version || v.id) + '">查看</button><button class="btn btn-link btn-sm" data-rollback="' + App.escapeHtml(v.version || v.id) + '">回滚</button></div></td></tr>';
          }).join('') +
          '</tbody></table></div>';
      }
      var footer = '<button class="btn btn-default" id="modalCancelBtn">关闭</button>';
      App.openModal('版本历史 - ' + (currentPlatform.name || currentPlatform.id), body, footer, true);
      document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
      document.querySelectorAll('[data-view]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ver = this.getAttribute('data-view');
          var v = versions.find(function (v) { return (v.version || v.id) == ver; });
          if (v && v.content) {
            scriptContent = v.content;
            if (scriptType === 'config-dsl') {
              try { visualSteps = JSON.parse(v.content); } catch (e) { visualSteps = []; }
            }
            renderEditor();
            App.toast('info', '已加载版本 ' + ver + ' 的内容');
          }
        });
      });
      document.querySelectorAll('[data-rollback]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ver = this.getAttribute('data-rollback');
          App.showConfirm('回滚版本', '确定要回滚到版本 ' + ver + ' 吗？', function () {
            App.api.rollbackScript(currentPlatform.id, ver).then(function () {
              App.toast('success', '已回滚到版本 ' + ver);
              App.closeModal();
              loadScript(currentPlatform.id);
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

  function deployToExtension() {
    if (!currentPlatform) { App.toast('warning', '请先选择平台'); return; }
    var content = mode === 'visual' && scriptType === 'config-dsl' ? JSON.stringify(visualSteps, null, 2) : scriptContent;
    if (typeof ArticleSyncSDK !== 'undefined') {
      ArticleSyncSDK.deployScript(currentPlatform.id, content);
      appendConsole('脚本已部署到扩展: ' + (currentPlatform.name || currentPlatform.id), 'success');
    } else {
      window.postMessage({ type: 'ARTICLE_SYNC_WEB', action: 'deployScript', platformId: currentPlatform.id, content: content }, '*');
      appendConsole('脚本部署请求已发送', 'info');
    }
    App.toast('success', '脚本已部署到扩展');
  }

  function openTestPanel() {
    if (!currentPlatform) { App.toast('warning', '请先选择平台'); return; }
    var body = '<div class="form-group"><label class="form-label">测试类型</label>' +
      '<select class="form-select" id="testType"><option value="account">测试账号识别</option><option value="upload">测试图片上传</option><option value="sync">测试文章同步</option></select></div>' +
      '<div class="form-group"><label class="form-label">测试文章 ID（可选）</label><input type="text" class="form-input" id="testArticleId" placeholder="留空使用默认测试数据"></div>';
    var footer = '<button class="btn btn-default" id="modalCancelBtn">取消</button><button class="btn btn-primary" id="modalRunTestBtn">运行测试</button>';
    App.openModal('测试 - ' + (currentPlatform.name || currentPlatform.id), body, footer);
    document.getElementById('modalCancelBtn').addEventListener('click', App.closeModal);
    document.getElementById('modalRunTestBtn').addEventListener('click', function () {
      var testType = document.getElementById('testType').value;
      var articleId = document.getElementById('testArticleId').value.trim();
      App.closeModal();
      appendConsole('开始测试: ' + testType + ' (平台: ' + (currentPlatform.name || currentPlatform.id) + ')', 'info');
      if (typeof ArticleSyncSDK !== 'undefined') {
        ArticleSyncSDK.testScript(currentPlatform.id, testType, articleId);
      } else {
        window.postMessage({ type: 'ARTICLE_SYNC_WEB', action: 'testScript', platformId: currentPlatform.id, testType: testType, articleId: articleId }, '*');
      }
      appendConsole('测试请求已发送到扩展', 'info');
    });
  }

  return { render: render, init: init };
})();

App.registerPage('/script-editor', ScriptEditorPage);
