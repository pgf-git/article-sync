const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({ success: true, data: store.extensionConfig });
});

router.post('/heartbeat', (req, res) => {
  const { extensionId, version, platforms } = req.body;
  if (!extensionId) {
    return res.status(400).json({ success: false, error: 'extensionId is required' });
  }
  store.heartbeats[extensionId] = {
    extensionId,
    version: version || 'unknown',
    platforms: platforms || [],
    lastSeen: Date.now(),
    status: 'online'
  };
  res.json({ success: true, data: { serverTime: Date.now() } });
});

module.exports = router;
