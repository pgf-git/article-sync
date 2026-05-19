const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ success: true, data: store.webhooks });
});

router.post('/', (req, res) => {
  const { name, url, events, enabled } = req.body;
  if (!name || !url) {
    return res.status(400).json({ success: false, error: 'name and url are required' });
  }
  const now = Date.now();
  const webhook = {
    id: uuidv4(),
    name,
    url,
    events: events || [],
    enabled: enabled !== undefined ? enabled : true,
    createdAt: now,
    updatedAt: now
  };
  store.webhooks.push(webhook);
  res.status(201).json({ success: true, data: webhook });
});

router.put('/:id', (req, res) => {
  const idx = store.webhooks.findIndex(w => w.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  const { name, url, events, enabled } = req.body;
  const webhook = store.webhooks[idx];
  if (name !== undefined) webhook.name = name;
  if (url !== undefined) webhook.url = url;
  if (events !== undefined) webhook.events = events;
  if (enabled !== undefined) webhook.enabled = enabled;
  webhook.updatedAt = Date.now();
  res.json({ success: true, data: webhook });
});

router.delete('/:id', (req, res) => {
  const idx = store.webhooks.findIndex(w => w.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  store.webhooks.splice(idx, 1);
  res.json({ success: true });
});

module.exports = router;
