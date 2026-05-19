var ArticleSyncSDK = (function () {
  var extensionInstalled = false;
  var heartbeatTimer = null;
  var progressCallbacks = [];
  var completeCallbacks = [];
  var pingTimer = null;

  function init() {
    window.addEventListener('message', handleMessage);
    startPing();
  }

  function handleMessage(event) {
    if (!event.data || event.data.type !== 'ARTICLE_SYNC_EXTENSION') return;
    var action = event.data.action;
    var payload = event.data.payload;

    switch (action) {
      case 'pong':
        extensionInstalled = true;
        App.setExtensionOnline(true);
        break;
      case 'heartbeat':
        extensionInstalled = true;
        App.setExtensionOnline(true);
        break;
      case 'syncProgress':
        progressCallbacks.forEach(function (cb) {
          try { cb(payload); } catch (e) { console.error(e); }
        });
        break;
      case 'syncComplete':
        completeCallbacks.forEach(function (cb) {
          try { cb(payload); } catch (e) { console.error(e); }
        });
        break;
      case 'testResult':
        if (payload && payload.success) {
          App.toast('success', '测试通过: ' + (payload.message || ''));
        } else {
          App.toast('error', '测试失败: ' + (payload.message || payload.error || '未知错误'));
        }
        break;
      case 'deployResult':
        if (payload && payload.success) {
          App.toast('success', '部署成功: ' + (payload.message || ''));
        } else {
          App.toast('error', '部署失败: ' + (payload.message || payload.error || '未知错误'));
        }
        break;
    }
  }

  function startPing() {
    sendPing();
    pingTimer = setInterval(sendPing, 15000);
  }

  function sendPing() {
    window.postMessage({ type: 'ARTICLE_SYNC_WEB', action: 'ping' }, '*');
  }

  function isInstalled() {
    return extensionInstalled;
  }

  function syncArticle(article, platforms) {
    window.postMessage({
      type: 'ARTICLE_SYNC_WEB',
      action: 'syncArticle',
      payload: {
        article: article,
        platforms: platforms || []
      }
    }, '*');
  }

  function syncArticles(articles) {
    articles.forEach(function (article) {
      syncArticle(article, []);
    });
  }

  function onSyncProgress(callback) {
    progressCallbacks.push(callback);
    return function () {
      progressCallbacks = progressCallbacks.filter(function (cb) { return cb !== callback; });
    };
  }

  function onSyncComplete(callback) {
    completeCallbacks.push(callback);
    return function () {
      completeCallbacks = completeCallbacks.filter(function (cb) { return cb !== callback; });
    };
  }

  function deployScript(platformId, content) {
    window.postMessage({
      type: 'ARTICLE_SYNC_WEB',
      action: 'deployScript',
      platformId: platformId,
      content: content
    }, '*');
  }

  function testScript(platformId, testType, articleId) {
    window.postMessage({
      type: 'ARTICLE_SYNC_WEB',
      action: 'testScript',
      platformId: platformId,
      testType: testType,
      articleId: articleId
    }, '*');
  }

  init();

  return {
    isInstalled: isInstalled,
    syncArticle: syncArticle,
    syncArticles: syncArticles,
    onSyncProgress: onSyncProgress,
    onSyncComplete: onSyncComplete,
    deployScript: deployScript,
    testScript: testScript
  };
})();
