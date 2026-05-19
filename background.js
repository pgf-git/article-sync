
var pluginVersion = '1.0.9';
var uniqueIdIdx = 1;
function generateUniqueId() {
    return uniqueIdIdx++;
};

var lastFileCacheData = {};
var globalFileFetchMap = {};
var cacheName = 'defaultCache';
var fileCachePort = null;
// 初始化先删除所有cache
caches.open(cacheName).then(function(cache) {
    cache.keys().then(function(arrayOfRequest) {
        arrayOfRequest.forEach(function(request) {
            cache.delete(request)
        });
    });
});
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}
async function cacheChunkByUrl(tabId, url, actionData) {

    class VideoChunkDownloader {
        constructor(videoUrl, options = {}) {
            this.videoUrl = videoUrl;
            this.chunkSize = options.chunkSize || 2.5 * 1024 * 1024; // 2.5MB
            this.concurrency = options.concurrency || 3; // 并发下载数
            this.onProgress = options.onProgress || (() => {});
            this.onError = options.onError || (() => {});
            this.totalSize = 0;
            this.totalChunks = 0;
            this.downloadedChunks = new Map(); // 存储已下载的分片: { index: ArrayBuffer }
            this.retryIndexMap = new Map();
        }
    
        /**
         * 开始下载并缓存视频
         * @returns {Promise<string>} 下载完成后返回视频的Blob URL
         */
        async download() {
            try {
                // 检查服务器分片下载数据
                await this._checkServerSupport();
                // 下载所有分片
                await this._downloadAllChunks();
                const sortedChunks = Array.from(this.downloadedChunks)
                    .sort((a, b) => a[0] - b[0])
                    .map(([_, buffer]) => {
                        return buffer;
                    });
                return {
                    sortedChunks: sortedChunks,
                    fileType: this._getMimeType(),
                    fileSize: this.totalSize
                }
            } catch (error) {
                this.onError(error);
                this._cleanup();
                throw error;
            }
        }
    
        /**
         * 检查服务器分片下载数据
         */
        async _checkServerSupport() {
            const response = await fetch(this.videoUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`获取视频信息失败: ${response.status} ${response.statusText}`);
            }
            // 获取视频总大小
            const contentLength = response.headers.get('Content-Length');
            if (!contentLength) {
                throw new Error('无法获取视频大小');
            }
            this.totalSize = parseInt(contentLength, 10);
            this.totalChunks = Math.ceil(this.totalSize / this.chunkSize);
            // console.log(`视频总大小: ${this._formatSize(this.totalSize)}`);
            // console.log(`分片数: ${this.totalChunks} (每片 ${this._formatSize(this.chunkSize)})`);
        }
    
        /**
         * 下载所有分片
         */
        async _downloadAllChunks() {
            // 创建下载任务队列
            const tasks = Array.from({ length: this.totalChunks }, (_, index) => index)
                .filter(index => !this.downloadedChunks.has(index))
                .map(index => async () => {
                    await this._downloadChunk(index);
                });
            // 并发执行下载任务
            await this._runConcurrentTasks(tasks);
        }
    
        /**
         * 下载单个分片
         * @param {number} chunkIndex 分片索引
         */
        async _downloadChunk(chunkIndex) {
            const start = chunkIndex * this.chunkSize;
            const end = Math.min(start + this.chunkSize - 1, this.totalSize - 1);
            // console.log(`开始下载分片 ${chunkIndex + 1}/${this.totalChunks}: ${this._formatSize(start)}-${this._formatSize(end)}`);
            try {
                const response = await fetch(this.videoUrl, {
                    headers: { Range: `bytes=${start}-${end}` },
                });
                if (!response.ok) {
                    throw new Error(`下载分片 ${chunkIndex + 1} 失败: ${response.status} ${response.statusText}`);
                }
                // 读取响应为ArrayBuffer
                const arrayBuffer = await response.arrayBuffer();
                // 存储已下载的分片
                this.downloadedChunks.set(chunkIndex, arrayBufferToBase64(arrayBuffer));
                // 更新进度
                this._updateProgress();
                // console.log(`分片 ${chunkIndex + 1}/${this.totalChunks} 下载完成`);
            } catch (error) {
                console.error(`分片 ${chunkIndex + 1} 下载失败，将重试:`, error);
                // 重试
                if (!this.retryIndexMap.get(chunkIndex + 1)) {
                    this.retryIndexMap.set(chunkIndex + 1, true);
                    await this._downloadChunk(chunkIndex);
                } else {
                    throw 'DownloadChunk error';
                }
            }
        }
    
        /**
         * 并发执行任务
         * @param {Array<Function>} tasks 任务数组
         */
        async _runConcurrentTasks(tasks) {
            // 创建工作队列
            const workers = Array.from({ length: this.concurrency }, async () => {
                while (tasks.length > 0) {
                    const task = tasks.shift();
                    await task();
                }
            });
            
            // 等待所有工作完成
            await Promise.all(workers);
        }
    
        /**
         * 从URL推断MIME类型
         */
        _getMimeType() {
            // 从URL扩展名推断MIME类型
            const ext = this.videoUrl.split('.').pop()?.toLowerCase();
            const mimeTypes = {
                mp4: 'video/mp4',
                webm: 'video/webm',
                mkv: 'video/x-matroska',
                mov: 'video/quicktime',
                avi: 'video/x-msvideo'
            };
            return mimeTypes[ext] || 'video/mp4';
        }
    
        /**
         * 更新下载进度
         */
        _updateProgress() {
            const percent = Math.floor((this.downloadedChunks.size / this.totalChunks) * 100);
            this.onProgress({
                totalSize: this.totalSize,
                percent,
                totalChunks: this.totalChunks,
                downloadedChunks: this.downloadedChunks.size
            });
        }
    
        /**
         * 清理资源
         */
        _cleanup() {
            // 清空已下载的分片
            this.downloadedChunks.clear();
        }
    
        /**
         * 格式化文件大小
         * @param {number} bytes 文件大小（字节）
         */
        _formatSize(bytes) {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
    } 

    // 先判断有没有cache
    if (lastFileCacheData && lastFileCacheData.url === url) {
        return;
    }
    const hasCacheKey = await caches.open(cacheName).then(function(cache) {
        return cache.keys().then(function(arrayOfRequest) {
            return arrayOfRequest.some(function(request) {
                return request.url === url;
            });
        });
    });
    if (hasCacheKey) {
        return;
    }
    // 如果没有，则发起请求并cache
    if (globalFileFetchMap[url]) {
        return globalFileFetchMap[url];
    }
    if (fileCachePort) {
        try {
            fileCachePort.disconnect()
        } catch (e) { 
            // nothing
        }
    }
    fileCachePort = chrome.tabs.connect(tabId, Object.assign({ name: "fileCache" }, actionData.connectConfig));
 
    const downloader = new VideoChunkDownloader(url, {
        concurrency: actionData.fetchConcurrency,
        chunkSize: actionData.fetchChunkSize,
        // 进度回调
        onProgress: (progress) => {
            fileCachePort.postMessage(Object.assign({
                url: url,
            }, progress));
            // console.log(`下载进度: ${progress.percent}% (${progress.downloadedBytes}/${progress.totalSize} 字节)`);
        },
        // 错误回调
        onError: (error) => {
            // console.error('下载错误:', error);
        }
    });

    // 开始下载
    globalFileFetchMap[url] = downloader.download()
        .then((res) => {
            const sortedChunks = res.sortedChunks;
            const fileType = actionData.fileType || res.fileType;
            const fileSize = res.fileSize;
            // console.log('下载完成，sortedChunks:', sortedChunks, fileType, fileSize);
            return caches.open(cacheName).then(async function(cache) {
                const cacheLimitSize = actionData.cacheLimitSize || 1024 * 1024 * 1024 * 2; // 默认最大缓存2G
                const cacheLimitCount = actionData.cacheLimitCount || 10; // 默认最大缓存10个文件
    
                await cache.keys().then(async function(arrayOfRequest) { 
                    let needRemoveCache = arrayOfRequest.length >= cacheLimitCount;
                    const cacheArray = [];
                    let totalSize = 0;
                    for (const url of arrayOfRequest) {
                        const cacheInfo = await cache.match(new Request(url))?.then(function(res) {
                            return res?.json();
                        });
                        if (cacheInfo) {
                            totalSize = totalSize + cacheInfo.fileSize;
                            cacheArray.push({
                                url: url,
                                cacheDate: cacheInfo.cacheDate
                            });
                        }
                    }
                    needRemoveCache = totalSize >= cacheLimitSize;
                    if (needRemoveCache) {
                        const sortCacheArray = cacheArray.sort(function(a, b) {
                            return a.cacheDate - b.cacheDate;
                        });
                        // 删除最早的3个url
                        sortCacheArray[0] && cache.delete(new Request(sortCacheArray[0].url));
                        sortCacheArray[1] && cache.delete(new Request(sortCacheArray[1].url));
                        sortCacheArray[2] && cache.delete(new Request(sortCacheArray[2].url));
                    }
                });
    
                const cacheData = {fileType, fileSize, base64Arr: sortedChunks, cacheDate: +new Date()};
                lastFileCacheData = { url: url, cacheData: cacheData };
                if (fileSize < 1024 * 1024 * 50) {
                    return cache.put(new Request(url), new Response(JSON.stringify(cacheData), { 
                        headers: { 'Content-Type': 'application/json' } 
                    })).catch();
                } else {
                    return;
                }
            });
        }).finally(function() {
            delete globalFileFetchMap[url];
        });
    return globalFileFetchMap[url];
}

// 等待确认消息
function waitForAck(port, chunkIndex, ackTimeout) {
    return Promise.race([new Promise(function(resolve) {
      const onMessage = (msg) => {
        if (msg.type === 'ack' && msg.index === chunkIndex) {
          port.onMessage.removeListener(onMessage);
          resolve(true);
        }
      };
      port.onMessage.addListener(onMessage);
    }), new Promise(function(resolve) {
        setTimeout(function() {
            resolve(false);
        }, ackTimeout || 10000);
    })]);
}

var fileTransferPort = null;
async function fetchAndSendFileToContentScript(tabId, actionData) {
    let fileRes = null;
    if (lastFileCacheData && lastFileCacheData.url === actionData.url) {
        fileRes = lastFileCacheData.cacheData;
    }
    if (!fileRes) {
        fileRes = await caches.open(cacheName).then(function(cache) {
            return cache.match(new Request(actionData.url))?.then(function(res) {
                return res?.json();
            });
        });
    }
    if (!fileRes) {
        await cacheChunkByUrl(tabId, actionData.url, actionData);
        fileRes = await caches.open(cacheName).then(async function(cache) {
            return cache.match(new Request(actionData.url))?.then(function(res) {
                return res?.json();
            });
        });
    }
    const base64Arr = fileRes.base64Arr;
    const fileType = fileRes.fileType;
    const totalChunks = base64Arr.length;
    
    if (fileTransferPort) {
        try {
            fileTransferPort.disconnect()
        } catch (e) { 
            // nothing
        }
    }
    fileTransferPort = chrome.tabs.connect(tabId, Object.assign({ name: "fileTransfer" }, actionData.transferConnectConfig));
    let currentIndex = 0;
  
    return new Promise(function(resolve, reject) {
        async function sendChunksConcurrently() {
            const concurrency = actionData.transferConcurrency || 5; // 并发数，可根据需求调整
            
            // 创建并发任务
            const workers = Array.from({ length: concurrency }, async () => {
                while (currentIndex < totalChunks) {
                    const index = currentIndex++;
                    const postData = {
                        type: "chunk",
                        index,
                        total: totalChunks,
                        data: base64Arr[index],
                        fileType: fileType
                    };
                    // console.log('Sending chunk:', index);
                    fileTransferPort.postMessage(postData, [postData.data]);
                    // 等待确认，但不阻塞其他任务
                    const ackRes = await waitForAck(fileTransferPort, index, actionData.ackTimeout);
                    if (ackRes) {
                        // console.log('Chunk confirmed:', index);
                    } else {
                        throw 'Ack timeout';
                    }
                }
            });
            // 等待所有任务完成
            await Promise.all(workers);
            // 所有切片发送完成
            fileTransferPort.postMessage({ type: "done", fileType: fileType });
            resolve();
        }
        sendChunksConcurrently();
    });
}

var globalEvent = {
    handles: {},
    on: function (eventName, fn) {
        if (!this.handles){
            this.handles = {};
        }
        // 清理fn
        if (Object.keys(this.handles).length > 30) {
            delete this.handles[Object.keys(this.handles)[0]];
        }
        this.handles[eventName] = {
            time: +new Date(),
            fn: fn
        };
    },
    emit: function (eventName) {
        if(this.handles && this.handles[eventName]){
            this.handles[eventName].fn(arguments[1]);
        }
    },
    destory: function (eventName) {
        if(this.handles && this.handles[eventName]) delete this.handles[eventName];
    }
};

var tabIdTriggerCallbackArr = [];
function setTabIdTriggerCallback(tabId, targetUrl, exact, callback) {
    if (tabIdTriggerCallbackArr.length > 20) {
        tabIdTriggerCallbackArr.shift();
    }
    var obj = {
        tabId: tabId,
        targetUrl: targetUrl,
        exact: !!exact,
        callback: callback || function() {}
    }
    tabIdTriggerCallbackArr.push(obj);
};
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (tabId && tab.url && tab.status === 'complete') {
        var objIndex = tabIdTriggerCallbackArr.findIndex(function(obj) {
            return obj.tabId === tabId && (obj.exact ? obj.targetUrl === tab.url : tab.url.includes(obj.targetUrl));
        });
        if (objIndex !== -1) {
            var findObj = tabIdTriggerCallbackArr[objIndex];
            tabIdTriggerCallbackArr.splice(objIndex, 1);
            findObj.callback();
        }
    }
});
var tabIdCloseTriggerCallbackArr = [];
function setTabIdCloseTriggerCallback(tabId, callback) {
    if (tabIdCloseTriggerCallbackArr.length > 20) {
        tabIdCloseTriggerCallbackArr.shift();
    }
    var obj = {
        tabId: tabId,
        callback: callback || function() {}
    }
    tabIdCloseTriggerCallbackArr.push(obj);
};
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    if (tabId) {
        var objIndex = tabIdCloseTriggerCallbackArr.findIndex(function(obj) {
            return obj.tabId === tabId;
        });
        if (objIndex !== -1) {
            var findObj = tabIdCloseTriggerCallbackArr[objIndex];
            tabIdCloseTriggerCallbackArr.splice(objIndex, 1);
            findObj.callback();
        }
    }
});

chrome.runtime.onMessage.addListener(function (data) {
    // 只接受来源于localStorage的事件
    if (data.actionSource !== 'getLocalStorage' && data.actionSource !== 'contentScriptExecuteScriptEnd') {
        return;
    }
    if (Number(data.waitTime) > 0) {
        setTimeout(function() {
            globalEvent.emit(data.action + data.actionId, data.actionData ? JSON.parse(data.actionData) : {});
        }, Number(data.waitTime));
    } else {
        globalEvent.emit(data.action + data.actionId, data.actionData ? JSON.parse(data.actionData) : {});
    }
});

chrome.runtime.onMessage.addListener(function (data, sender) {
    // 只接受来源于closesTab的事件
    if (data.actionSource !== 'closeTabBySelf') {
        return;
    }
    chrome.tabs.remove(sender.tab.id);
});

chrome.runtime.onMessage.addListener(function (data, sender) {
    // 只接受来源于sendMessageCrossContentScript的事件
    if (data.actionSource !== 'sendMessageCrossContentScript') {
        return;
    }
    chrome.tabs.sendMessage(Number(data.senderTabId), {
        actionSource: 'sendMessageCrossContentScriptFromBg',
        actionData: data.actionData
    });
});

var coverNetworkHeaderMap = {};
var setBeforeRequestRedirectMap = {};
var historyWindows = [];

chrome.runtime.onMessage.addListener(async function(data, sender){
    // 公共入参
    var action = data.action;
    var actionId = data.actionId;
    var actionSource = data.actionSource;
    var actionData = JSON.parse(data.actionData || '{}');
    var responseActionData = '';
    var hasResponse = false;
    // 只接受来源于crossApi的事件
    if (actionSource !== 'crossApi') {
        return;
    }
    // 根据不同action执行不同逻辑
    if (data.action === 'getCookies'){
        chrome.cookies.getAll({ domain: actionData.domain }, function(cookies) {
            var cookieMap = {};
            var cookieStr = cookies.map(cookie => {
                cookieMap[cookie.name] = cookie.value;
                return `${cookie.name}=${cookie.value}`;
            }).join('&');
            responseActionData = JSON.stringify({
                cookieMap: cookieMap,
                cookieStr: cookieStr
            });
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: responseActionData
            });
            hasResponse = true;
        });
    } else if (data.action === 'clearAllCookies'){
        chrome.cookies.getAll({ domain: actionData.domain }, function(cookies) {
            cookies.forEach((cookie) => {
                chrome.cookies.remove({url: actionData.url, name: cookie.name});
            });
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: ''
            });
            hasResponse = true;
        });
    } else if (data.action === 'getLocalStorage'){
        var url = actionData.url;
        if (url.includes('?')) {
            url = url + '&getLocalStorage=1&action=' + data.action + '&actionId=' + encodeURIComponent(data.actionId)
        } else {
            url = url + '?getLocalStorage=1&action=' + data.action + '&actionId=' + encodeURIComponent(data.actionId)
        }
        // 临时打开目标页获取localStorage
        var tabId = '';
        chrome.tabs.create({
            url: url,
            active: false,
            pinned: true
        }, function(tab) {
            tabId = tab.id;
        });
        globalEvent.on(data.action + data.actionId, function(responseActionData) {
            globalEvent.destory(data.action + data.actionId);
            if (tabId) {
                chrome.tabs.remove(tabId);
            } else {
                setTimeout(function() {
                    tabId && chrome.tabs.remove(tabId);
                }, 4000);
            }
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify(responseActionData)
            });
            hasResponse = true;
        });
        // 10秒内仍获取到getLocalStorage则销毁事件
        setTimeout(function() {
            globalEvent.destory(data.action + data.actionId);
            tabId && chrome.tabs.remove(tabId);
        }, 10000);
    } else if (data.action === 'getGlobalStorage'){
        var key = actionData.key;
        chrome.storage.local.get(key, function(items) {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: items ? JSON.stringify(items) : ''
            });
            hasResponse = true;
        });
    } else if (data.action === 'setGlobalStorage'){
        var key = actionData.key;
        var value = actionData.value;
        var map = {};
        map[key] = value;
        chrome.storage.local.set(
            map,
            function() {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: ''
                });
                hasResponse = true;
            }
        );        
    } else if (data.action === 'removeGlobalStorage'){
        var key = actionData.key;
        chrome.storage.local.remove(key,
            function() {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: ''
                });
                hasResponse = true;
            }
        );        
    } else if (data.action === 'cacheChunkByUrl') {
        cacheChunkByUrl(sender.tab.id, actionData.url, actionData).then(function() {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({ success: true })
            });
            hasResponse = true;
        }).catch(function() {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({ success: false })
            });
            hasResponse = true;
        });       
    } else if (data.action === 'fetchAndSendFileToContentScript') {
        fetchAndSendFileToContentScript(sender.tab.id, actionData).then(function() {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({ success: true })
            });
            hasResponse = true;
        }).catch(function() {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({ success: false })
            });
            hasResponse = true;
        });       
    } else if (data.action === 'crossFetch'){
        actionData.config = actionData.config || {};
        if (actionData.config.responseText) {
            fetch(actionData.url, actionData.config).then(res => res.text()).then((data) => {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: actionData.config.noNeedResponse ? '' : JSON.stringify({ text: data })
                });
                hasResponse = true;
            }).catch(function() {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: JSON.stringify({ error: true })
                });
                hasResponse = true;
            });
        } else {
            fetch(actionData.url, actionData.config).then(res => res.json()).then((data) => {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: actionData.config.noNeedResponse ? '': (data ? JSON.stringify(data) : '')
                });
                hasResponse = true;
            }).catch(function() {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: JSON.stringify({ error: true })
                });
                hasResponse = true;
            });
        }
    } else if (data.action === 'executeScript') {
        var url = actionData.url;
        var config = actionData.config || {};
        if (url.includes('?')) {
            url = url + '&executeScript=1&actionExec=' + data.action + '&actionId=' + encodeURIComponent(data.actionId) + '&executeScriptTitle=' + encodeURIComponent(encodeURIComponent(config.executeScriptTitle || '')) + '&executeScriptContent=' + encodeURIComponent(encodeURIComponent(config.executeScriptContent || ''))
        } else {
            url = url + '?executeScript=1&actionExec=' + data.action + '&actionId=' + encodeURIComponent(data.actionId) + '&executeScriptTitle=' + encodeURIComponent(encodeURIComponent(config.executeScriptTitle || '')) + '&executeScriptContent=' + encodeURIComponent(encodeURIComponent(config.executeScriptContent || ''))
        }
        chrome.tabs.create(Object.assign({
            url,
            active: false,
            pinned: true
        }, config.tabConfig || {}), function(tab) {
            setTimeout(function() {
                // chrome.tabs.sendMessage(tab.id, { 
                //     action: 'contentScriptExecuteScript',
                //     actionId: actionId, 
                //     actionSource: 'contentScriptExecuteScript',
                //     actionData: JSON.stringify(actionData)
                // });
                var senderTabId = sender.tab.id;
                chrome.scripting.executeScript(Object.assign({
                    target: { tabId: tab.id },
                    func: function(script, _senderTabId) {
                        eval(`
                            var senderTabId = '${_senderTabId}';
                            ${script}
                        `);
                    },
                    world: config.scriptConfig?.world || "MAIN",
                    injectImmediately: config.scriptConfig?.injectImmediately === false ? false : true,
                    args: [actionData.script, senderTabId]
                }, config.otherExecuteScriptConfig || {}));
                globalEvent.on(data.action + data.actionId, function(responseActionData) {
                    globalEvent.destory(data.action + data.actionId);
                    chrome.tabs.sendMessage(senderTabId, { 
                        action: action, 
                        actionId: actionId, 
                        actionSource: 'backgroundCrossApi',
                        actionData: JSON.stringify(responseActionData)
                    });
                    chrome.tabs.remove(tab.id);
                    hasResponse = true;
                });
                if (config.closeByTargetUrl) {
                    setTabIdTriggerCallback(tab.id, config.closeByTargetUrl, config.closeByTargetUrlExact, () => {
                        setTimeout(function() {
                            globalEvent.destory(data.action + data.actionId);
                            chrome.tabs.sendMessage(senderTabId, { 
                                action: action, 
                                actionId: actionId, 
                                actionSource: 'backgroundCrossApi',
                                actionData: JSON.stringify({})
                            });
                            chrome.tabs.remove(tab.id);
                            hasResponse = true;
                        }, config.closeByTargetUrlDelay || 0);
                    });
                }
                if (config.triggerByManualClose) {
                    setTabIdCloseTriggerCallback(tab.id, () => {
                        globalEvent.destory(data.action + data.actionId);
                        chrome.tabs.sendMessage(senderTabId, { 
                            action: action, 
                            actionId: actionId, 
                            actionSource: 'backgroundCrossApi',
                            actionData: JSON.stringify({})
                        });
                    })
                }
            }, config.waitTime || 5000);
        });
    } else if (data.action === 'executeScriptByWindow') {
        var url = actionData.url;
        var config = actionData.config || {};
        if (url.includes('?')) {
            url = url + '&executeScript=1&actionExec=' + data.action + '&actionId=' + encodeURIComponent(data.actionId) + '&executeScriptTitle=' + encodeURIComponent(encodeURIComponent(config.executeScriptTitle || '')) + '&executeScriptContent=' + encodeURIComponent(encodeURIComponent(config.executeScriptContent || ''))
        } else {
            url = url + '?executeScript=1&actionExec=' + data.action + '&actionId=' + encodeURIComponent(data.actionId) + '&executeScriptTitle=' + encodeURIComponent(encodeURIComponent(config.executeScriptTitle || '')) + '&executeScriptContent=' + encodeURIComponent(encodeURIComponent(config.executeScriptContent || ''))
        }
        (async () => {
            // 尝试关闭其他已打开窗口
            if (config.closeAllBeforeWindows) {
                await new Promise((resolve) => {
                    var allPromises = [];
                    var newHistoryWindows = [];
                    historyWindows.forEach(windowId => {
                        allPromises.push(new Promise((rs) => {
                            chrome.windows.remove(windowId, () => {
                                if (chrome.runtime.lastError) {
                                    setTimeout(() => {
                                        chrome.windows.remove(windowId, () => {
                                            if (chrome.runtime.lastError) {
                                                newHistoryWindows.push(windowId);
                                            }
                                            rs();
                                        })
                                    }, 1000);
                                }
                                rs();
                            })
                        }));
                    });
                    Promise.allSettled(allPromises).catch().finally(() => {
                        resolve();
                        historyWindows = newHistoryWindows;
                    });
                });
            }
            chrome.windows.create(Object.assign({
                url,
                type: 'popup',
                width: config.width,
                height: config.height,
                top: config.top,
                left: config.left,
            }, config.otherWindowConfig || {}), function(newWindow) {
                setTimeout(function() {
                    if (!newWindow?.tabs[0]?.id) {
                        return;
                    }
                    historyWindows.push(newWindow?.id);
                    // chrome.tabs.sendMessage(newWindow?.tabs[0]?.id, { 
                    //     action: 'contentScriptExecuteScript',
                    //     actionId: actionId, 
                    //     actionSource: 'contentScriptExecuteScript',
                    //     actionData: JSON.stringify(actionData)
                    // });
                    chrome.scripting.executeScript(Object.assign({
                        target: { tabId: newWindow?.tabs[0]?.id },
                        func: function(script) {
                            eval(script);
                        },
                        world: config.scriptConfig?.world || "MAIN",
                        injectImmediately: config.scriptConfig?.injectImmediately === false ? false : true,
                        args: [actionData.script]
                    }, config.otherExecuteScriptConfig || {}));
                    globalEvent.on(data.action + data.actionId, function(responseActionData) {
                        globalEvent.destory(data.action + data.actionId);
                        chrome.tabs.sendMessage(sender.tab.id, { 
                            action: action, 
                            actionId: actionId, 
                            actionSource: 'backgroundCrossApi',
                            actionData: JSON.stringify(responseActionData)
                        });
                        try {
                            chrome.windows.remove(newWindow.id);
                        } catch (e) {
                            // nothing
                        }
                        hasResponse = true;
                    });
                    if (config.closeByTargetUrl) {
                        setTabIdTriggerCallback(newWindow?.tabs[0]?.id, config.closeByTargetUrl, config.closeByTargetUrlExact, () => {
                            setTimeout(function() {
                                globalEvent.destory(data.action + data.actionId);
                                chrome.tabs.sendMessage(sender.tab.id, { 
                                    action: action, 
                                    actionId: actionId, 
                                    actionSource: 'backgroundCrossApi',
                                    actionData: JSON.stringify({})
                                });
                                try {
                                    chrome.tabs.remove(newWindow?.tabs[0]?.id);
                                    chrome.windows.remove(newWindow.id);
                                } catch (e) {
                                    // nothing
                                }
                                hasResponse = true;
                            }, config.closeByTargetUrlDelay || 0);
                        });
                    }
                    if (config.triggerByManualClose) {
                        setTabIdCloseTriggerCallback(newWindow?.tabs[0]?.id, () => {
                            globalEvent.destory(data.action + data.actionId);
                            chrome.tabs.sendMessage(sender.tab.id, { 
                                action: action, 
                                actionId: actionId, 
                                actionSource: 'backgroundCrossApi',
                                actionData: JSON.stringify({})
                            });
                        })
                    }
                }, config.waitTime === undefined ? 3000 : config.waitTime);
            });
        })();
    } else if (data.action === 'coverNetworkHeader') {
        var prefix = actionData.prefix;
        var url = actionData.url;
        var requestHeaders = actionData.requestHeaders || [];
        var responseHeaders = actionData.responseHeaders || [];
        var removeRuleIds = [];
        if (url && prefix && (!coverNetworkHeaderMap[prefix] || coverNetworkHeaderMap[prefix].url !== url)) {
            try {
                // 如果已存在该prefix对应的rule，先清掉
                if (coverNetworkHeaderMap[prefix] && coverNetworkHeaderMap[prefix].url !== url) {
                    removeRuleIds = [coverNetworkHeaderMap[prefix].ruleId];
                }
                var newRuleId = generateUniqueId();
                // 添加rule
                // https://developer.chrome.google.cn/docs/extensions/reference/api/declarativeNetRequest?hl=ro
                await chrome.declarativeNetRequest.updateDynamicRules(
                    {
                        removeRuleIds: removeRuleIds,
                        addRules: [{
                            id: newRuleId,
                            priority: 1,
                            action: Object.assign({
                                type: 'modifyHeaders'
                            }, 
                            requestHeaders.length ? {
                                requestHeaders: requestHeaders.map(function(header) {
                                    return {
                                        operation: header.operation || 'set', // 添加或修改头部信息, "append", "set", or "remove"
                                        header: header.name, // 头部名称
                                        value: header.value // 头部值
                                    }
                                })
                            } : {}, 
                            responseHeaders.length ? {
                                responseHeaders: responseHeaders.map(function(header) {
                                    return {
                                        operation: header.operation || 'set', // 添加或修改头部信息, "append", "set", or "remove"
                                        header: header.name, // 头部名称
                                        value: header.value // 头部值
                                    }
                                }),
                            }: {}),
                            condition: {
                                urlFilter: '*' + prefix + '*'
                            }
                        }]
                    },
                );
                coverNetworkHeaderMap[prefix] = {
                    url: url,
                    ruleId: newRuleId
                };
                hasResponse = true;
            } catch (e) {
                // nothing
            } 
        }
    } else if (data.action === 'setBeforeRequestRedirect') {
        var key = actionData.key;
        var redirect = actionData.redirect || {};
        var condition = actionData.condition || {};
        var actionDataStrNew = JSON.stringify(actionData);
        var removeRuleIds = [];
        if (key && redirect && condition && (!setBeforeRequestRedirectMap[key] || setBeforeRequestRedirectMap[key].actionDataStr !== actionDataStrNew)) {
            try {
                // 如果已存在该key对应的rule，先清掉
                if (setBeforeRequestRedirectMap[key] && setBeforeRequestRedirectMap[key].actionDataStr !== actionDataStrNew) {
                    removeRuleIds = [setBeforeRequestRedirectMap[key].ruleId];
                }
                var newRuleId = generateUniqueId();
                // 添加rule
                // https://developer.chrome.google.cn/docs/extensions/reference/api/declarativeNetRequest?hl=ro
                await chrome.declarativeNetRequest.updateDynamicRules(
                    {
                        removeRuleIds: removeRuleIds,
                        addRules: [{
                            id: newRuleId,
                            priority: 1,
                            action: {
                                type: "redirect",
                                redirect: redirect
                            },
                            condition: condition
                        }]
                    }
                );
                setBeforeRequestRedirectMap[key] = {
                    actionDataStr: actionDataStrNew,
                    ruleId: newRuleId
                };
                hasResponse = true;
            } catch (e) {
                // nothing
            } 
        }
    } else if (data.action === 'clearUselessDynamicRules') {
        var rules = await chrome.declarativeNetRequest.getDynamicRules();
        if (rules && rules.length) {
            var exsitMap = {};
            Object.keys(coverNetworkHeaderMap).forEach(function(key) {
                exsitMap[coverNetworkHeaderMap[key].ruleId] = true;
            });
            Object.keys(setBeforeRequestRedirectMap).forEach(function(key) {
                exsitMap[setBeforeRequestRedirectMap[key].ruleId] = true;
            });
            var removeIds = [];
            rules.forEach(function(r) {
                if (!exsitMap[r.id]) {
                    removeIds.push(r.id);
                }
            })
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: removeIds
            });
        }
        hasResponse = true;
    } else if (data.action === 'getTabInfoByRule') {
        chrome.tabs.query(actionData, function(tabs) {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify(tabs)
            });
        });
        hasResponse = true;
    } else if (data.action === 'updateTab') {
        chrome.tabs.update(
            actionData.tabId,
            actionData.updateProperties || {},
            function(res) {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: JSON.stringify(res)
                });
            }
        );
        hasResponse = true;
    } else if (data.action === 'sendTabMessage') {
        chrome.tabs.sendMessage(
            actionData.tabId,
            actionData.message,
            actionData.options || {},
            function(res) {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: JSON.stringify(res)
                });
            }
        );
        hasResponse = true;
    } else if (data.action === 'executeTabFunc') {
        if (actionData.argsCount === 1) {
            chrome.tabs[actionData.funcName](
                actionData.args[0],
                function(res) {
                    chrome.tabs.sendMessage(sender.tab.id, { 
                        action: action, 
                        actionId: actionId, 
                        actionSource: 'backgroundCrossApi',
                        actionData: JSON.stringify(res)
                    });
                }
            );
        } else if (actionData.argsCount === 2) {
            chrome.tabs[actionData.funcName](
                actionData.args[0],
                actionData.args[1],
                function(res) {
                    chrome.tabs.sendMessage(sender.tab.id, { 
                        action: action, 
                        actionId: actionId, 
                        actionSource: 'backgroundCrossApi',
                        actionData: JSON.stringify(res)
                    });
                }
            );
        } else if (actionData.argsCount === 3) {
            chrome.tabs[actionData.funcName](
                actionData.args[0],
                actionData.args[1],
                actionData.args[2],
                function(res) {
                    chrome.tabs.sendMessage(sender.tab.id, { 
                        action: action, 
                        actionId: actionId, 
                        actionSource: 'backgroundCrossApi',
                        actionData: JSON.stringify(res)
                    });
                }
            );
        } else {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({})
            });
        }
        hasResponse = true;
    } else if (data.action === 'isTabExsitByRule') {
        chrome.tabs.query(actionData, function(tabs) {
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: action, 
                actionId: actionId, 
                actionSource: 'backgroundCrossApi',
                actionData: JSON.stringify({ exsitCount: tabs?.length || 0 })
            });
        });
        hasResponse = true;
    } else if (data.action === 'closeTabsByRule') {
        chrome.tabs.query(actionData, function(tabs) {
            // 获取所有匹配的标签页的ID
            let tabIds = tabs.map(tab => tab.id);
            // 使用chrome.tabs.remove方法关闭这些标签页
            chrome.tabs.remove(tabIds);
            chrome.tabs.query({url: actionData.url}, function(tabs) {
                chrome.tabs.sendMessage(sender.tab.id, { 
                    action: action, 
                    actionId: actionId, 
                    actionSource: 'backgroundCrossApi',
                    actionData: JSON.stringify({})
                });
            });
        });
        hasResponse = true;
    } else if (data.action === 'getDynamicRules') {
        var rules = await chrome.declarativeNetRequest.getDynamicRules();
        chrome.tabs.sendMessage(sender.tab.id, { 
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({
                rules: rules
            })
        });
        hasResponse = true;
    } else if (data.action === 'updateDynamicRules') {
        var addRules = actionData.addRules ? JSON.parse(actionData.addRules) : [];
        var removeRuleIds = actionData.removeRuleIds ? JSON.parse(actionData.removeRuleIds) : [];
        await chrome.declarativeNetRequest.updateDynamicRules(
            {
                removeRuleIds: removeRuleIds,
                addRules: addRules
            }
        );
        chrome.tabs.sendMessage(sender.tab.id, { 
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({})
        });
        hasResponse = true;
    } else if (data.action === 'getBackgroundVar') {
        var key = actionData.key;
        var value = self[key] || '';
        if (typeof value === 'object') {
            value = JSON.stringify(value);
        }
        chrome.tabs.sendMessage(sender.tab.id, { 
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({
                value: value
            })
        });
        hasResponse = true;
    } else if (data.action === 'setBackgroundVar') {
        var key = actionData.key || '';
        var value = actionData.value || '';
        var vType = actionData.vType || 'string';
        if (vType === 'number') {
            self[key] = Number(value);
        } else if (vType === 'object') {
            self[key] = JSON.parse(value);
        } else {
            self[key] = value;
        }
        chrome.tabs.sendMessage(sender.tab.id, { 
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({})
        });
        hasResponse = true;
    } else if (data.action === 'reloadBackgroundPage') {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
            chrome.runtime.reload(); // 重新加载扩展
            hasResponse = true;
        } else {
            console.error("Unable to reset background.js");
        }
        chrome.tabs.sendMessage(sender.tab.id, { 
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({})
        });
    } else if (data.action === 'commonExecuteFunc'){
        var executeFunc = null;
        var executeArgs = actionData.executeArgs || [];
        if (actionData.executeKeys.length === 0) {
            executeFunc = chrome[actionData.executeFunc];
        } else if (actionData.executeKeys.length === 1) {
            executeFunc = chrome[actionData.executeKeys[0]][actionData.executeFunc];
        } else if (actionData.executeKeys.length === 2) {
            executeFunc = chrome[actionData.executeKeys[0]][actionData.executeKeys[1]][actionData.executeFunc];
        }
        function getFinalArgs(_arg) {
            if (_arg === '__callback__') {
                return function(res1, res2, res3, res4) {
                    var executeRes = '{}';
                    try {
                        executeRes = JSON.stringify({ executeRes: [res1, res2, res3, res4] });
                    } catch (e) {
                        // nothing
                    }
                    chrome.tabs.sendMessage(sender.tab.id, { 
                        action: action, 
                        actionId: actionId, 
                        actionSource: 'backgroundCrossApi',
                        actionData: executeRes
                    });
                    hasResponse = true;
                }
            } else {
                return _arg;
            }
        }
        executeFunc(getFinalArgs(executeArgs[0]), getFinalArgs(executeArgs[1]));
    } 
    // 防止一直未响应事件
    setTimeout(function() {
        if (hasResponse) {
            return;
        }
        chrome.tabs.sendMessage(sender.tab.id, {
            action: action, 
            actionId: actionId, 
            actionSource: 'backgroundCrossApi',
            actionData: JSON.stringify({ timeout: true })
        });
    }, data.actionTimeout ? data.actionTimeout : (['executeScript', 'executeScriptByWindow'].includes(data.action) ? 5 * 60 * 1000 : 20000));
});