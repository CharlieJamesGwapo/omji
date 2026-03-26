import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface CommissionConfig {
  id: number;
  percentage: number;
  is_active: boolean;
  updated_at: string;
}

interface CommissionRecord {
  id: number;
  service_type: string;
  service_id: number;
  driver_id: number;
  driver?: { user?: { name?: string } };
  total_fare: number;
  commission_percentage: number;
  commission_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface CommissionSummary {
  total_commission: number;
  total_deducted: number;
  total_pending_collection: number;
  ride_commission: number;
  delivery_commission: number;
  order_commission: number;
  current_month_commission: number;
  current_percentage: number;
}

const CommissionPage: React.FC = () => {
  const [config, setConfig] = useState<CommissionConfig | null>(null);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPercentage, setEditPercentage] = useState('');

  // Filters
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, summaryRes, recordsRes] = await Promise.all([
        adminService.getCommissionConfig(),
        adminService.getCommissionSummary(),
        adminService.getCommissionRecords({
          page,
          limit,
          service_type: filterServiceType,
          status: filterStatus,
          date_from: filterDateFrom ? new Date(filterDateFrom).toISOString() : '',
          date_to: filterDateTo ? new Date(filterDateTo + 'T23:59:59').toISOString() : '',
        }),
      ]);
      setConfig(configRes.data?.data || null);
      setSummary(summaryRes.data?.data || null);
      const recordsData = recordsRes.data?.data;
      setRecords(recordsData?.records || []);
      setTotal(recordsData?.total || 0);
    } catch {
      toast.error('Failed to load maintenance rate data');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterServiceType, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSavePercentage = async () => {
    const pct = parseFloat(editPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Percentage must be between 0 and 100');
      return;
    }
    try {
      setSaving(true);
      await adminService.updateCommissionConfig({ percentage: pct });
      toast.success(`Maintenance rate updated to ${pct}%`);
      setShowEditModal(false);
      fetchData();
    } catch {
      toast.error('Failed to update maintenance rate');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n: number) => `₱${(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalPages = Math.ceil(total / limit);

  const serviceLabel = (t: string) => {
    const map: Record<string, string> = { ride: 'Ride', delivery: 'Delivery', order: 'Order' };
    return map[t] || t;
  };

  if (loading && !config) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Maintenance Rate</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage platform maintenance rate and view earnings</p>
      </div>

      {/* Commission Rate Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Current Maintenance Rate</p>
            <p className="text-4xl font-bold text-emerald-600 mt-1">{config?.percentage ?? 0}%</p>
            {config?.updated_at && (
              <p className="text-xs text-gray-400 mt-1">Last updated: {formatDate(config.updated_at)}</p>
            )}
          </div>
          <button
            onClick={() => { setEditPercentage(String(config?.percentage ?? 0)); setShowEditModal(true); }}
            className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Edit Rate
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Maintenance</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.total_commission)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Auto-Deducted</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(summary.total_deducted)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Collection</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(summary.total_pending_collection)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Month</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(summary.current_month_commission)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterServiceType}
            onChange={(e) => { setFilterServiceType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Services</option>
            <option value="ride">Rides</option>
            <option value="delivery">Deliveries</option>
            <option value="order">Orders</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="deducted">Deducted</option>
            <option value="pending_collection">Pending Collection</option>
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="From"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="To"
          />
          {(filterServiceType !== 'all' || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterServiceType('all'); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Service</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Driver</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total Fare</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Rate</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Maintenance</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Payment</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No maintenance rate records found
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.service_type === 'ride' ? 'bg-blue-50 text-blue-700' :
                        r.service_type === 'delivery' ? 'bg-purple-50 text-purple-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {serviceLabel(r.service_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{r.driver?.user?.name || `Driver #${r.driver_id}`}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(r.total_fare)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.commission_percentage}%</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(r.commission_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500 capitalize">{r.payment_method}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'deducted'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {r.status === 'deducted' ? 'Deducted' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Maintenance Rate</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editPercentage}
                onChange={(e) => setEditPercentage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Enter a value between 0 and 100</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePercentage}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionPage;
