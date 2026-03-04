import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { adminService } from '../services/api';

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    activeRides: 0,
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

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [usersRes, driversRes, ridesRes, earningsRes, monthlyRevenueRes, growthRes] = await Promise.all([
        adminService.getUsers().catch(() => ({ data: { data: [] } })),
        adminService.getDrivers().catch(() => ({ data: { data: [] } })),
        adminService.getRidesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getEarningsAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
        adminService.getGrowthAnalytics().catch(() => ({ data: { data: [] } })),
      ]);

      const users = usersRes.data.data || [];
      const drivers = driversRes.data.data || [];
      const ridesData = ridesRes.data.data || {};
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
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
    setLoading(false);
  };

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome to OMJI Admin Dashboard</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium mb-1">Total Users</p>
              <p className="text-4xl font-bold">{stats.totalUsers}</p>
              <p className="text-blue-100 text-xs mt-2">All registered users</p>
            </div>
            <svg className="w-12 h-12 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">Total Drivers</p>
              <p className="text-4xl font-bold">{stats.totalDrivers}</p>
              <p className="text-green-100 text-xs mt-2">Registered drivers</p>
            </div>
            <svg className="w-12 h-12 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium mb-1">Active Rides</p>
              <p className="text-4xl font-bold">{stats.activeRides}</p>
              <p className="text-orange-100 text-xs mt-2">Currently in progress</p>
            </div>
            <svg className="w-12 h-12 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium mb-1">Total Revenue</p>
              <p className="text-4xl font-bold">₱{stats.totalEarnings}</p>
              <p className="text-purple-100 text-xs mt-2">All time earnings</p>
            </div>
            <svg className="w-12 h-12 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Bar Chart and Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Users & Drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Users & Drivers Overview</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={userDriverData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Total" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Verified" fill="#10B981" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Pending" fill="#F59E0B" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - Revenue Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: Line Chart and Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart - Monthly Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Monthly Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#DC2626" strokeWidth={3} dot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Area Chart - Platform Growth */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Platform Growth</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="users" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
              <Area type="monotone" dataKey="drivers" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
              <Area type="monotone" dataKey="orders" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Users & Drivers Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">Recent Users</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No users yet</div>
            ) : (
              recentUsers.map((user) => (
                <div key={user.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
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

        {/* Recent Drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">Recent Drivers</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentDrivers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No drivers yet</div>
            ) : (
              recentDrivers.map((driver) => (
                <div key={driver.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold">
                        {driver.name?.charAt(0).toUpperCase() || 'D'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{driver.name}</p>
                        <p className="text-sm text-gray-500">{driver.phone}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
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
  );
};

export default DashboardPage;
