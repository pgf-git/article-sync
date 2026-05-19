(function() {
  var MessageType = {
    CONFIG_GET: 'config_get',
    CONFIG_UPDATE: 'config_update',
    PLATFORM_LIST_REQUEST: 'platform_list_request',
    PING: 'ping',
    CROSS_FETCH: 'cross_fetch'
  };

  var STORAGE_KEYS = {
    CONFIG: 'ext_config',
    SCRIPTS: 'ext_scripts',
    CACHE: 'ext_cache'
  };

  function sendToBackground(type, payload) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
        type: type,
        payload: payload || {},
        target: 'background',
        source: 'options',
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

  async function loadConfig() {
    try {
      var config = await sendToBackground(MessageType.CONFIG_GET, {});
      if (config) {
        document.getElementById('serverUrl').value = config.serverUrl || '';
        document.getElementById('wsUrl').value = config.wsUrl || '';
        document.getElementById('concurrency').value = config.concurrency || 3;
        document.getElementById('scriptUpdateInterval').value = config.scriptUpdateInterval ? Math.round(config.scriptUpdateInterval / 60000) : 60;
        document.getElementById('autoSync').checked = !!config.autoSync;
        document.getElementById('debugMode').checked = !!config.debugMode;
      }
    } catch (e) {
      showToast('加载配置失败', 'error');
    }
  }

  async function saveConfig() {
    var config = {
      serverUrl: document.getElementById('serverUrl').value.trim(),
      wsUrl: document.getElementById('wsUrl').value.trim(),
      concurrency: parseInt(document.getElementById('concurrency').value) || 3,
      scriptUpdateInterval: (parseInt(document.getElementById('scriptUpdateInterval').value) || 60) * 60000,
      autoSync: document.getElementById('autoSync').checked,
      debugMode: document.getElementById('debugMode').checked
    };

    if (!config.serverUrl) {
      showToast('请输入系统地址', 'error');
      return;
    }

    try {
      await sendToBackground(MessageType.CONFIG_UPDATE, config);
      showToast('配置已保存', 'success');
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  async function testConnection() {
    var serverUrl = document.getElementById('serverUrl').value.trim();
    if (!serverUrl) {
      showToast('请先输入系统地址', 'error');
      return;
    }

    showToast('正在测试连接...', 'info');
    try {
      var result = await sendToBackground(MessageType.CROSS_FETCH, {
        url: serverUrl + '/api/v1/health',
        method: 'GET'
      });
      if (result && result.ok) {
        showToast('连接成功', 'success');
        document.getElementById('statusConnection').textContent = '已连接';
        document.getElementById('statusConnection').className = 'status-value connected';
      } else {
        showToast('连接失败: HTTP ' + (result ? result.status : 'unknown'), 'error');
        document.getElementById('statusConnection').textContent = '连接失败';
        document.getElementById('statusConnection').className = 'status-value disconnected';
      }
    } catch (e) {
      showToast('连接失败: ' + e.message, 'error');
      document.getElementById('statusConnection').textContent = '连接失败';
      document.getElementById('statusConnection').className = 'status-value disconnected';
    }
  }

  async function updateScripts() {
    showToast('正在更新脚本...', 'info');
    try {
      await sendToBackground(MessageType.CONFIG_UPDATE, {
        serverUrl: document.getElementById('serverUrl').value.trim(),
        wsUrl: document.getElementById('wsUrl').value.trim()
      });
      showToast('脚本更新完成', 'success');
      refreshStatus();
    } catch (e) {
      showToast('更新失败: ' + e.message, 'error');
    }
  }

  async function clearCache() {
    if (!confirm('确定要清除所有缓存数据吗？')) return;
    try {
      await chrome.storage.local.remove([STORAGE_KEYS.SCRIPTS, STORAGE_KEYS.CACHE]);
      showToast('缓存已清除', 'success');
      refreshStatus();
    } catch (e) {
      showToast('清除失败: ' + e.message, 'error');
    }
  }

  async function refreshStatus() {
    try {
      var platforms = await sendToBackground(MessageType.PLATFORM_LIST_REQUEST, {});
      document.getElementById('statusPlatforms').textContent = platforms && platforms.platforms ? platforms.platforms.length : 0;

      var scriptsData = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
      var scripts = scriptsData[STORAGE_KEYS.SCRIPTS] || {};
      document.getElementById('statusCache').textContent = Object.keys(scripts).length;

      try {
        await sendToBackground(MessageType.PING, {});
        document.getElementById('statusConnection').textContent = '已连接';
        document.getElementById('statusConnection').className = 'status-value connected';
      } catch (e) {
        document.getElementById('statusConnection').textContent = '未连接';
        document.getElementById('statusConnection').className = 'status-value disconnected';
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function() {
    loadConfig();
    refreshStatus();

    document.getElementById('btnSave').addEventListener('click', saveConfig);
    document.getElementById('btnTestConnection').addEventListener('click', testConnection);
    document.getElementById('btnUpdateScripts').addEventListener('click', updateScripts);
    document.getElementById('btnClearCache').addEventListener('click', clearCache);
  });
})();
