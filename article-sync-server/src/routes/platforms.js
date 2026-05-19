const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../store');

const router = express.Router();

router.get('/registry', (req, res) => {
  const list = Object.values(store.platforms).map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    icon: p.icon,
    home: p.home,
    scriptVersion: p.scriptVersion,
    enabled: p.enabled,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  }));
  res.json({ success: true, data: list });
});

router.get('/:id/script', (req, res) => {
  const platform = store.platforms[req.params.id];
  if (!platform) {
    return res.status(404).json({ success: false, error: 'Platform not found' });
  }
  res.json({ success: true, data: { script: platform.script, version: platform.scriptVersion, type: platform.type } });
});

router.put('/:id/script', (req, res) => {
  const platform = store.platforms[req.params.id];
  if (!platform) {
    return res.status(404).json({ success: false, error: 'Platform not found' });
  }
  const { script, version } = req.body;
  if (!script) {
    return res.status(400).json({ success: false, error: 'Script is required' });
  }
  const oldVersion = platform.scriptVersion;
  const newVersion = version || incrementVersion(oldVersion);
  if (!store.scriptVersions[req.params.id]) {
    store.scriptVersions[req.params.id] = [];
  }
  store.scriptVersions[req.params.id].unshift({
    version: newVersion,
    script: platform.script,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt
  });
  platform.script = script;
  platform.scriptVersion = newVersion;
  platform.updatedAt = Date.now();
  res.json({ success: true, data: { version: newVersion } });
});

router.get('/:id/script/versions', (req, res) => {
  const platform = store.platforms[req.params.id];
  if (!platform) {
    return res.status(404).json({ success: false, error: 'Platform not found' });
  }
  const versions = store.scriptVersions[req.params.id] || [];
  res.json({ success: true, data: versions.map(v => ({ version: v.version, createdAt: v.createdAt, updatedAt: v.updatedAt })) });
});

router.post('/:id/script/rollback', (req, res) => {
  const platform = store.platforms[req.params.id];
  if (!platform) {
    return res.status(404).json({ success: false, error: 'Platform not found' });
  }
  const { version } = req.body;
  const versions = store.scriptVersions[req.params.id] || [];
  let target;
  if (version) {
    target = versions.find(v => v.version === version);
  } else {
    target = versions[0];
  }
  if (!target) {
    return res.status(404).json({ success: false, error: 'Version not found' });
  }
  store.scriptVersions[req.params.id].unshift({
    version: platform.scriptVersion,
    script: platform.script,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt
  });
  platform.script = target.script;
  platform.scriptVersion = target.version;
  platform.updatedAt = Date.now();
  res.json({ success: true, data: { version: target.version } });
});

function incrementVersion(ver) {
  const parts = ver.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

module.exports = router;
