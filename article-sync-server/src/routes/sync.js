const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../store');

const router = express.Router();

router.post('/tasks', (req, res) => {
  const { articleId, platformId, platforms, articleTitle, platformName } = req.body;
  if (!articleId) {
    return res.status(400).json({ success: false, error: 'articleId is required' });
  }
  const platformIds = platforms || (platformId ? [platformId] : []);
  if (platformIds.length === 0) {
    return res.status(400).json({ success: false, error: 'platformId or platforms is required' });
  }
  const now = Date.now();
  const tasks = [];
  for (const pid of platformIds) {
    const task = {
      id: uuidv4(),
      articleId,
      platformId: pid,
      articleTitle: articleTitle || '',
      platformName: platformName || store.platforms[pid]?.name || pid,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      retries: 0,
      maxRetries: 3,
      logs: [],
      createdAt: now,
      updatedAt: now
    };
    store.syncTasks.unshift(task);
    tasks.push(task);
  }
  store.stats.totalSyncTasks = store.syncTasks.length;
  res.status(201).json({ success: true, data: tasks });
});

router.get('/tasks', (req, res) => {
  const { page = 1, pageSize = 20, status, platformId, articleId } = req.query;
  let list = [...store.syncTasks];
  if (status) {
    list = list.filter(t => t.status === status);
  }
  if (platformId) {
    list = list.filter(t => t.platformId === platformId);
  }
  if (articleId) {
    list = list.filter(t => t.articleId === articleId);
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  const total = list.length;
  const start = (Number(page) - 1) * Number(pageSize);
  const items = list.slice(start, start + Number(pageSize));
  res.json({ success: true, data: { items, total, page: Number(page), pageSize: Number(pageSize) } });
});

router.get('/tasks/:id', (req, res) => {
  const task = store.syncTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  res.json({ success: true, data: task });
});

router.put('/tasks/:id/status', (req, res) => {
  const task = store.syncTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  const { status, progress, result, error } = req.body;
  const oldStatus = task.status;
  if (status) task.status = status;
  if (progress !== undefined) task.progress = progress;
  if (result !== undefined) task.result = result;
  if (error !== undefined) task.error = error;
  task.updatedAt = Date.now();
  updateStats(oldStatus, task.status);
  res.json({ success: true, data: task });
});

router.post('/tasks/:id/cancel', (req, res) => {
  const task = store.syncTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  if (task.status !== 'pending' && task.status !== 'running') {
    return res.status(400).json({ success: false, error: 'Task cannot be cancelled' });
  }
  const oldStatus = task.status;
  task.status = 'cancelled';
  task.updatedAt = Date.now();
  updateStats(oldStatus, 'cancelled');
  res.json({ success: true, data: task });
});

router.post('/tasks/:id/retry', (req, res) => {
  const task = store.syncTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  if (task.status !== 'failed' && task.status !== 'cancelled') {
    return res.status(400).json({ success: false, error: 'Only failed or cancelled tasks can be retried' });
  }
  const oldStatus = task.status;
  task.status = 'pending';
  task.progress = 0;
  task.error = null;
  task.result = null;
  task.retries += 1;
  task.updatedAt = Date.now();
  updateStats(oldStatus, 'pending');
  res.json({ success: true, data: task });
});

router.post('/tasks/:id/logs', (req, res) => {
  const task = store.syncTasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  const { level, message, timestamp } = req.body;
  task.logs.push({
    level: level || 'info',
    message: message || '',
    timestamp: timestamp || Date.now()
  });
  task.updatedAt = Date.now();
  res.json({ success: true });
});

router.post('/batch-status', (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ success: false, error: 'tasks array is required' });
  }
  const results = [];
  for (const item of tasks) {
    const task = store.syncTasks.find(t => t.id === item.id);
    if (task) {
      const oldStatus = task.status;
      if (item.status) task.status = item.status;
      if (item.progress !== undefined) task.progress = item.progress;
      if (item.result !== undefined) task.result = item.result;
      if (item.error !== undefined) task.error = item.error;
      task.updatedAt = Date.now();
      updateStats(oldStatus, task.status);
      results.push({ id: task.id, status: task.status });
    }
  }
  res.json({ success: true, data: results });
});

function updateStats(oldStatus, newStatus) {
  if (oldStatus === newStatus) return;
  if (oldStatus === 'success') store.stats.successSyncTasks = Math.max(0, store.stats.successSyncTasks - 1);
  if (oldStatus === 'failed') store.stats.failedSyncTasks = Math.max(0, store.stats.failedSyncTasks - 1);
  if (newStatus === 'success') store.stats.successSyncTasks += 1;
  if (newStatus === 'failed') store.stats.failedSyncTasks += 1;
  const day = new Date().toISOString().slice(0, 10);
  if (!store.stats.dailyStats[day]) {
    store.stats.dailyStats[day] = { total: 0, success: 0, failed: 0 };
  }
  store.stats.dailyStats[day].total += 1;
  if (newStatus === 'success') store.stats.dailyStats[day].success += 1;
  if (newStatus === 'failed') store.stats.dailyStats[day].failed += 1;
}

module.exports = router;
