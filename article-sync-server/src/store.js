const { v4: uuidv4 } = require('uuid');

const zhihuScript = `class ZhihuAdapter {
  async getMetaData() {
    var res = await $.ajax({ url: 'https://www.zhihu.com/api/v4/me' });
    return { uid: res.id, title: res.name, avatar: res.avatar_url, supportTypes: ['html'], type: 'zhihu', displayName: '知乎', home: 'https://zhuanlan.zhihu.com/write', icon: 'https://static.zhihu.com/heifetz/favicon.ico' };
  }
  async preEditPost(post) { return post; }
  async addPost(post) {
    var res = await axios.post('https://www.zhihu.com/api/v4/articles', { title: post.post_title, content: post.post_content });
    return { status: 'success', post_id: res.data.id };
  }
  async uploadFile(file) {
    var formData = new FormData();
    formData.append('file', file);
    var res = await axios.post('https://www.zhihu.com/api/v4/images', formData);
    return { url: res.data.src };
  }
  async editPost(postId, post) {
    await axios.put('https://www.zhihu.com/api/v4/articles/' + postId, { title: post.post_title, content: post.post_content });
    return { status: 'success', post_id: postId };
  }
}
exports.driver = ZhihuAdapter;`;

const toutiaoScript = `(function() {
  const steps = {
    async publish(post) {
      await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish');
      await page.waitForSelector('.publish-editor-title input', { timeout: 10000 });
      await page.type('.publish-editor-title input', post.title);
      await page.waitForSelector('.ql-editor', { timeout: 10000 });
      await page.click('.ql-editor');
      await page.keyboard.type(post.content, { delay: 5 });
      if (post.coverImage) {
        const uploadInput = await page.$('input[type="file"][accept="image/*"]');
        if (uploadInput) {
          await uploadInput.uploadFile(post.coverImage);
          await page.waitForTimeout(3000);
        }
      }
      await page.waitForSelector('.publish-btn', { timeout: 5000 });
      await page.click('.publish-btn');
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      return { status: 'success' };
    }
  };
  return steps;
})();`;

const juejinScript = JSON.stringify({
  platform: 'juejin',
  type: 'config-dsl',
  version: '1.0.0',
  steps: [
    { action: 'navigate', url: 'https://creator.juejin.cn/creator/home' },
    { action: 'wait', selector: '.entry-title input', timeout: 10000 },
    { action: 'type', selector: '.entry-title input', value: '{{title}}' },
    { action: 'wait', selector: '.CodeMirror', timeout: 5000 },
    { action: 'click', selector: '.CodeMirror' },
    { action: 'type', selector: '.CodeMirror textarea', value: '{{content}}' },
    { action: 'wait', selector: '.category-picker', timeout: 3000 },
    { action: 'click', selector: '.category-picker' },
    { action: 'wait', selector: '.category-list .category-item:first-child', timeout: 3000 },
    { action: 'click', selector: '.category-list .category-item:first-child' },
    { action: 'wait', selector: '.tag-input input', timeout: 3000 },
    { action: 'type', selector: '.tag-input input', value: '{{tags}}' },
    { action: 'wait', selector: '.tag-suggestions .tag-item:first-child', timeout: 2000 },
    { action: 'click', selector: '.tag-suggestions .tag-item:first-child' },
    { action: 'wait', selector: '.publish-btn', timeout: 3000 },
    { action: 'click', selector: '.publish-btn' },
    { action: 'wait', selector: '.success-modal', timeout: 10000 }
  ]
}, null, 2);

const now = Date.now();

const platforms = {
  zhihu: {
    id: 'zhihu',
    name: '知乎',
    type: 'api-adapter',
    icon: 'https://static.zhihu.com/heifetz/favicon.ico',
    home: 'https://zhuanlan.zhihu.com/write',
    script: zhihuScript,
    scriptVersion: '1.0.0',
    enabled: true,
    createdAt: now - 86400000 * 30,
    updatedAt: now - 86400000 * 2
  },
  toutiao: {
    id: 'toutiao',
    name: '今日头条',
    type: 'dom-script',
    icon: 'https://lf3-cm-tos.pstatp.com/obj/cm-cloud-tos-us/cms/2024/favicon.ico',
    home: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    script: toutiaoScript,
    scriptVersion: '1.0.0',
    enabled: true,
    createdAt: now - 86400000 * 25,
    updatedAt: now - 86400000 * 5
  },
  juejin: {
    id: 'juejin',
    name: '掘金',
    type: 'config-dsl',
    icon: 'https://lf-web-assets.juejin.cn/obj/juejin-web/xitu_juejin_web/static/favicons/favicon-32x32.png',
    home: 'https://creator.juejin.cn/creator/home',
    script: juejinScript,
    scriptVersion: '1.0.0',
    enabled: true,
    createdAt: now - 86400000 * 20,
    updatedAt: now - 86400000 * 1
  }
};

const scriptVersions = {
  zhihu: [
    { version: '1.0.0', script: zhihuScript, createdAt: now - 86400000 * 30, updatedAt: now - 86400000 * 2 },
    { version: '0.9.0', script: zhihuScript.replace('1.0.0', '0.9.0'), createdAt: now - 86400000 * 60, updatedAt: now - 86400000 * 31 }
  ],
  toutiao: [
    { version: '1.0.0', script: toutiaoScript, createdAt: now - 86400000 * 25, updatedAt: now - 86400000 * 5 }
  ],
  juejin: [
    { version: '1.0.0', script: juejinScript, createdAt: now - 86400000 * 20, updatedAt: now - 86400000 * 1 }
  ]
};

const articles = [
  {
    id: uuidv4(),
    title: '深入理解JavaScript异步编程',
    content_html: '<h1>深入理解JavaScript异步编程</h1><p>JavaScript是单线程语言，但通过事件循环机制实现了非阻塞的异步操作。本文将深入探讨Promise、async/await以及事件循环的工作原理。</p><h2>事件循环</h2><p>事件循环是JavaScript运行时的核心机制，它负责执行代码、收集和处理事件以及执行队列中的子任务。</p><h2>Promise</h2><p>Promise是ES6引入的异步编程解决方案，比传统的回调函数更加优雅和可维护。</p><h2>async/await</h2><p>async/await是建立在Promise之上的语法糖，让异步代码看起来像同步代码一样直观。</p>',
    content_md: '# 深入理解JavaScript异步编程\n\nJavaScript是单线程语言，但通过事件循环机制实现了非阻塞的异步操作。本文将深入探讨Promise、async/await以及事件循环的工作原理。\n\n## 事件循环\n\n事件循环是JavaScript运行时的核心机制，它负责执行代码、收集和处理事件以及执行队列中的子任务。\n\n## Promise\n\nPromise是ES6引入的异步编程解决方案，比传统的回调函数更加优雅和可维护。\n\n## async/await\n\nasync/await是建立在Promise之上的语法糖，让异步代码看起来像同步代码一样直观。',
    tags: ['JavaScript', '异步编程', '前端'],
    coverImage: 'https://picsum.photos/seed/async-js/800/400',
    status: 'published',
    createdAt: now - 86400000 * 10,
    updatedAt: now - 86400000 * 3
  },
  {
    id: uuidv4(),
    title: 'React 18新特性完全指南',
    content_html: '<h1>React 18新特性完全指南</h1><p>React 18带来了许多令人兴奋的新特性，包括并发渲染、自动批处理、Suspense改进等。本文将全面介绍这些变化。</p><h2>并发渲染</h2><p>并发渲染是React 18最核心的变化，它允许React同时准备多个版本的UI。</p><h2>自动批处理</h2><p>React 18中的自动批处理减少了不必要的重新渲染，提升了应用性能。</p><h2>新的Hooks</h2><p>useId、useSyncExternalStore、useInsertionEffect等新Hooks为开发者提供了更多工具。</p>',
    content_md: '# React 18新特性完全指南\n\nReact 18带来了许多令人兴奋的新特性，包括并发渲染、自动批处理、Suspense改进等。本文将全面介绍这些变化。\n\n## 并发渲染\n\n并发渲染是React 18最核心的变化，它允许React同时准备多个版本的UI。\n\n## 自动批处理\n\nReact 18中的自动批处理减少了不必要的重新渲染，提升了应用性能。\n\n## 新的Hooks\n\nuseId、useSyncExternalStore、useInsertionEffect等新Hooks为开发者提供了更多工具。',
    tags: ['React', '前端框架', 'JavaScript'],
    coverImage: 'https://picsum.photos/seed/react18/800/400',
    status: 'draft',
    createdAt: now - 86400000 * 5,
    updatedAt: now - 86400000 * 1
  },
  {
    id: uuidv4(),
    title: 'Node.js微服务架构实践',
    content_html: '<h1>Node.js微服务架构实践</h1><p>微服务架构已经成为构建大型应用的主流方式。本文将分享使用Node.js构建微服务的实践经验。</p><h2>服务拆分原则</h2><p>合理的微服务拆分是成功的关键，需要根据业务领域和技术边界来划分服务。</p><h2>服务间通信</h2><p>微服务之间的通信方式包括HTTP REST、gRPC、消息队列等，各有适用场景。</p><h2>部署与运维</h2><p>Docker容器化和Kubernetes编排是微服务部署的最佳实践。</p>',
    content_md: '# Node.js微服务架构实践\n\n微服务架构已经成为构建大型应用的主流方式。本文将分享使用Node.js构建微服务的实践经验。\n\n## 服务拆分原则\n\n合理的微服务拆分是成功的关键，需要根据业务领域和技术边界来划分服务。\n\n## 服务间通信\n\n微服务之间的通信方式包括HTTP REST、gRPC、消息队列等，各有适用场景。\n\n## 部署与运维\n\nDocker容器化和Kubernetes编排是微服务部署的最佳实践。',
    tags: ['Node.js', '微服务', '架构'],
    coverImage: 'https://picsum.photos/seed/nodejs-micro/800/400',
    status: 'published',
    createdAt: now - 86400000 * 15,
    updatedAt: now - 86400000 * 7
  }
];

const syncTasks = [];

const webhooks = [
  {
    id: uuidv4(),
    name: '同步完成通知',
    url: 'https://example.com/webhook/sync-complete',
    events: ['sync.completed', 'sync.failed'],
    enabled: true,
    createdAt: now - 86400000 * 10,
    updatedAt: now - 86400000 * 2
  }
];

const stats = {
  totalArticles: articles.length,
  totalSyncTasks: 0,
  successSyncTasks: 0,
  failedSyncTasks: 0,
  totalPlatforms: Object.keys(platforms).length,
  activePlatforms: Object.values(platforms).filter(p => p.enabled).length,
  dailyStats: {}
};

const extensionConfig = {
  version: '1.0.0',
  syncInterval: 30000,
  maxRetries: 3,
  retryDelay: 5000,
  platforms: Object.keys(platforms).map(id => ({
    id,
    name: platforms[id].name,
    type: platforms[id].type,
    enabled: platforms[id].enabled,
    icon: platforms[id].icon,
    home: platforms[id].home
  }))
};

const heartbeats = {};

module.exports = {
  platforms,
  scriptVersions,
  articles,
  syncTasks,
  webhooks,
  stats,
  extensionConfig,
  heartbeats
};
