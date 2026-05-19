var DashboardPage = (function () {
  var wsUnsubscribe = null;

  function render() {
    return '<div class="stat-cards" id="statCards"></div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="card-header"><h3 class="card-title">同步趋势（近7天）</h3></div><div class="card-body" id="trendChart"></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">平台发布量排行</h3></div><div class="card-body" id="platformRank"></div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card-header"><h3 class="card-title">最近同步任务</h3><a href="#/sync-tasks" class="btn btn-link">查看全部</a></div><div class="card-body"><div class="table-wrapper"><table><thead><tr><th>文章</th><th>平台</th><th>状态</th><th>进度</th><th>创建时间</th></tr></thead><tbody id="recentTasks"></tbody></table></div></div></div>';
  }

  function init() {
    loadStats();
    loadTrend();
    loadPlatformStats();
    loadRecentTasks();
    wsUnsubscribe = App.onWsMessage(function (msg) {
      if (msg.type === 'syncProgress' || msg.type === 'syncComplete') {
        loadRecentTasks();
        loadStats();
      }
    });
  }

  function loadStats() {
    App.api.getStatsOverview().then(function (res) {
      var d = res.data || res;
      document.getElementById('statCards').innerHTML =
        statCard('📝', 'blue', d.articleCount || 0, '文章总数') +
        statCard('🖥️', 'green', d.platformCount || 0, '平台数') +
        statCard('🔄', 'orange', d.taskCount || 0, '同步任务数') +
        statCard('✅', 'blue', (d.successRate || 0) + '%', '成功率');
    }).catch(function () {
      document.getElementById('statCards').innerHTML =
        statCard('📝', 'blue', '-', '文章总数') +
        statCard('🖥️', 'green', '-', '平台数') +
        statCard('🔄', 'orange', '-', '同步任务数') +
        statCard('✅', 'blue', '-', '成功率');
    });
  }

  function statCard(icon, color, value, label) {
    return '<div class="stat-card"><div class="stat-icon ' + color + '">' + icon + '</div><div class="stat-info"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div></div>';
  }

  function loadTrend() {
    App.api.getSyncTrend(7).then(function (res) {
      var data = res.data || res || [];
      if (!Array.isArray(data) || data.length === 0) {
        document.getElementById('trendChart').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无趋势数据</div></div>';
        return;
      }
      var max = Math.max.apply(null, data.map(function (d) { return d.count || 0; })) || 1;
      var html = '<div class="bar-chart">';
      data.forEach(function (d) {
        var pct = Math.round(((d.count || 0) / max) * 100);
        html += '<div class="bar-chart-item"><div class="bar-chart-value">' + (d.count || 0) + '</div><div class="bar-chart-bar" style="height:' + pct + '%"></div><div class="bar-chart-label">' + (d.date || '').slice(5) + '</div></div>';
      });
      html += '</div>';
      document.getElementById('trendChart').innerHTML = html;
    }).catch(function () {
      document.getElementById('trendChart').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">加载失败</div></div>';
    });
  }

  function loadPlatformStats() {
    App.api.getPlatformStats().then(function (res) {
      var data = res.data || res || [];
      if (!Array.isArray(data) || data.length === 0) {
        document.getElementById('platformRank').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🖥️</div><div class="empty-state-text">暂无平台数据</div></div>';
        return;
      }
      var sorted = data.slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
      var max = sorted[0].count || 1;
      var html = '';
      sorted.forEach(function (d, i) {
        var pct = Math.round(((d.count || 0) / max) * 100);
        html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<span style="font-size:13px;color:var(--text-secondary);width:20px;text-align:right">' + (i + 1) + '</span>' +
          '<span style="font-size:14px;min-width:80px">' + App.escapeHtml(d.platform || d.name || '-') + '</span>' +
          '<div style="flex:1"><div class="progress-bar"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div></div>' +
          '<span style="font-size:13px;color:var(--text-secondary);min-width:40px;text-align:right">' + (d.count || 0) + '</span>' +
          '</div>';
      });
      document.getElementById('platformRank').innerHTML = html;
    }).catch(function () {
      document.getElementById('platformRank').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🖥️</div><div class="empty-state-text">加载失败</div></div>';
    });
  }

  function loadRecentTasks() {
    App.api.getSyncTasks({ page: 1, pageSize: 10 }).then(function (res) {
      var data = res.data || res || {};
      var tasks = data.items || data.list || [];
      var tbody = document.getElementById('recentTasks');
      if (!tasks.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-state-text">暂无同步任务</div></td></tr>';
        return;
      }
      tbody.innerHTML = tasks.map(function (t) {
        return '<tr>' +
          '<td>' + App.escapeHtml(t.articleTitle || t.article?.title || '-') + '</td>' +
          '<td>' + App.escapeHtml(t.platformName || t.platform?.name || '-') + '</td>' +
          '<td>' + statusBadge(t.status) + '</td>' +
          '<td><div class="progress-bar" style="width:100px"><div class="progress-bar-fill ' + progressClass(t.status) + '" style="width:' + (t.progress || 0) + '%"></div></div></td>' +
          '<td>' + App.formatRelativeTime(t.createdAt) + '</td>' +
          '</tr>';
      }).join('');
    }).catch(function () {
      document.getElementById('recentTasks').innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-state-text">加载失败</div></td></tr>';
    });
  }

  function statusBadge(status) {
    var map = { pending: '等待中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
    return '<span class="status-badge ' + (status || 'pending') + '">' + (map[status] || status || '-') + '</span>';
  }

  function progressClass(status) {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'error';
    return '';
  }

  function destroy() {
    if (wsUnsubscribe) { wsUnsubscribe(); wsUnsubscribe = null; }
  }

  return { render: render, init: init, destroy: destroy };
})();

App.registerPage('/dashboard', DashboardPage);
