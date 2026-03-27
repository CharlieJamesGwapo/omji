import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { getErrorMessage } from '../utils';
import { PageSkeleton } from '../components';

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
  const [extendedStats, setExtendedStats] = useState({
    totalReferrals: 0,
    referralBonusesPaid: 0,
    pendingWithdrawals: 0,
    pendingWithdrawalAmount: 0,
    totalWithdrawn: 0,
    scheduledRides: 0,
    activeAnnouncements: 0,
    totalChatMessages: 0,
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
      const [usersRes, driversRes, ridesRes, earningsRes, monthlyRevenueRes, extendedRes] = await Promise.all([
        adminService.getUsers().catch(() => ({ data: { data: [] } })),
        adminService.getDrivers().catch(() => ({ data: { data: [] } })),
        adminService.getRidesAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getEarningsAnalytics().catch(() => ({ data: { data: {} } })),
        adminService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
        adminService.getExtendedAnalytics().catch(() => ({ data: { data: {} } })),
      ]);

      const users = usersRes.data.data || [];
      const drivers = driversRes.data.data || [];
      const ridesData = ridesRes.data.data || {};
      const earningsData = earningsRes.data.data || {};
      const extData = extendedRes.data.data || {};

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

      setExtendedStats({
        totalReferrals: extData.total_referrals || 0,
        referralBonusesPaid: extData.referral_bonuses_paid || 0,
        pendingWithdrawals: extData.pending_withdrawals || 0,
        pendingWithdrawalAmount: extData.pending_withdrawal_amount || 0,
        totalWithdrawn: extData.total_withdrawn || 0,
        scheduledRides: extData.scheduled_rides || 0,
        activeAnnouncements: extData.active_announcements || 0,
        totalChatMessages: extData.total_chat_messages || 0,
      });

      setRecentUsers(Array.isArray(users) ? [...users].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) : []);
      setRecentDrivers(Array.isArray(drivers) ? [...drivers].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) : []);
      setMonthlyRevenueData(monthlyRevenueRes.data.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load dashboard data'));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!document.hidden) loadDashboard(false);
    }, 60000);
    const handleVisChange = () => {
      if (!document.hidden) loadDashboard(false);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, [loadDashboard]);

  const revenueData = [
    { name: 'Rides', value: stats.rideRevenue, color: '#059669' },
    { name: 'Deliveries', value: stats.deliveryRevenue, color: '#10b981' },
    { name: 'Orders', value: stats.orderRevenue, color: '#6ee7b7' },
  ];

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, accent: 'border-l-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Total Drivers', value: stats.totalDrivers, accent: 'border-l-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
    { label: 'Active Rides', value: stats.activeRides, accent: 'border-l-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { label: 'Total Revenue', value: `\u20B1${stats.totalEarnings.toLocaleString()}`, accent: 'border-l-violet-500', iconBg: 'bg-violet-50', iconColor: 'text-violet-600', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  const quickActions = [
    { label: 'Users', path: '/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', color: 'hover:border-emerald-300 hover:bg-emerald-50', iconColor: 'text-emerald-500' },
    { label: 'Drivers', path: '/drivers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', color: 'hover:border-blue-300 hover:bg-blue-50', iconColor: 'text-blue-500' },
    { label: 'Approvals', path: '/rider-approval', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', badge: stats.pendingDrivers, color: 'hover:border-amber-300 hover:bg-amber-50', iconColor: 'text-amber-500' },
    { label: 'Stores', path: '/stores', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'hover:border-violet-300 hover:bg-violet-50', iconColor: 'text-violet-500' },
    { label: 'Rates', path: '/rates', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'hover:border-teal-300 hover:bg-teal-50', iconColor: 'text-teal-500' },
    { label: 'Payments', path: '/payment-configs', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', color: 'hover:border-rose-300 hover:bg-rose-50', iconColor: 'text-rose-500' },
  ];

  if (loading) {
    return <PageSkeleton statCards={4} tableRows={5} showSearch={false} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50 transition-all duration-200 shadow-sm"
          aria-label="Refresh dashboard"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white rounded-xl border border-gray-100 border-l-4 ${card.accent} p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{card.value}</p>
              </div>
              <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex`}>
                <svg className={`w-5 h-5 ${card.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={card.icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className={`relative bg-white rounded-xl border border-gray-100 p-4 text-center ${action.color} transition-all duration-200 shadow-sm hover:shadow-md group`}
              aria-label={`Go to ${action.label}`}
            >
              {action.badge ? (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white shadow-sm">
                  {action.badge}
                </span>
              ) : null}
              <svg className={`w-6 h-6 mx-auto ${action.iconColor} mb-2 group-hover:scale-110 transition-transform duration-200`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
              </svg>
              <p className="text-xs font-semibold text-gray-600">{action.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Platform Activity */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Platform Activity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Total Referrals */}
          <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-indigo-500 p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total Referrals</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{extendedStats.totalReferrals}</p>
                <p className="text-[10px] text-gray-400 mt-1">{'\u20B1'}{extendedStats.referralBonusesPaid.toLocaleString()} bonuses</p>
              </div>
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Pending Withdrawals */}
          <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-orange-500 p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Pending Withdrawals</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{extendedStats.pendingWithdrawals}</p>
                <p className="text-[10px] text-gray-400 mt-1">{'\u20B1'}{extendedStats.pendingWithdrawalAmount.toLocaleString()} amount</p>
              </div>
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Scheduled Rides */}
          <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-cyan-500 p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Scheduled Rides</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{extendedStats.scheduledRides}</p>
              </div>
              <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Today's Chat Messages */}
          <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-pink-500 p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Today's Messages</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{extendedStats.totalChatMessages}</p>
              </div>
              <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Active Announcements */}
          <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-yellow-500 p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Announcements</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1.5">{extendedStats.activeAnnouncements}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Revenue Trend</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Monthly revenue overview</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} width={45} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                  cursor={{ stroke: '#d1d5db', strokeDasharray: '4' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Revenue Split</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Breakdown by service type</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            {revenueData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={revenueData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {revenueData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
                <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                </svg>
                <p className="text-sm">No revenue data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Recent Users</h2>
            </div>
            <button onClick={() => navigate('/users')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors duration-200 flex items-center gap-1">
              View All
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div>
            {recentUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-sm">No users yet</p>
              </div>
            ) : (
              recentUsers.map((user, index) => (
                <div key={user.id} className={`flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors duration-150 ${index % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                    user.is_verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  }`}>
                    {user.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Recent Drivers</h2>
            </div>
            <button onClick={() => navigate('/drivers')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors duration-200 flex items-center gap-1">
              View All
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div>
            {recentDrivers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <p className="text-sm">No drivers yet</p>
              </div>
            ) : (
              recentDrivers.map((driver, index) => (
                <div key={driver.id} className={`flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors duration-150 ${index % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                    {(driver.User?.name || driver.name || 'D').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{driver.User?.name || driver.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400 truncate">{driver.User?.phone || driver.phone || ''}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                    driver.is_verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
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
