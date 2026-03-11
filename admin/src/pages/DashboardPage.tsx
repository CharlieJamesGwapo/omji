import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';

const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />
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
    if (isRefresh) {
      setRefreshing(true);
      await adminService.refreshDashboard();
    }
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

      setRecentUsers(Array.isArray(users) ? [...users].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) : []);
      setRecentDrivers(Array.isArray(drivers) ? [...drivers].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) : []);
      setMonthlyRevenueData(monthlyRevenueRes.data.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      toast.error('Failed to load dashboard data');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    intervalRef.current = setInterval(() => loadDashboard(false), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadDashboard]);

  const revenueData = [
    { name: 'Rides', value: stats.rideRevenue, color: '#374151' },
    { name: 'Deliveries', value: stats.deliveryRevenue, color: '#9CA3AF' },
    { name: 'Orders', value: stats.orderRevenue, color: '#D1D5DB' },
  ];

  const quickActions = [
    { label: 'Users', path: '/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Drivers', path: '/drivers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
    { label: 'Approvals', path: '/rider-approval', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', badge: stats.pendingDrivers },
    { label: 'Stores', path: '/stores', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { label: 'Rates', path: '/rates', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Payments', path: '/payment-configs', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-40 bg-gray-100 rounded animate-pulse" />
          <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Dashboard</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats.totalUsers },
          { label: 'Total Drivers', value: stats.totalDrivers },
          { label: 'Active Rides', value: stats.activeRides },
          { label: 'Total Revenue', value: `₱${stats.totalEarnings.toLocaleString()}` },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="relative bg-white rounded-lg border border-gray-200 p-3 sm:p-4 text-center hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            {action.badge ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {action.badge}
              </span>
            ) : null}
            <svg className="w-5 h-5 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
            </svg>
            <p className="text-[11px] font-medium text-gray-600">{action.label}</p>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2} dot={{ r: 3, fill: '#111827' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue Split</h2>
          {revenueData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
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
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Users</h2>
            <button onClick={() => navigate('/users')} className="text-xs font-medium text-gray-500 hover:text-gray-700">View All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentUsers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No users yet</div>
            ) : (
              recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xs font-semibold flex-shrink-0">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    user.is_verified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                  }`}>
                    {user.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Drivers</h2>
            <button onClick={() => navigate('/drivers')} className="text-xs font-medium text-gray-500 hover:text-gray-700">View All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentDrivers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No drivers yet</div>
            ) : (
              recentDrivers.map((driver) => (
                <div key={driver.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xs font-semibold flex-shrink-0">
                    {(driver.User?.name || driver.name || 'D').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{driver.User?.name || driver.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400 truncate">{driver.User?.phone || driver.phone || ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    driver.is_verified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
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
