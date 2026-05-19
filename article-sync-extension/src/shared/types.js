/** @typedef {'pending'|'running'|'completed'|'failed'|'cancelled'} TaskStatus */
/** @typedef {'click'|'type'|'upload'|'wait'|'select'|'navigate'|'conditional'|'extract'|'screenshot'|'scroll'|'hover'|'press'} StepType */
/** @typedef {'storage'|'activeTab'|'tabs'|'scripting'|'cookies'} PermissionType */

/**
 * @typedef {Object} Article
 * @property {string} id
 * @property {string} title
 * @property {string} content
 * @property {string} [contentType]
 * @property {string} [summary]
 * @property {string[]} [tags]
 * @property {string} [coverImage]
 * @property {Object} [metadata]
 * @property {string} [author]
 * @property {number} [createdAt]
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} Platform
 * @property {string} id
 * @property {string} name
 * @property {string} [icon]
 * @property {string} [description]
 * @property {string} adapterUrl
 * @property {string} [loginUrl]
 * @property {string[]} [domains]
 * @property {Object} [config]
 * @property {number} [version]
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} SyncTask
 * @property {string} id
 * @property {string} articleId
 * @property {string} platformId
 * @property {TaskStatus} status
 * @property {number} progress
 * @property {string} [currentStep]
 * @property {string} [error]
 * @property {number} createdAt
 * @property {number} [startedAt]
 * @property {number} [completedAt]
 * @property {Object} [result]
 */

/**
 * @typedef {Object} AutomationStep
 * @property {StepType} type
 * @property {string} [selector]
 * @property {string} [value]
 * @property {number} [timeout]
 * @property {number} [delay]
 * @property {Object} [options]
 * @property {AutomationStep[]} [steps]
 * @property {string} [condition]
 * @property {string} [url]
 * @property {string} [attribute]
 * @property {string} [variable]
 */

/**
 * @typedef {Object} AdapterContext
 * @property {Article} article
 * @property {Platform} platform
 * @property {Object} [config]
 * @property {Function} api
 * @property {Function} waitForElement
 * @property {Function} waitForNavigation
 * @property {Function} fillField
 * @property {Function} clickElement
 * @property {Function} uploadFile
 * @property {Function} getElementText
 * @property {Function} getElementAttribute
 * @property {Function} sleep
 * @property {Function} log
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success
 * @property {string} [articleUrl]
 * @property {string} [articleId]
 * @property {string} [error]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} PlatformRegistry
 * @property {Platform[]} platforms
 * @property {number} lastUpdated
 * @property {string} [etag]
 */

/**
 * @typedef {Object} ExtensionConfig
 * @property {string} serverUrl
 * @property {string} wsUrl
 * @property {number} concurrency
 * @property {number} scriptUpdateInterval
 * @property {boolean} autoSync
 * @property {boolean} debugMode
 */

/**
 * @typedef {Object} CrossFetchRequest
 * @property {string} url
 * @property {string} method
 * @property {Object} [headers]
 * @property {string} [body]
 * @property {string} [responseType]
 * @property {boolean} [withCredentials]
 */

/**
 * @typedef {Object} CrossFetchResponse
 * @property {number} status
 * @property {Object} headers
 * @property {string} body
 * @property {boolean} ok
 */

/**
 * @typedef {Object} NetworkHeaderRule
 * @property {string} id
 * @property {string} urlFilter
 * @property {Object} requestHeaders
 * @property {Object} [responseHeaders]
 */

/**
 * @typedef {Object} RedirectRule
 * @property {string} id
 * @property {string} urlFilter
 * @property {string} redirectUrl
 */

/** @type {string} */
const STORAGE_KEYS = {
  CONFIG: 'ext_config',
  PLATFORMS: 'ext_platforms',
  SCRIPTS: 'ext_scripts',
  TASKS: 'ext_tasks',
  CACHE: 'ext_cache',
  REGISTRY: 'ext_registry'
};

/** @type {number} */
const DEFAULT_CONCURRENCY = 3;

/** @type {number} */
const DEFAULT_SCRIPT_UPDATE_INTERVAL = 3600000;

/** @type {number} */
const MAX_FILE_CHUNK_SIZE = 1024 * 512;

/** @type {number} */
const TASK_TIMEOUT = 300000;

/** @type {string[]} */
const SUPPORTED_CONTENT_TYPES = ['markdown', 'html', 'plain'];
