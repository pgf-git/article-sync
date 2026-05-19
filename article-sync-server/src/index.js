const express = require('express');
const cors = require('cors');
const http = require('http');
const { setupWebSocket } = require('./websocket');

const platformsRouter = require('./routes/platforms');
const articlesRouter = require('./routes/articles');
const syncRouter = require('./routes/sync');
const extensionRouter = require('./routes/extension');
const statsRouter = require('./routes/stats');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const server = http.createServer(app);
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/v1/platforms', platformsRouter);
app.use('/api/v1/articles', articlesRouter);
app.use('/api/v1/sync', syncRouter);
app.use('/api/v1/extension', extensionRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/webhooks', webhooksRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: Date.now(), uptime: process.uptime() } });
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Article Sync Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
