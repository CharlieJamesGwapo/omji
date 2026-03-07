import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { adminService } from '../services/api';

const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />
);

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-3 p-3 sm:p-4">
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
      <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2" />
    </div>
    <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse flex-shrink-0" />
  </div>
);

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    activeRides: 0,
    totalRides: 0,
    totalDeliveries: 0,
    totalOrders: 0,
    totalEarnings: 0,
    rideRevenue: 0,
    deliveryRevenue: 0,
    orderRevenue: 0,
    verifiedUsers: 0,
    pendingUsers: 0,
    verifiedDrivers: 0,
    pendingDrivers: 0,
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentDrivers, setRecentDrivers] = useState<any[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<any[]>([]);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [usersRes, driversRes, ridesRes, deliveriesRes, ordersRes, earningsRes, monthlyRevenueRes, growthRes] = await Promise.all([
        adminService.getUsers().catch(() => ({ data: { data: [] } })),
        adminService.getDrivers().catch(() => ({ data: { data: [] } })),
        adminService.getRidesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getDeliveriesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getOrdersAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getEarningsAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
        adminService.getGrowthAnalytics().catch(() => ({ data: { data: [] } })),
      ]);

      const users = usersRes.data.data || [];
      const drivers = driversRes.data.data || [];
      const ridesData = ridesRes.data.data || {};
      const deliveriesData = deliveriesRes.data.data || {};
      const ordersData = ordersRes.data.data || {};
      const earningsData = earningsRes.data.data || {};
      const monthlyRevenue = monthlyRevenueRes.data.data || [];
      const growth = growthRes.data.data || [];

      const verifiedUsers = users.filter((u: any) => u.is_verified).length;
      const pendingUsers = users.length - verifiedUsers;
      const verifiedDrivers = drivers.filter((d: any) => d.is_verified).length;
      const pendingDrivers = drivers.length - verifiedDrivers;

      setStats({
        totalUsers: users.length || 0,
        totalDrivers: drivers.length || 0,
        activeRides: ridesData.active || 0,
        totalRides: ridesData.total || 0,
        totalDeliveries: deliveriesData.total || 0,
        totalOrders: ordersData.total || 0,
        totalEarnings: earningsData.total_revenue || 0,
        rideRevenue: earningsData.ride_revenue || 0,
        deliveryRevenue: earningsData.delivery_revenue || 0,
        orderRevenue: earningsData.order_revenue || 0,
        verifiedUsers,
        pendingUsers,
        verifiedDrivers,
        pendingDrivers,
      });

      setRecentUsers(Array.isArray(users) ? users.slice(0, 5) : []);
      setRecentDrivers(Array.isArray(drivers) ? drivers.slice(0, 5) : []);
      setMonthlyRevenueData(monthlyRevenue);
      setGrowthData(growth);
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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      loadDashboard(true);
    }, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadDashboard]);

  // Data for Revenue Pie Chart
  const revenueData = [
    { name: 'Rides', value: stats.rideRevenue, color: '#3B82F6' },
    { name: 'Deliveries', value: stats.deliveryRevenue, color: '#F59E0B' },
    { name: 'Orders', value: stats.orderRevenue, color: '#10B981' },
  ];

  // Data for User/Driver Bar Chart
  const userDriverData = [
    { name: 'Users', Total: stats.totalUsers, Verified: stats.verifiedUsers, Pending: stats.pendingUsers },
    { name: 'Drivers', Total: stats.totalDrivers, Verified: stats.verifiedDrivers, Pending: stats.pendingDrivers },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>

        {/* Stats Row 1 skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <SkeletonCard className="h-24 sm:h-32" />
          <SkeletonCard className="h-24 sm:h-32" />
          <SkeletonCard className="h-24 sm:h-32" />
          <SkeletonCard className="h-24 sm:h-32" />
        </div>

        {/* Stats Row 2 skeleton */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <SkeletonCard className="h-20 sm:h-24" />
          <SkeletonCard className="h-20 sm:h-24" />
          <SkeletonCard className="h-20 sm:h-24" />
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <SkeletonCard className="h-72 sm:h-80" />
          <SkeletonCard className="h-72 sm:h-80" />
        </div>

        {/* Tables skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-100">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-100">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Welcome to OMJI Admin Dashboard</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {lastUpdated && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 w-full sm:w-auto justify-center"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Last updated on mobile */}
      {lastUpdated && (
        <p className="text-xs text-gray-400 -mt-4 sm:hidden">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}

      {/* Stats Cards - Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 sm:p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1">Total Users</p>
              <p className="text-xl sm:text-4xl font-bold">{stats.totalUsers}</p>
              <p className="text-blue-100 text-[10px] mt-0.5 sm:mt-2 hidden sm:block">All registered users</p>
            </div>
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-blue-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-3 sm:p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1">Total Drivers</p>
              <p className="text-xl sm:text-4xl font-bold">{stats.totalDrivers}</p>
              <p className="text-green-100 text-[10px] mt-0.5 sm:mt-2 hidden sm:block">Registered drivers</p>
            </div>
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-green-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-3 sm:p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1">Active Rides</p>
              <p className="text-xl sm:text-4xl font-bold">{stats.activeRides}</p>
              <p className="text-orange-100 text-[10px] mt-0.5 sm:mt-2 hidden sm:block">Currently in progress</p>
            </div>
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-orange-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-3 sm:p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1">Total Revenue</p>
              <p className="text-xl sm:text-4xl font-bold">P{stats.totalEarnings.toLocaleString()}</p>
              <p className="text-purple-100 text-[10px] mt-0.5 sm:mt-2 hidden sm:block">All time earnings</p>
            </div>
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-purple-200 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Stats Cards - Row 2: Services */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Rides</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalRides}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Deliveries</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalDeliveries}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Orders</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Bar Chart and Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Bar Chart - Users & Drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 overflow-hidden">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Users & Drivers Overview</h2>
          <div className="w-full -ml-2 sm:ml-0">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userDriverData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Total" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Verified" fill="#10B981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Pending" fill="#F59E0B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Revenue Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 overflow-hidden">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Revenue Distribution</h2>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={revenueData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
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
      </div>

      {/* Charts Row 2: Line Chart and Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Line Chart - Monthly Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 overflow-hidden">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Monthly Revenue Trend</h2>
          <div className="w-full -ml-2 sm:ml-0">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Area Chart - Platform Growth */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 overflow-hidden">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Platform Growth</h2>
          <div className="w-full -ml-2 sm:ml-0">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={35} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="users" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="drivers" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                <Area type="monotone" dataKey="orders" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Users & Drivers Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-100">
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Recent Users</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="divide-y divide-gray-100 min-w-[320px]">
              {recentUsers.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No users yet</div>
              ) : (
                recentUsers.map((user) => (
                  <div key={user.id} className="p-3 sm:p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                          {user.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{user.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                          user.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {user.is_verified ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-100">
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Recent Drivers</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="divide-y divide-gray-100 min-w-[320px]">
              {recentDrivers.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No drivers yet</div>
              ) : (
                recentDrivers.map((driver) => (
                  <div key={driver.id} className="p-3 sm:p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                          {(driver.User?.name || driver.name || 'D').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{driver.User?.name || driver.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 truncate">{driver.User?.phone || driver.phone || ''}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                          driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {driver.is_verified ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
