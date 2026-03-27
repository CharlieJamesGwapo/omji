import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Referral } from '../types';
import { ITEMS_PER_PAGE } from '../constants';
import { formatCurrency, formatDateTime, getErrorMessage } from '../utils';
import { Pagination, StatusBadge, SearchInput, EmptyState, PageSkeleton } from '../components';

type FilterType = 'all' | 'pending' | 'completed';

const ReferralsPage: React.FC = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<FilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [summary, setSummary] = useState({ total_referrals: 0, total_bonuses: 0, active_referrers: 0 });

  useEffect(() => {
    loadReferrals();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filter]);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getReferrals();
      const data = res.data.data || {};
      setReferrals(data.referrals || []);
      setSummary({
        total_referrals: data.total_referrals || 0,
        total_bonuses: data.total_bonuses || 0,
        active_referrers: data.active_referrers || 0,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load referrals'));
    }
    setLoading(false);
  }, []);

  const filtered = useMemo(() => referrals.filter((r) => {
    const referrerName = (r.Referrer?.name || '').toLowerCase();
    const referredName = (r.Referred?.name || '').toLowerCase();
    const referrerPhone = (r.Referrer?.phone || '').toLowerCase();
    const referredPhone = (r.Referred?.phone || '').toLowerCase();
    const q = debouncedSearch.toLowerCase();
    const matchesSearch = !q || referrerName.includes(q) || referredName.includes(q) || referrerPhone.includes(q) || referredPhone.includes(q);

    let matchesFilter = true;
    if (filter !== 'all') matchesFilter = r.status === filter;

    return matchesSearch && matchesFilter;
  }), [referrals, debouncedSearch, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => ({
    pending: referrals.filter(r => r.status === 'pending').length,
    completed: referrals.filter(r => r.status === 'completed').length,
  }), [referrals]);

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: referrals.length },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'pending', label: 'Pending', count: stats.pending },
  ];

  if (loading) {
    return <PageSkeleton statCards={3} filterButtons={3} tableRows={8} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Referrals</h1>
            <p className="text-gray-500 text-sm mt-1">{referrals.length} total referrals</p>
          </div>
          <button
            onClick={loadReferrals}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Refresh referrals"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or phone..."
          className="w-full sm:w-80"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-blue-600">{summary.total_referrals}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Referrals</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(summary.total_bonuses)}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Bonuses Paid</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-purple-600">{summary.active_referrers}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Active Referrers</div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === fb.key
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {fb.label} ({fb.count})
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginated.length} of {filtered.length} referrals</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginated.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {r.Referrer?.name || 'Unknown'}
                  </h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{r.id}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  referred {r.Referred?.name || 'Unknown'}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <span className="text-gray-400">Referrer Bonus</span>
                <p className="font-semibold text-gray-900">{formatCurrency(r.referrer_bonus)}</p>
              </div>
              <div>
                <span className="text-gray-400">Referred Bonus</span>
                <p className="font-semibold text-gray-900">{formatCurrency(r.referred_bonus)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{formatDateTime(r.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold">Referrer</th>
                <th className="text-left px-4 py-3 font-semibold">Referred</th>
                <th className="text-left px-4 py-3 font-semibold">Referrer Bonus</th>
                <th className="text-left px-4 py-3 font-semibold">Referred Bonus</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <EmptyState
                      title="No referrals found"
                      description={filter !== 'all' || debouncedSearch ? 'Try adjusting your filters or search.' : 'No referrals yet.'}
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{r.Referrer?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{r.Referrer?.phone || '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{r.Referred?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{r.Referred?.phone || '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">{formatCurrency(r.referrer_bonus)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">{formatCurrency(r.referred_bonus)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
};

export default ReferralsPage;
