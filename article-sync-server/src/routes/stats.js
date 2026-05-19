const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/overview', (req, res) => {
  const onlineExtensions = Object.values(store.heartbeats).filter(
    h => Date.now() - h.lastSeen < 60000
  ).length;
  res.json({
    success: true,
    data: {
      totalArticles: store.stats.totalArticles,
      totalSyncTasks: store.stats.totalSyncTasks,
      successSyncTasks: store.stats.successSyncTasks,
      failedSyncTasks: store.stats.failedSyncTasks,
      totalPlatforms: store.stats.totalPlatforms,
      activePlatforms: store.stats.activePlatforms,
      onlineExtensions,
      successRate: store.stats.totalSyncTasks > 0
        ? Math.round((store.stats.successSyncTasks / store.stats.totalSyncTasks) * 100)
        : 0
    }
  });
});

router.get('/sync-trend', (req, res) => {
  const { days = 7 } = req.query;
  const result = [];
  const now = new Date();
  for (let i = Number(days) - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayStat = store.stats.dailyStats[key] || { total: 0, success: 0, failed: 0 };
    result.push({
      date: key,
      total: dayStat.total,
      success: dayStat.success,
      failed: dayStat.failed
    });
  }
  res.json({ success: true, data: result });
});

router.get('/platform-stats', (req, res) => {
  const result = Object.values(store.platforms).map(p => {
    const tasks = store.syncTasks.filter(t => t.platformId === p.id);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      enabled: p.enabled,
      totalTasks: tasks.length,
      successTasks: tasks.filter(t => t.status === 'success').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      pendingTasks: tasks.filter(t => t.status === 'pending' || t.status === 'running').length
    };
  });
  res.json({ success: true, data: result });
});

module.exports = router;
