import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { getErrorMessage } from '../utils';
import { PageSkeleton } from '../components';

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface EarningsData {
  total_revenue: number;
  ride_revenue: number;
  delivery_revenue: number;
  order_revenue: number;
  total_commission: number;
}

const COLORS = ['#059669', '#10b981', '#6ee7b7'];

const ReportsPage: React.FC = () => {
  const [monthlyData, setMonthlyData] = useState<MonthlyRevenue[]>([]);
  const [earnings, setEarnings] = useState<EarningsData>({
    total_revenue: 0,
    ride_revenue: 0,
    delivery_revenue: 0,
    order_revenue: 0,
    total_commission: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [monthlyRes, earningsRes] = await Promise.all([
        adminService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
        adminService.getEarningsAnalytics().catch(() => ({ data: { data: {} } })),
      ]);

      setMonthlyData(monthlyRes.data.data || []);
      const e = earningsRes.data.data || {};
      setEarnings({
        total_revenue: e.total_revenue || 0,
        ride_revenue: e.ride_revenue || 0,
        delivery_revenue: e.delivery_revenue || 0,
        order_revenue: e.order_revenue || 0,
        total_commission: e.total_commission || 0,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load reports data'));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pieData = [
    { name: 'Rides', value: earnings.ride_revenue, color: COLORS[0] },
    { name: 'Deliveries', value: earnings.delivery_revenue, color: COLORS[1] },
    { name: 'Orders', value: earnings.order_revenue, color: COLORS[2] },
  ];

  // Compute this month's revenue from monthly data
  const now = new Date();
  const currentMonthLabel = now.toLocaleString('en-US', { month: 'short' });
  const currentMonthData = monthlyData.find(
    (m) => m.month?.toLowerCase().startsWith(currentMonthLabel.toLowerCase())
  );
  const thisMonthRevenue = currentMonthData?.revenue ?? 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const avgDailyRevenue = dayOfMonth > 0 ? thisMonthRevenue / dayOfMonth : 0;

  const growth = useMemo(() => {
    if (monthlyData.length < 2) return 0;
    const current = monthlyData[monthlyData.length - 1]?.revenue || 0;
    const previous = monthlyData[monthlyData.length - 2]?.revenue || 0;
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }, [monthlyData]);

  const formatCurrency = (val: number) =>
    `\u20B1${(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const downloadCSV = () => {
    if (!monthlyData.length) {
      toast.error('No data to export');
      return;
    }
    const header = 'Month,Revenue\n';
    const rows = monthlyData.map((m) => `${m.month},${m.revenue}`).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `omji-revenue-report-${now.toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  if (loading) {
    return <PageSkeleton statCards={4} tableRows={0} showSearch={false} />;
  }

  const metricCards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(earnings.total_revenue),
      accent: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'This Month',
      value: formatCurrency(thisMonthRevenue),
      accent: 'border-l-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
      label: 'Avg Daily Revenue',
      value: formatCurrency(avgDailyRevenue),
      sub: `Day ${dayOfMonth} of ${daysInMonth}`,
      accent: 'border-l-amber-500',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    },
    {
      label: 'Total Commissions',
      value: formatCurrency(earnings.total_commission),
      accent: 'border-l-violet-500',
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Revenue Reports</h1>
          <p className="text-xs text-gray-400 mt-1">Analytics and revenue breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-all duration-200 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download CSV
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50 transition-all duration-200 shadow-sm"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white rounded-xl border border-gray-100 border-l-4 ${card.accent} p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1.5">{card.value}</p>
                {'sub' in card && card.sub && (
                  <p className="text-[10px] text-gray-400 mt-1">{card.sub}</p>
                )}
              </div>
              <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex`}>
                <svg className={`w-5 h-5 ${card.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={card.icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
        {/* Month-over-Month Growth */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-teal-500 p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Month-over-Month</p>
              <p className={`text-xl sm:text-2xl font-bold mt-1.5 ${growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
              </p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 hidden sm:flex ${growth >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <span className="text-lg">{growth >= 0 ? '\u{1F4C8}' : '\u{1F4C9}'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue Line Chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Monthly Revenue</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Last 12 months trend</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} width={55} axisLine={false} tickLine={false} tickFormatter={(v: number) => `\u20B1${v.toLocaleString()}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(value: number) => [`\u20B1${value.toLocaleString()}`, 'Revenue']}
                    cursor={{ stroke: '#d1d5db', strokeDasharray: '4' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
                No monthly revenue data available
              </div>
            )}
          </div>
        </div>

        {/* Revenue by Service Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Revenue by Service</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Split across Rides, Deliveries, Orders</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            {pieData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(value: number) => [`\u20B1${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
                No revenue data to display
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Revenue Bar Chart & Service Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Month (Bar View) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Revenue by Month (Bar View)</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Monthly revenue as bars</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `\u20B1${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(value: number) => [`\u20B1${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
                No monthly revenue data available
              </div>
            )}
          </div>
        </div>

        {/* Service Performance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Service Performance</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Revenue breakdown by service type</p>
            </div>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(earnings.ride_revenue)}</p>
                <p className="text-sm text-gray-500 mt-1">Rides (Pasundo)</p>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(earnings.delivery_revenue)}</p>
                <p className="text-sm text-gray-500 mt-1">Deliveries (Pasugo)</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(earnings.order_revenue)}</p>
                <p className="text-sm text-gray-500 mt-1">Store Orders</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Monthly Breakdown</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Detailed monthly revenue figures</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Month</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.length > 0 ? (
                [...monthlyData].reverse().map((row) => (
                  <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-900 font-medium">{row.month}</td>
                    <td className="px-5 py-3 text-sm text-gray-900 font-semibold text-right">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-sm text-gray-400">No data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
