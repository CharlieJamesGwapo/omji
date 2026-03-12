import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface ActivityLog {
  id: number;
  type: 'ride' | 'delivery' | 'order' | 'user' | 'driver';
  action: string;
  user_name: string;
  user_email: string;
  details: string;
  status: string;
  amount: number;
  created_at: string;
}

type FilterType = 'all' | 'ride' | 'delivery' | 'order' | 'user' | 'driver';

const ITEMS_PER_PAGE = 20;

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; iconBg: string }> = {
  ride: { label: 'Ride', color: 'text-blue-700', bg: 'bg-blue-100', iconBg: 'bg-blue-50 border-blue-200' },
  delivery: { label: 'Delivery', color: 'text-purple-700', bg: 'bg-purple-100', iconBg: 'bg-purple-50 border-purple-200' },
  order: { label: 'Order', color: 'text-orange-700', bg: 'bg-orange-100', iconBg: 'bg-orange-50 border-orange-200' },
  user: { label: 'User', color: 'text-green-700', bg: 'bg-green-100', iconBg: 'bg-green-50 border-green-200' },
  driver: { label: 'Driver', color: 'text-indigo-700', bg: 'bg-indigo-100', iconBg: 'bg-indigo-50 border-indigo-200' },
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  registered: 'bg-green-100 text-green-700',
  verified: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const getTypeIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'ride':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      );
    case 'delivery':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case 'order':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      );
    case 'user':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'driver':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
};

const formatTime = (dateStr: string): string => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (amount: number): string => {
  return `P${(amount || 0).toLocaleString()}`;
};

const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await adminService.getActivityLogs();
      const data = response.data?.data || [];
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
      toast.error('Failed to load activity logs');
    }
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs(true);
  }, [loadLogs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadLogs(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter = filter === 'all' || log.type === filter;
    const matchesSearch =
      search === '' ||
      (log.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const paginated = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const counts = {
    total: logs.length,
    ride: logs.filter((l) => l.type === 'ride').length,
    delivery: logs.filter((l) => l.type === 'delivery').length,
    order: logs.filter((l) => l.type === 'order').length,
    registration: logs.filter((l) => l.type === 'user' || l.type === 'driver').length,
  };

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'ride', label: 'Rides', count: counts.ride },
    { key: 'delivery', label: 'Deliveries', count: counts.delivery },
    { key: 'order', label: 'Orders', count: counts.order },
    { key: 'user', label: 'Users', count: logs.filter(l => l.type === 'user').length },
    { key: 'driver', label: 'Drivers', count: logs.filter(l => l.type === 'driver').length },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-full sm:w-80 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 sm:h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-2 bg-gray-200 rounded animate-pulse w-full" />
                <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Activity Logs</h1>
          <p className="text-gray-500 text-sm mt-1">{filteredLogs.length} activities recorded</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, action, or details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{counts.total}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Activities</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{counts.ride}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Rides</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{counts.delivery}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Deliveries</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{counts.order}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Orders</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 col-span-2 lg:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{counts.registration}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Registrations</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-4 py-2.5 min-h-[40px] rounded-lg text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginated.length} of {filteredLogs.length} logs</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Empty State */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-12 sm:py-16">
          <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400 text-base sm:text-lg">No activity logs found</p>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block lg:hidden space-y-3">
            {paginated.map((log) => {
              const config = TYPE_CONFIG[log.type] || TYPE_CONFIG.user;
              const statusColor = STATUS_COLORS[log.status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
              return (
                <div key={log.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg border flex-shrink-0 ${config.iconBg} ${config.color}`}>
                      {getTypeIcon(log.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                        {log.status && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                            {log.status}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 break-words">{log.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5 break-words">{log.details}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="flex-1 min-w-0 truncate">{log.user_name || 'Unknown'}</span>
                        </span>
                        {log.user_email && (
                          <span className="flex-1 min-w-0 truncate text-gray-400">{log.user_email}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">{formatTime(log.created_at)}</span>
                        {log.amount > 0 && (
                          <span className="text-sm font-semibold text-gray-900">{formatCurrency(log.amount)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((log) => {
                    const config = TYPE_CONFIG[log.type] || TYPE_CONFIG.user;
                    const statusColor = STATUS_COLORS[log.status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg border ${config.iconBg} ${config.color}`}>
                              {getTypeIcon(log.type)}
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 max-w-[200px] truncate">{log.action}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{log.user_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{log.user_email || ''}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 max-w-[250px] truncate">{log.details || '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                          {log.status ? (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                              {log.status}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {log.amount > 0 ? (
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(log.amount)}</span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-gray-500 whitespace-nowrap">{formatTime(log.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .map((page, idx, arr) => {
                const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                return (
                  <React.Fragment key={page}>
                    {showEllipsis && (
                      <span className="px-2 py-1 text-sm text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityLogsPage;
