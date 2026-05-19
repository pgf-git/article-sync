const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../store');

const router = express.Router();

router.get('/', (req, res) => {
  const { page = 1, pageSize = 20, status, keyword } = req.query;
  let list = [...store.articles];
  if (status) {
    list = list.filter(a => a.status === status);
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(kw) || (a.tags && a.tags.some(t => t.toLowerCase().includes(kw))));
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  const total = list.length;
  const start = (Number(page) - 1) * Number(pageSize);
  const items = list.slice(start, start + Number(pageSize)).map(a => ({
    id: a.id,
    title: a.title,
    tags: a.tags,
    coverImage: a.coverImage,
    status: a.status,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt
  }));
  res.json({ success: true, data: { items, total, page: Number(page), pageSize: Number(pageSize) } });
});

router.get('/:id', (req, res) => {
  const article = store.articles.find(a => a.id === req.params.id);
  if (!article) {
    return res.status(404).json({ success: false, error: 'Article not found' });
  }
  res.json({ success: true, data: article });
});

router.post('/', (req, res) => {
  const { title, content_html, content_md, tags, coverImage, status } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  const now = Date.now();
  const article = {
    id: uuidv4(),
    title,
    content_html: content_html || '',
    content_md: content_md || '',
    tags: tags || [],
    coverImage: coverImage || '',
    status: status || 'draft',
    createdAt: now,
    updatedAt: now
  };
  store.articles.unshift(article);
  store.stats.totalArticles = store.articles.length;
  res.status(201).json({ success: true, data: article });
});

router.put('/:id', (req, res) => {
  const idx = store.articles.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Article not found' });
  }
  const { title, content_html, content_md, tags, coverImage, status } = req.body;
  const article = store.articles[idx];
  if (title !== undefined) article.title = title;
  if (content_html !== undefined) article.content_html = content_html;
  if (content_md !== undefined) article.content_md = content_md;
  if (tags !== undefined) article.tags = tags;
  if (coverImage !== undefined) article.coverImage = coverImage;
  if (status !== undefined) article.status = status;
  article.updatedAt = Date.now();
  res.json({ success: true, data: article });
});

router.delete('/:id', (req, res) => {
  const idx = store.articles.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Article not found' });
  }
  store.articles.splice(idx, 1);
  store.stats.totalArticles = store.articles.length;
  res.json({ success: true });
});

module.exports = router;
