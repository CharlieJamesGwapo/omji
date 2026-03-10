import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/api';

const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />
);

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    activeRides: 0,
    totalEarnings: 0,
    rideRevenue: 0,
    deliveryRevenue: 0,
    orderRevenue: 0,
    pendingDrivers: 0,
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentDrivers, setRecentDrivers] = useState<any[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [usersRes, driversRes, ridesRes, earningsRes, monthlyRevenueRes] = await Promise.all([
        adminService.getUsers().catch(() => ({ data: { data: [] } })),
        adminService.getDrivers().catch(() => ({ data: { data: [] } })),
        adminService.getRidesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getEarningsAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
      ]);

      const users = usersRes.data.data || [];
      const drivers = driversRes.data.data || [];
      const ridesData = ridesRes.data.data || {};
      const earningsData = earningsRes.data.data || {};

      const pendingDrivers = drivers.filter((d: any) => !d.is_verified).length;

      setStats({
        totalUsers: users.length,
        totalDrivers: drivers.length,
        activeRides: ridesData.active || 0,
        totalEarnings: earningsData.total_revenue || 0,
        rideRevenue: earningsData.ride_revenue || 0,
        deliveryRevenue: earningsData.delivery_revenue || 0,
        orderRevenue: earningsData.order_revenue || 0,
        pendingDrivers,
      });

      setRecentUsers(Array.isArray(users) ? users.slice(0, 5) : []);
      setRecentDrivers(Array.isArray(drivers) ? drivers.slice(0, 5) : []);
      setMonthlyRevenueData(monthlyRevenueRes.data.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    intervalRef.current = setInterval(() => loadDashboard(true), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadDashboard]);

  const revenueData = [
    { name: 'Rides', value: stats.rideRevenue, color: '#3B82F6' },
    { name: 'Deliveries', value: stats.deliveryRevenue, color: '#F59E0B' },
    { name: 'Orders', value: stats.orderRevenue, color: '#10B981' },
  ];

  const quickActions = [
    { label: 'Manage Users', path: '/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', color: 'blue' },
    { label: 'Manage Drivers', path: '/drivers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: 'green' },
    { label: 'Rider Approvals', path: '/rider-approval', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'amber', badge: stats.pendingDrivers },
    { label: 'Manage Stores', path: '/stores', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'purple' },
    { label: 'Manage Rates', path: '/rates', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'red' },
    { label: 'Payment Settings', path: '/payment-configs', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', color: 'indigo' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome back</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Last updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* 4 Key Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats.totalUsers, gradient: 'from-blue-500 to-blue-600', light: 'text-blue-100' },
          { label: 'Total Drivers', value: stats.totalDrivers, gradient: 'from-green-500 to-green-600', light: 'text-green-100' },
          { label: 'Active Rides', value: stats.activeRides, gradient: 'from-orange-500 to-orange-600', light: 'text-orange-100' },
          { label: 'Total Revenue', value: `₱${stats.totalEarnings.toLocaleString()}`, gradient: 'from-purple-500 to-purple-600', light: 'text-purple-100' },
        ].map((card) => (
          <div key={card.label} className={`bg-gradient-to-br ${card.gradient} rounded-xl p-4 text-white shadow-lg`}>
            <p className={`${card.light} text-xs font-medium mb-1`}>{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="relative bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md hover:border-gray-200 transition-all group"
            >
              {action.badge ? (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {action.badge}
                </span>
              ) : null}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${colorMap[action.color]}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                </svg>
              </div>
              <p className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">{action.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Two Charts Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend Line Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 overflow-hidden">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Split Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 overflow-hidden">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Revenue Split</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={revenueData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={75}
                dataKey="value"
              >
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recent Users</h2>
            <button onClick={() => navigate('/users')} className="text-xs font-semibold text-red-600 hover:text-red-700">View All</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentUsers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No users yet</div>
            ) : (
              recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    user.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {user.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recent Drivers</h2>
            <button onClick={() => navigate('/drivers')} className="text-xs font-semibold text-red-600 hover:text-red-700">View All</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentDrivers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No drivers yet</div>
            ) : (
              recentDrivers.map((driver) => (
                <div key={driver.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(driver.User?.name || driver.name || 'D').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{driver.User?.name || driver.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400 truncate">{driver.User?.phone || driver.phone || ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {driver.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
