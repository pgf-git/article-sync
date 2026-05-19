if (location.href.includes('ejiasuji-web/tools.html') || location.href.includes('ejia-express.cn/tools')
  || location.href.includes('ejiasuji-web/video-tools.html') || location.href.includes('ejia-express.cn/video-tools')
  || location.href.includes('http://localhost:3000/portal/') || location.href.includes('www.kuaigaozhushou.cn/portal/')
  || location.href.includes('bg_cross_api=1')) {  

  var globalEvent = {
    handles: {},
    on: function (eventName, fn) {
        if(!this.handles){
            this.handles = {};
        }
        this.handles[eventName] = fn;
    },
    emit: function (eventName) {
        if(this.handles && this.handles[eventName]){
            this.handles[eventName](arguments[1]);
        }
    },
    destory: function (eventName) {
        if(this.handles && this.handles[eventName]) delete this.handles[eventName];
    }
  }; 

  var queryString = window.location.href.split('?')[1] || '';
  var params = {};
  if (queryString) {
    var pairs = queryString.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split('=');
      params[pair[0]] = pair[1];
    }
  }
  if (params['actionExec'] && !params['action']) {
    params['action'] = params['actionExec'];
  }

  function setPageContent() {
    // const title = decodeURIComponent(decodeURIComponent(params.executeScriptTitle)) || '状态检测';
    // const content = decodeURIComponent(decodeURIComponent(params.executeScriptContent)) || '状态检测中，请勿关闭';
    function setMask() {
      if (params.executeScriptContent && !document.querySelector('#custom-plugin-mask')) {
        params.executeScriptTitle && document.querySelector('title') && (document.querySelector('title').innerHTML = decodeURIComponent(decodeURIComponent(params.executeScriptTitle)));
        var tipDom = document.createElement('div');
        tipDom.id = 'custom-plugin-mask';
        tipDom.innerHTML = `
          <style>
            body, html {
                height: 100%;
                overflow: hidden;
            }
          </style>
          <div style="position: absolute; top: 0px; left: 0; z-index: 9999999; width: 100%; height: 100%; background: white; color: black; font-size: 14px; display: flex; align-items: center; justify-content: center;">
            <span style="margin-top: -30px; display: inline-block;">${decodeURIComponent(decodeURIComponent(params.executeScriptContent))}</span>
          </div>
        `
        document.querySelector('body') && document.querySelector('body').appendChild(tipDom);
      }
    }
    setMask();
    setTimeout(setMask, 2000);
    setTimeout(setMask, 4000);
  }
  setPageContent();

  function sendMessage(data) {
    return new Promise(function(resolve, reject) {
      try {
        data.tabId = chrome.runtime;
        data.actionSource = 'crossApi';
        data.actionData = data.actionData ? JSON.stringify(data.actionData) : '';
        chrome.runtime.sendMessage(data);
        globalEvent.on(data.actionId, function(actionData) {
            globalEvent.destory(data.actionId);
            if (actionData.timeout) {
              resolve(JSON.stringify({ timeout: true }));
            } else if (actionData.error) {
              resolve(JSON.stringify({ error: true }));
            } else {
              resolve(actionData);
            }
        });
      } catch (e) {
        reject();
      }
    });
  }

  let chunks = [];
  let blobUrl = '';
  let inFetchAndSendFile = false;
  function base64ToArrayBuffer(base64) {
    // 使用 atob 解码 Base64
    const binaryString = atob(base64);
    const buffer = new ArrayBuffer(binaryString.length);
    const bytes = new Uint8Array(buffer);
    // 将解码后的字符转换为字节
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return buffer;
  }
  function mergeChunks(chunks, mimeType) {
      // 确保分片按顺序排列
      const sortedChunks = chunks.map(function(chunk) {
        return base64ToArrayBuffer(chunk);
      });
      // 计算总长度
      const totalLength = sortedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      // 创建新的ArrayBuffer
      const mergedBuffer = new ArrayBuffer(totalLength);
      const mergedView = new Uint8Array(mergedBuffer);
      // 按顺序复制每个分片
      let offset = 0;
      sortedChunks.forEach(chunk => {
          mergedView.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
      });
      // 创建Blob
      return new Blob([mergedBuffer], { type: mimeType });
  }
  // 监听来自 background 的 fileTransfer 连接
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "fileTransfer") {
      // console.log("Connected to background script");
      let startTime = +new Date();
      port.onMessage.addListener(async (msg) => {
        if (msg.type === "chunk") {
          // console.log("Chunks process", msg.index, msg.total, msg.data instanceof ArrayBuffer, msg);
          chunks[msg.index] = msg.data;

          let fileTransferListenerDataEl = document.querySelector('#fileTransferListenerData');
          if (!fileTransferListenerDataEl) {
            fileTransferListenerDataEl = document.createElement('div');
            fileTransferListenerDataEl.id = 'fileTransferListenerData';
            fileTransferListenerDataEl.style = 'display: none;';
            document.querySelector('body').appendChild(fileTransferListenerDataEl);
          }
          let receivedCount = 0;
          for(const chunk of chunks) {
            if (chunk) {
              receivedCount++;
            }
          }
          fileTransferListenerDataEl.innerHTML = JSON.stringify({receivedCount: receivedCount, total: msg.total, percent: Math.floor((receivedCount / msg.total) * 100)});

          // 发送确认
          port.postMessage({ type: 'ack', index: msg.index});

          if (chunks.length > 0 && receivedCount === msg.total) {
            // console.log("All chunks received", chunks, msg.fileType);
            const startTime2 = +new Date();
            // 创建 Blob 和 URL
            const blob = await mergeChunks(chunks, msg.fileType || 'video/mp4');
            blobUrl = URL.createObjectURL(blob);
            // console.log("Received blobUrl", blobUrl, (+new Date) - startTime, (+new Date) - startTime2);
          }
        } 
        // else if (msg.type === "done") {
        //   if (chunks.length > 0) {
        //     console.log("All chunks received", chunks, msg.fileType);
        //     const startTime2 = +new Date();
        //     // 创建 Blob 和 URL
        //     const blob = await mergeChunks(chunks, msg.fileType || 'video/mp4');
        //     blobUrl = URL.createObjectURL(blob);
        //     console.log("Received blobUrl", blobUrl, (+new Date) - startTime, (+new Date) - startTime2);
        //   }
        // }
      });
    }
  });

  // 监听来自 background 的 cacheFile 连接
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "fileCache") {
      port.onMessage.addListener(async (msg) => {
        let fileCacheListenerDataEl = document.querySelector('#fileCacheListenerData');
        if (!fileCacheListenerDataEl) {
          fileCacheListenerDataEl = document.createElement('div');
          fileCacheListenerDataEl.id = 'fileCacheListenerData';
          fileCacheListenerDataEl.style = 'display: none;';
          document.querySelector('body').appendChild(fileCacheListenerDataEl);
        }
        fileCacheListenerDataEl.innerHTML = JSON.stringify(msg);
      });
    }
  });

  // 监听自定义事件，提供页面脚本与background通信渠道
  document.addEventListener('contentScriptApi', async function(data) {
    var detail = data.detail || {};
    var responseData = {};
    if (detail.actionSource !== 'page') {
      return;
    }
    try {
      if (detail.action === 'fetchAndSendFileToContentScript') {
        if (inFetchAndSendFile) {
          document.dispatchEvent(new CustomEvent('contentScriptApi', { detail: { ...detail, actionSource: 'contentScript', actionData: { blobUrl: '', inFetchAndSendFile: true } }}));
        } else {
          inFetchAndSendFile = true;
          chunks = [];
          blobUrl = '';
          var callRes = await sendMessage({
            action: detail.action,
            actionId: Math.ceil(Math.random() * 10) + '' + (+new Date()),
            actionData: detail.actionData,
            actionTimeout: detail.actionTimeout
          });
          if (callRes.success) {
            document.dispatchEvent(new CustomEvent('contentScriptApi', { detail: { ...detail, actionSource: 'contentScript', actionData: { blobUrl: blobUrl } }}));
          } else {
            document.dispatchEvent(new CustomEvent('contentScriptApi', { detail: { ...detail, actionSource: 'contentScript', actionData: { blobUrl: '' } }}));
          }
        }
      } else {
        responseData = await sendMessage({
          action: detail.action,
          actionId: Math.ceil(Math.random() * 10) + '' + (+new Date()),
          actionData: detail.actionData,
          actionTimeout: detail.actionTimeout
        });
        document.dispatchEvent(new CustomEvent('contentScriptApi', { detail: { ...detail, actionSource: 'contentScript', actionData: responseData }}));
      }
      inFetchAndSendFile = false;
    } catch(e) {
      inFetchAndSendFile = false;
      document.dispatchEvent(new CustomEvent('contentScriptApi', { detail: { ...detail, actionSource: 'contentScript', actionError: true, actionData: null }}));
    }
  });

  var hasAddedContentScriptListener = false;
  document.addEventListener('contentScriptAddListenerFromPage', async function(data) {
    var detail = data.detail || {};
    if (detail.actionSource !== 'contentScriptAddListener' || hasAddedContentScriptListener) {
      return;
    }
    hasAddedContentScriptListener = true;
    var hiddenContentDom = document.createElement('div');
    hiddenContentDom.id = 'contentScriptListenerData';
    hiddenContentDom.style = 'display: none;';
    document.querySelector('body').appendChild(hiddenContentDom);
    chrome.runtime.onMessage.addListener(function (data) {
      // 只接受来源于sendMessageCrossContentScriptFromBg的事件
      if (data.actionSource !== 'sendMessageCrossContentScriptFromBg') {
          return;
      }
      document.querySelector('#contentScriptListenerData').innerHTML = data.actionData;
    });
  });

  if (params.executeScript) {
    document.addEventListener('contentScriptExecuteScriptEndFromPage', async function(data) {
      var detail = data.detail || {};
      if (detail.actionSource !== 'page') {
        return;
      }
      var executeScriptDataPrefix = {
        action: params.action, 
        actionId: decodeURIComponent(params.actionId), 
        actionSource: 'contentScriptExecuteScriptEnd',
      };
      chrome.runtime.sendMessage(Object.assign({}, executeScriptDataPrefix, { 
        waitTime: detail.waitTime,
        actionData: detail.data ? JSON.stringify(detail.data) : ''
      }));
    });

    // 发送message给源平台
    document.addEventListener('sendMessageCrossContentScriptFromPage', async function(data) {
      var detail = data.detail || {};
      if (detail.actionSource !== 'sendMessageCrossContentScript') {
        return;
      }
      chrome.runtime.sendMessage({
        actionSource: 'sendMessageCrossContentScript',
        actionData: JSON.stringify(detail.data) || '{}',
        senderTabId: detail.senderTabId
      });
    });
  }

  $(function() {

    /**
     * 获取 Kimi localStorage 脚本
     */
    if (params.getLocalStorage) {
      setTimeout(function() {
        // 获取当前url的localStorage
        var localStorageLen = window.localStorage.length;
        var localStorageMap = {};
        for(var i = 0; i < localStorageLen; i++) {
            // 获取key 索引从0开始
            var getKey = window.localStorage.key(i);
            // 获取key对应的值
            var getVal = window.localStorage.getItem(getKey);
            // 放进数组
            localStorageMap[getKey] = getVal
        }
        chrome.runtime.sendMessage({ 
          action: params.action, 
          actionId: decodeURIComponent(params.actionId), 
          actionSource: 'getLocalStorage',
          actionData: JSON.stringify(localStorageMap)
        });
      }, 3000);
    }

    chrome.runtime.onMessage.addListener(function (data) {
        // 只接受来源于background的事件
        if (data.actionSource !== 'backgroundCrossApi') {
            return;
        }
        globalEvent.emit(data.actionId, data.actionData ? JSON.parse(data.actionData) : {});
    });
    if (!document.querySelector('#kuaigaozhushouInstallFlag')) {
      const installFlagDiv = document.createElement('div');
      installFlagDiv.setAttribute('id', 'kuaigaozhushouInstallFlag');
      document.querySelector('body')?.append(installFlagDiv);
    }
    setPageContent();

  });
}