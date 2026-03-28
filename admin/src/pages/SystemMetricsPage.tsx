import { useState, useEffect, useCallback } from 'react';
import { adminService, healthCheck } from '../services/api';
import toast from 'react-hot-toast';
import { useTheme } from '../App';
import { getErrorMessage } from '../utils';

interface MetricsData {
  uptime: string;
  go_version: string;
  num_cpu: number;
  num_goroutine: number;
  memory_alloc: string;
  memory_total_alloc: string;
  memory_sys: string;
  gc_cycles: number;
  db_open_connections: number;
  db_in_use: number;
  db_idle: number;
  db_max_open: number;
  db_wait_count: number;
  db_wait_duration: string;
  db_max_idle_closed: number;
  db_max_lifetime_closed: number;
}

export default function SystemMetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [healthStatus, setHealthStatus] = useState<'up' | 'down' | 'loading'>('loading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const fetchMetrics = useCallback(async (showToast = false) => {
    try {
      setError('');
      const [metricsRes, healthRes] = await Promise.allSettled([
        adminService.getSystemMetrics(),
        healthCheck(),
      ]);

      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value.data?.data || metricsRes.value.data);
      } else {
        setError('Failed to load metrics');
      }

      setHealthStatus(healthRes.status === 'fulfilled' ? 'up' : 'down');
      setLastUpdated(new Date());
      if (showToast) toast.success('Metrics refreshed');
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load metrics'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(() => fetchMetrics(), 10000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Unable to Load Metrics</p>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{error}</p>
          <button
            onClick={() => { setLoading(true); fetchMetrics(); }}
            className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const serverCards = [
    { label: 'Uptime', value: metrics?.uptime || '-', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Go Version', value: metrics?.go_version || '-', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { label: 'CPU Cores', value: metrics?.num_cpu?.toString() || '-', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
    { label: 'Go Routines', value: metrics?.num_goroutine?.toString() || '-', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  ];

  const memoryCards = [
    { label: 'Memory Alloc', value: metrics?.memory_alloc || '-', color: 'blue' },
    { label: 'Total Alloc', value: metrics?.memory_total_alloc || '-', color: 'purple' },
    { label: 'System Memory', value: metrics?.memory_sys || '-', color: 'indigo' },
    { label: 'GC Cycles', value: metrics?.gc_cycles?.toString() || '-', color: 'emerald' },
  ];

  const dbCards = [
    { label: 'Open Connections', value: metrics?.db_open_connections?.toString() || '-', color: 'green' },
    { label: 'In Use', value: metrics?.db_in_use?.toString() || '-', color: 'yellow' },
    { label: 'Idle', value: metrics?.db_idle?.toString() || '-', color: 'blue' },
    { label: 'Max Open', value: metrics?.db_max_open?.toString() || '-', color: 'gray' },
  ];

  const dbExtraCards = [
    { label: 'Wait Count', value: metrics?.db_wait_count?.toString() || '-' },
    { label: 'Wait Duration', value: metrics?.db_wait_duration || '-' },
    { label: 'Max Idle Closed', value: metrics?.db_max_idle_closed?.toString() || '-' },
    { label: 'Max Lifetime Closed', value: metrics?.db_max_lifetime_closed?.toString() || '-' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>System Metrics</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Real-time backend health and performance monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Health indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            healthStatus === 'up'
              ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
              : healthStatus === 'down'
                ? isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'
                : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              healthStatus === 'up' ? 'bg-emerald-500 animate-pulse' : healthStatus === 'down' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            {healthStatus === 'up' ? 'Healthy' : healthStatus === 'down' ? 'Unhealthy' : 'Checking...'}
          </div>

          {lastUpdated && (
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          <button
            onClick={() => fetchMetrics(true)}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
            title="Refresh metrics"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Auto-refresh notice */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Auto-refreshes every 10 seconds
      </div>

      {/* Server Info */}
      <div>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Server</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {serverCards.map((card) => (
            <div key={card.label} className={`rounded-xl p-5 border transition-colors ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <svg className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={card.icon} />
                  </svg>
                </div>
              </div>
              <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{card.label}</p>
              <p className={`text-lg font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Memory */}
      <div>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Memory</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {memoryCards.map((card) => (
            <div key={card.label} className={`rounded-xl p-5 border transition-colors ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{card.label}</p>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Database Pool */}
      <div>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Database Pool</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dbCards.map((card) => (
            <div key={card.label} className={`rounded-xl p-5 border transition-colors ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{card.label}</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Database Pool Extended */}
      <div>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Database Pool (Extended)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dbExtraCards.map((card) => (
            <div key={card.label} className={`rounded-xl p-5 border transition-colors ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{card.label}</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
