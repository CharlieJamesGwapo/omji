import React, { useState, useEffect } from 'react';
import { adminService } from '../services/api';

interface ActivityLog {
  id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  action: string;
  description: string;
  timestamp: string;
  ip_address?: string;
}

const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'users' | 'drivers' | 'admins'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      // Fetch rides, deliveries, and orders to build activity timeline
      const [ridesRes, deliveriesRes, ordersRes, usersRes, driversRes] = await Promise.all([
        adminService.getRidesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getDeliveriesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getOrdersAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getUsers().catch(() => ({ data: { data: [] } })),
        adminService.getDrivers().catch(() => ({ data: { data: [] } })),
      ]);

      const users = usersRes.data.data || [];
      const drivers = driversRes.data.data || [];

      // Build activity logs from user and driver data
      const activityLogs: ActivityLog[] = [];

      // Add user registration activities
      users.forEach((user: any, index: number) => {
        activityLogs.push({
          id: activityLogs.length + 1,
          user_id: user.id,
          user_name: user.name || 'Unknown User',
          user_role: user.role || 'user',
          action: 'USER_REGISTERED',
          description: `New user "${user.name}" registered with ${user.email || user.phone}`,
          timestamp: user.created_at || new Date().toISOString(),
          ip_address: undefined,
        });

        if (user.is_verified) {
          activityLogs.push({
            id: activityLogs.length + 1,
            user_id: user.id,
            user_name: user.name || 'Unknown User',
            user_role: user.role || 'user',
            action: 'USER_VERIFIED',
            description: `User "${user.name}" was verified`,
            timestamp: user.created_at || new Date().toISOString(),
            ip_address: undefined,
          });
        }
      });

      // Add driver registration activities
      drivers.forEach((driver: any) => {
        activityLogs.push({
          id: activityLogs.length + 1,
          user_id: driver.id,
          user_name: driver.name || 'Unknown Driver',
          user_role: 'driver',
          action: 'DRIVER_REGISTERED',
          description: `New driver "${driver.name}" registered - ${driver.vehicle_type || 'vehicle'} (${driver.plate_number || 'N/A'})`,
          timestamp: driver.created_at || new Date().toISOString(),
          ip_address: undefined,
        });

        if (driver.is_verified) {
          activityLogs.push({
            id: activityLogs.length + 1,
            user_id: driver.id,
            user_name: driver.name || 'Unknown Driver',
            user_role: 'driver',
            action: 'DRIVER_VERIFIED',
            description: `Driver "${driver.name}" was verified by admin`,
            timestamp: driver.created_at || new Date().toISOString(),
            ip_address: undefined,
          });
        }
      });

      // Sort by timestamp (most recent first)
      activityLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(activityLogs);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    }
    setLoading(false);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'users' && log.user_role === 'user') ||
      (filter === 'drivers' && log.user_role === 'driver') ||
      (filter === 'admins' && log.user_role === 'admin');

    const matchesSearch =
      search === '' ||
      log.user_name.toLowerCase().includes(search.toLowerCase()) ||
      log.description.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'USER_REGISTERED':
        return 'bg-blue-100 text-blue-700';
      case 'USER_VERIFIED':
        return 'bg-green-100 text-green-700';
      case 'DRIVER_REGISTERED':
        return 'bg-purple-100 text-purple-700';
      case 'DRIVER_VERIFIED':
        return 'bg-green-100 text-green-700';
      case 'RIDE_CREATED':
        return 'bg-indigo-100 text-indigo-700';
      case 'ORDER_PLACED':
        return 'bg-orange-100 text-orange-700';
      case 'DELIVERY_CREATED':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'USER_REGISTERED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        );
      case 'USER_VERIFIED':
      case 'DRIVER_VERIFIED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'DRIVER_REGISTERED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading activity logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Activity Logs</h1>
          <p className="text-gray-500 text-sm mt-1">{filteredLogs.length} activities recorded</p>
        </div>
        <input
          type="text"
          placeholder="Search activities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {['all', 'users', 'drivers', 'admins'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-3 sm:px-6 py-2 rounded-lg text-sm sm:text-base font-medium transition-all ${
              filter === f
                ? 'bg-red-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{logs.filter((l) => l.action === 'USER_REGISTERED').length}</div>
          <div className="text-blue-100 text-xs sm:text-sm mt-1">User Registrations</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{logs.filter((l) => l.action === 'DRIVER_REGISTERED').length}</div>
          <div className="text-purple-100 text-xs sm:text-sm mt-1">Driver Registrations</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">
            {logs.filter((l) => l.action === 'USER_VERIFIED' || l.action === 'DRIVER_VERIFIED').length}
          </div>
          <div className="text-green-100 text-xs sm:text-sm mt-1">Verifications</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{logs.length}</div>
          <div className="text-red-100 text-xs sm:text-sm mt-1">Total Activities</div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Activity Timeline</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 text-base sm:text-lg">No activity logs found</p>
              <p className="text-gray-400 text-xs sm:text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="p-3 sm:p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${getActionColor(log.action)}`}>{getActionIcon(log.action)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                      <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                          log.user_role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : log.user_role === 'driver'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.user_role}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-gray-900 mb-1 break-words">{log.description}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="truncate max-w-[120px] sm:max-w-none">{log.user_name}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLogsPage;
