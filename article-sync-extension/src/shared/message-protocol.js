const MessageType = {
  CROSS_API_REQUEST: 'cross_api_request',
  CROSS_API_RESPONSE: 'cross_api_response',
  GET_COOKIES: 'get_cookies',
  CLEAR_ALL_COOKIES: 'clear_all_cookies',
  CROSS_FETCH: 'cross_fetch',
  EXECUTE_SCRIPT: 'execute_script',
  EXECUTE_SCRIPT_BY_WINDOW: 'execute_script_by_window',
  COVER_NETWORK_HEADER: 'cover_network_header',
  SET_BEFORE_REQUEST_REDIRECT: 'set_before_request_redirect',
  CACHE_CHUNK_BY_URL: 'cache_chunk_by_url',
  FETCH_AND_SEND_FILE: 'fetch_and_send_file',
  GET_TAB_INFO_BY_RULE: 'get_tab_info_by_rule',
  CLOSE_TABS_BY_RULE: 'close_tabs_by_rule',
  GET_GLOBAL_STORAGE: 'get_global_storage',
  SET_GLOBAL_STORAGE: 'set_global_storage',
  REMOVE_GLOBAL_STORAGE: 'remove_global_storage',
  GET_LOCAL_STORAGE: 'get_local_storage',
  SEND_TAB_MESSAGE: 'send_tab_message',
  TASK_START: 'task_start',
  TASK_CANCEL: 'task_cancel',
  TASK_PROGRESS: 'task_progress',
  TASK_COMPLETE: 'task_complete',
  TASK_ERROR: 'task_error',
  ARTICLE_EXTRACT: 'article_extract',
  ARTICLE_EXTRACTED: 'article_extracted',
  PLATFORM_LIST_REQUEST: 'platform_list_request',
  PLATFORM_LIST_RESPONSE: 'platform_list_response',
  SYNC_START: 'sync_start',
  SYNC_PROGRESS: 'sync_progress',
  SYNC_COMPLETE: 'sync_complete',
  SYNC_ERROR: 'sync_error',
  CONFIG_UPDATE: 'config_update',
  CONFIG_GET: 'config_get',
  CONFIG_RESPONSE: 'config_response',
  SCRIPT_REGISTRY_UPDATE: 'script_registry_update',
  ADAPTER_EXECUTE: 'adapter_execute',
  ADAPTER_RESULT: 'adapter_result',
  ADAPTER_LOG: 'adapter_log',
  SANDBOX_READY: 'sandbox_ready',
  FILE_TRANSFER_INIT: 'file_transfer_init',
  FILE_TRANSFER_CHUNK: 'file_transfer_chunk',
  FILE_TRANSFER_COMPLETE: 'file_transfer_complete',
  FILE_TRANSFER_ERROR: 'file_transfer_error',
  WS_CONNECTED: 'ws_connected',
  WS_DISCONNECTED: 'ws_disconnected',
  WS_MESSAGE: 'ws_message',
  PING: 'ping',
  PONG: 'pong'
};

const MessageTarget = {
  BACKGROUND: 'background',
  CONTENT: 'content',
  POPUP: 'popup',
  OPTIONS: 'options',
  SANDBOX: 'sandbox',
  SYSTEM: 'system'
};

function buildMessage(type, payload, target, correlationId) {
  return {
    id: correlationId || generateId(),
    type: type,
    payload: payload || {},
    target: target || MessageTarget.BACKGROUND,
    source: MessageTarget.BACKGROUND,
    timestamp: Date.now()
  };
}

function buildResponse(originalMessage, payload, error) {
  return {
    id: originalMessage.id,
    type: originalMessage.type + '_response',
    payload: payload || {},
    error: error || null,
    target: originalMessage.source,
    source: originalMessage.target,
    timestamp: Date.now(),
    correlationId: originalMessage.id
  };
}

function parseMessage(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  if (data && data.type && typeof data.type === 'string') {
    return data;
  }
  return null;
}

function isResponse(message, originalId) {
  return message && message.correlationId === originalId;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
