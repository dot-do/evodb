/**
 * EvoDB Dashboard - Real-time Monitoring
 *
 * This dashboard connects to an EvoDB server and displays real-time metrics
 * using the @evodb/observability package.
 */

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Refresh interval in milliseconds
  refreshInterval: 2000,

  // Chart history size (number of data points)
  chartHistorySize: 30,

  // WebSocket reconnect delay
  wsReconnectDelay: 3000,

  // Demo mode (simulates data when server is unavailable)
  demoMode: true,
};

// =============================================================================
// State
// =============================================================================

let state = {
  apiUrl: 'http://localhost:8787',
  connected: false,
  ws: null,
  refreshTimer: null,
  latencyHistory: [],
  cacheHistory: [],
  lastMetrics: null,
};

// =============================================================================
// Charts
// =============================================================================

let latencyChart = null;
let cacheChart = null;

function initCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#8b949e',
          boxWidth: 12,
          padding: 16,
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: '#30363d',
        },
        ticks: {
          color: '#8b949e',
          maxRotation: 0,
        },
      },
      y: {
        display: true,
        grid: {
          color: '#30363d',
        },
        ticks: {
          color: '#8b949e',
        },
      },
    },
  };

  // Latency chart
  const latencyCtx = document.getElementById('latency-chart').getContext('2d');
  latencyChart = new Chart(latencyCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'p50',
          data: [],
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88, 166, 255, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'p95',
          data: [],
          borderColor: '#d29922',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.4,
        },
        {
          label: 'p99',
          data: [],
          borderColor: '#f85149',
          backgroundColor: 'transparent',
          borderDash: [2, 2],
          tension: 0.4,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          title: {
            display: true,
            text: 'Latency (ms)',
            color: '#8b949e',
          },
        },
      },
    },
  });

  // Cache hit rate chart
  const cacheCtx = document.getElementById('cache-chart').getContext('2d');
  cacheChart = new Chart(cacheCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Hit Rate',
          data: [],
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63, 185, 80, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          min: 0,
          max: 100,
          title: {
            display: true,
            text: 'Hit Rate (%)',
            color: '#8b949e',
          },
        },
      },
    },
  });
}

function updateCharts(metrics) {
  const now = new Date().toLocaleTimeString();

  // Update latency chart
  if (metrics.queries && metrics.queries.latency) {
    state.latencyHistory.push({
      time: now,
      p50: metrics.queries.latency.p50 * 1000, // Convert to ms
      p95: metrics.queries.latency.p95 * 1000,
      p99: metrics.queries.latency.p99 * 1000,
    });

    // Keep only last N points
    if (state.latencyHistory.length > CONFIG.chartHistorySize) {
      state.latencyHistory.shift();
    }

    latencyChart.data.labels = state.latencyHistory.map((d) => d.time);
    latencyChart.data.datasets[0].data = state.latencyHistory.map((d) => d.p50);
    latencyChart.data.datasets[1].data = state.latencyHistory.map((d) => d.p95);
    latencyChart.data.datasets[2].data = state.latencyHistory.map((d) => d.p99);
    latencyChart.update('none');
  }

  // Update cache chart
  if (metrics.cache && typeof metrics.cache.hitRate === 'number') {
    state.cacheHistory.push({
      time: now,
      hitRate: metrics.cache.hitRate * 100,
    });

    if (state.cacheHistory.length > CONFIG.chartHistorySize) {
      state.cacheHistory.shift();
    }

    cacheChart.data.labels = state.cacheHistory.map((d) => d.time);
    cacheChart.data.datasets[0].data = state.cacheHistory.map((d) => d.hitRate);
    cacheChart.update('none');
  }
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchOverview() {
  try {
    const response = await fetch(`${state.apiUrl}/api/dashboard/overview`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch overview:', error.message);
    return null;
  }
}

async function fetchHealth() {
  try {
    const response = await fetch(`${state.apiUrl}/api/dashboard/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch health:', error.message);
    return null;
  }
}

async function fetchTables() {
  try {
    const response = await fetch(`${state.apiUrl}/api/dashboard/tables`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch tables:', error.message);
    return null;
  }
}

async function fetchCDCStatus() {
  try {
    const response = await fetch(`${state.apiUrl}/api/dashboard/cdc/status`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch CDC status:', error.message);
    return null;
  }
}

// =============================================================================
// UI Updates
// =============================================================================

function updateStatus(connected, message) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  state.connected = connected;

  if (connected) {
    dot.className = 'status-dot';
    text.textContent = message || 'Connected';
  } else {
    dot.className = 'status-dot error';
    text.textContent = message || 'Disconnected';
  }
}

function updateOverviewUI(data) {
  if (!data || !data.metrics) return;

  const { metrics } = data;

  // Query stats
  if (metrics.queries) {
    document.getElementById('qps-value').textContent = formatNumber(
      metrics.queries.qps || 0
    );
    document.getElementById('p50-latency').textContent = formatLatency(
      metrics.queries.latency?.p50
    );
    document.getElementById('p95-latency').textContent = formatLatency(
      metrics.queries.latency?.p95
    );
    document.getElementById('p99-latency').textContent = formatLatency(
      metrics.queries.latency?.p99
    );
  }

  // Cache stats
  if (metrics.cache) {
    const hitRate = (metrics.cache.hitRate || 0) * 100;
    document.getElementById('cache-hit-rate').textContent = `${hitRate.toFixed(
      1
    )}%`;
    document.getElementById('block-cache-hits').textContent = formatNumber(
      metrics.cache.blockHits || 0
    );
    document.getElementById('query-cache-hits').textContent = formatNumber(
      metrics.cache.queryHits || 0
    );
    document.getElementById('cache-misses').textContent = formatNumber(
      metrics.cache.misses || 0
    );
  }

  // Storage stats
  if (metrics.storage) {
    document.getElementById('storage-used').textContent = formatBytes(
      metrics.storage.totalBytes || 0
    );
    document.getElementById('total-blocks').textContent = formatNumber(
      metrics.storage.blockCount || 0
    );
    document.getElementById('table-count').textContent = formatNumber(
      metrics.storage.tablesCount || 0
    );
    document.getElementById('buffer-size').textContent = formatBytes(
      metrics.storage.bufferBytes || 0
    );
  }

  // Connection stats
  if (metrics.cdc) {
    document.getElementById('active-connections').textContent = formatNumber(
      metrics.cdc.connectedShards || 0
    );
    document.getElementById('ws-connections').textContent = formatNumber(
      metrics.cdc.wsConnections || 0
    );
    document.getElementById('cdc-shards').textContent = formatNumber(
      metrics.cdc.connectedShards || 0
    );
    document.getElementById('cdc-lag').textContent = `${(
      (metrics.cdc.lag || 0) * 1000
    ).toFixed(0)} ms`;
  }

  // Update charts
  updateCharts(metrics);
}

function updateHealthUI(data) {
  if (!data || !data.checks) return;

  const { checks } = data;

  // Storage health
  if (checks.storage) {
    updateHealthRow(
      'storage',
      checks.storage.status,
      checks.storage.latency,
      `Utilization: ${((checks.storage.utilization || 0) * 100).toFixed(0)}%`
    );
  }

  // Cache health
  if (checks.cache) {
    updateHealthRow(
      'cache',
      checks.cache.status,
      checks.cache.latency,
      `Utilization: ${((checks.cache.utilization || 0) * 100).toFixed(0)}%`
    );
  }

  // CDC health
  if (checks.cdc) {
    updateHealthRow(
      'cdc',
      checks.cdc.status,
      checks.cdc.latency,
      `Lag: ${((checks.cdc.lag || 0) * 1000).toFixed(0)}ms`
    );
  }
}

function updateHealthRow(component, status, latency, details) {
  const statusEl = document.getElementById(`health-${component}-status`);
  const latencyEl = document.getElementById(`health-${component}-latency`);
  const detailsEl = document.getElementById(`health-${component}-details`);

  if (statusEl) {
    statusEl.textContent = status === 'ok' ? 'OK' : status.toUpperCase();
    statusEl.className = `badge ${
      status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'error'
    }`;
  }

  if (latencyEl) {
    latencyEl.textContent = latency != null ? `${latency} ms` : '-- ms';
  }

  if (detailsEl) {
    detailsEl.textContent = details || '--';
  }
}

function updateTablesUI(data) {
  if (!data || !data.tables) return;

  const tbody = document.getElementById('tables-body');

  if (data.tables.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-secondary);">
          No tables found
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.tables
    .map(
      (table) => `
    <tr>
      <td><strong>${escapeHtml(table.name)}</strong></td>
      <td>${formatNumber(table.rowCount || 0)}</td>
      <td>${formatBytes(table.storageBytes || 0)}</td>
      <td>${formatNumber(table.blockCount || 0)}</td>
      <td><span class="badge success">Active</span></td>
    </tr>
  `
    )
    .join('');
}

function updateCDCUI(data) {
  if (!data) return;

  const statusEl = document.getElementById('cdc-status');
  const statusSubEl = document.getElementById('cdc-status-sub');

  // CDC State
  const stateColors = {
    idle: 'yellow',
    receiving: 'green',
    flushing: 'blue',
    recovering: 'yellow',
    error: 'red',
  };

  statusEl.textContent = capitalizeFirst(data.state || 'idle');
  statusEl.className = `card-value ${stateColors[data.state] || 'yellow'}`;

  const shardCount = data.shards?.length || 0;
  statusSubEl.textContent =
    shardCount > 0 ? `${shardCount} shard(s) connected` : 'No active replication';

  // CDC entries
  document.getElementById('cdc-entries').textContent = formatNumber(
    data.buffer?.entryCount || 0
  );

  // Flush times
  document.getElementById('last-flush').textContent = data.lastFlush
    ? formatTime(data.lastFlush)
    : '--';

  document.getElementById('next-flush').textContent = data.nextFlush
    ? formatTime(data.nextFlush)
    : '--';

  // Buffer utilization
  const utilization = (data.buffer?.utilization || 0) * 100;
  document.getElementById('buffer-util-value').textContent = `${utilization.toFixed(
    1
  )}%`;
  document.getElementById('entries-buffered').textContent = formatNumber(
    data.buffer?.entryCount || 0
  );

  // Time until flush
  if (data.nextFlush) {
    const timeUntil = Math.max(0, data.nextFlush - Date.now());
    document.getElementById('time-until-flush').textContent = `${(
      timeUntil / 1000
    ).toFixed(0)} s`;
  }

  // Progress bar
  const progressEl = document.getElementById('buffer-progress');
  progressEl.style.width = `${utilization}%`;
  progressEl.className = `progress-fill ${
    utilization > 80 ? 'red' : utilization > 50 ? 'yellow' : 'green'
  }`;
}

function updateLastUpdate() {
  document.getElementById('last-update').textContent =
    `Last update: ${new Date().toLocaleTimeString()}`;
}

// =============================================================================
// Formatting Helpers
// =============================================================================

function formatNumber(num) {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  } else if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatLatency(seconds) {
  if (seconds == null) return '--';
  const ms = seconds * 1000;
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)} us`;
  }
  return `${ms.toFixed(2)} ms`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// Demo Mode (Simulated Data)
// =============================================================================

function generateDemoData() {
  const baseTime = Date.now();

  return {
    timestamp: baseTime,
    status: 'healthy',
    metrics: {
      queries: {
        total: 1250000 + Math.floor(Math.random() * 1000),
        qps: 120 + Math.random() * 60,
        latency: {
          p50: 0.002 + Math.random() * 0.001,
          p95: 0.012 + Math.random() * 0.005,
          p99: 0.035 + Math.random() * 0.015,
        },
      },
      cache: {
        hitRate: 0.9 + Math.random() * 0.08,
        blockHits: 94000 + Math.floor(Math.random() * 500),
        queryHits: 87000 + Math.floor(Math.random() * 300),
        misses: 6000 + Math.floor(Math.random() * 100),
        size: 134217728,
        evictions: 1250 + Math.floor(Math.random() * 10),
      },
      storage: {
        totalBytes: 10737418240 + Math.floor(Math.random() * 100000000),
        blockCount: 1500 + Math.floor(Math.random() * 10),
        tablesCount: 12,
        bufferBytes: 16777216 + Math.floor(Math.random() * 1000000),
      },
      cdc: {
        lag: 0.1 + Math.random() * 0.1,
        entriesProcessed: 5000000 + Math.floor(Math.random() * 1000),
        connectedShards: 8,
        wsConnections: 8,
      },
    },
  };
}

function generateDemoHealth() {
  return {
    status: 'healthy',
    checks: {
      storage: { status: 'ok', latency: 3 + Math.floor(Math.random() * 5), utilization: 0.45 },
      cache: { status: 'ok', latency: 1, utilization: 0.75 + Math.random() * 0.1 },
      cdc: { status: 'ok', latency: 5 + Math.floor(Math.random() * 10), lag: 0.1 + Math.random() * 0.05 },
    },
    uptime: 86400,
    version: '1.0.0',
  };
}

function generateDemoTables() {
  return {
    tables: [
      { name: 'users', rowCount: 1500000, storageBytes: 536870912, blockCount: 150 },
      { name: 'orders', rowCount: 3200000, storageBytes: 1073741824, blockCount: 320 },
      { name: 'products', rowCount: 50000, storageBytes: 134217728, blockCount: 25 },
      { name: 'sessions', rowCount: 800000, storageBytes: 268435456, blockCount: 80 },
      { name: 'events', rowCount: 10000000, storageBytes: 4294967296, blockCount: 500 },
    ],
  };
}

function generateDemoCDC() {
  const baseTime = Date.now();
  return {
    state: Math.random() > 0.8 ? 'flushing' : 'receiving',
    shards: [
      { id: 'shard-1', name: 'us-east-1', status: 'connected', lag: 0.08 },
      { id: 'shard-2', name: 'us-west-2', status: 'connected', lag: 0.12 },
      { id: 'shard-3', name: 'eu-west-1', status: 'connected', lag: 0.15 },
    ],
    buffer: {
      batchCount: 10 + Math.floor(Math.random() * 10),
      entryCount: 3000 + Math.floor(Math.random() * 2000),
      utilization: 0.2 + Math.random() * 0.3,
    },
    lastFlush: baseTime - 25000,
    nextFlush: baseTime + 35000,
  };
}

// =============================================================================
// Main Loop
// =============================================================================

async function refreshData() {
  const spinner = document.getElementById('loading-spinner');
  spinner.classList.remove('hidden');

  let overview, health, tables, cdcStatus;

  if (CONFIG.demoMode && !state.connected) {
    // Use demo data when not connected to a real server
    overview = generateDemoData();
    health = generateDemoHealth();
    tables = generateDemoTables();
    cdcStatus = generateDemoCDC();
    updateStatus(false, 'Demo Mode');
  } else {
    // Fetch real data
    [overview, health, tables, cdcStatus] = await Promise.all([
      fetchOverview(),
      fetchHealth(),
      fetchTables(),
      fetchCDCStatus(),
    ]);

    if (overview) {
      updateStatus(true, 'Connected');
    } else {
      updateStatus(false, 'Connection Failed');
    }
  }

  // Update UI
  updateOverviewUI(overview);
  updateHealthUI(health);
  updateTablesUI(tables);
  updateCDCUI(cdcStatus);
  updateLastUpdate();

  spinner.classList.add('hidden');
}

function connectToServer() {
  const urlInput = document.getElementById('api-url');
  state.apiUrl = urlInput.value.replace(/\/$/, ''); // Remove trailing slash

  // Clear existing timer
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  // Clear chart history
  state.latencyHistory = [];
  state.cacheHistory = [];

  // Reset charts
  if (latencyChart) {
    latencyChart.data.labels = [];
    latencyChart.data.datasets.forEach((ds) => (ds.data = []));
    latencyChart.update();
  }
  if (cacheChart) {
    cacheChart.data.labels = [];
    cacheChart.data.datasets.forEach((ds) => (ds.data = []));
    cacheChart.update();
  }

  // Start refresh loop
  refreshData();
  state.refreshTimer = setInterval(refreshData, CONFIG.refreshInterval);
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initCharts();

  // Start with demo mode
  connectToServer();
});

// Expose for inline onclick handlers
window.connectToServer = connectToServer;
