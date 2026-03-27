import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { WithdrawalRequest } from '../types';
import { ITEMS_PER_PAGE } from '../constants';
import { formatStatus, formatCurrency, formatDateTime, getErrorMessage } from '../utils';
import { Pagination, StatusBadge, SearchInput, EmptyState, PageSkeleton } from '../components';

type FilterType = 'all' | 'pending' | 'approved' | 'rejected' | 'completed';

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<FilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'default' | 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    open: false, title: '', message: '', variant: 'default', onConfirm: () => {},
  });

  useEffect(() => {
    loadWithdrawals();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filter]);

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getWithdrawals();
      setWithdrawals(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load withdrawals'));
    }
    setLoading(false);
  }, []);

  const handleAction = useCallback((id: number, status: 'approved' | 'rejected' | 'completed') => {
    const labels: Record<string, string> = { approved: 'Approve', rejected: 'Reject', completed: 'Mark Completed' };
    const variants: Record<string, 'default' | 'danger' | 'warning'> = { approved: 'default', rejected: 'danger', completed: 'warning' };
    setActionNote('');
    setConfirmDialog({
      open: true,
      title: `${labels[status]} Withdrawal #${id}`,
      message: `Are you sure you want to ${labels[status].toLowerCase()} this withdrawal request?`,
      variant: variants[status],
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setUpdatingId(id);
        try {
          await adminService.updateWithdrawal(id, { status, note: actionNote || undefined });
          setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status, note: actionNote || w.note } : w));
          toast.success(`Withdrawal #${id} ${formatStatus(status).toLowerCase()}`);
        } catch (err) {
          toast.error(getErrorMessage(err, `Failed to ${labels[status].toLowerCase()} withdrawal`));
        } finally {
          setUpdatingId(null);
        }
      },
    });
  }, [actionNote]);

  const filtered = useMemo(() => withdrawals.filter((w) => {
    const driverName = (w.Driver?.User?.name || '').toLowerCase();
    const accountName = (w.account_name || '').toLowerCase();
    const accountNumber = (w.account_number || '').toLowerCase();
    const method = (w.method || '').toLowerCase();
    const q = debouncedSearch.toLowerCase();
    const matchesSearch = !q || driverName.includes(q) || accountName.includes(q) || accountNumber.includes(q) || method.includes(q);

    let matchesFilter = true;
    if (filter !== 'all') matchesFilter = w.status === filter;

    return matchesSearch && matchesFilter;
  }), [withdrawals, debouncedSearch, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => ({
    pending: withdrawals.filter(w => w.status === 'pending'),
    approved: withdrawals.filter(w => w.status === 'approved'),
    completed: withdrawals.filter(w => w.status === 'completed'),
    rejected: withdrawals.filter(w => w.status === 'rejected'),
  }), [withdrawals]);

  const pendingAmount = stats.pending.reduce((sum, w) => sum + (w.amount || 0), 0);
  const approvedAmount = stats.approved.reduce((sum, w) => sum + (w.amount || 0), 0);
  const completedAmount = stats.completed.reduce((sum, w) => sum + (w.amount || 0), 0);

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: withdrawals.length },
    { key: 'pending', label: 'Pending', count: stats.pending.length },
    { key: 'approved', label: 'Approved', count: stats.approved.length },
    { key: 'rejected', label: 'Rejected', count: stats.rejected.length },
    { key: 'completed', label: 'Completed', count: stats.completed.length },
  ];

  if (loading) {
    return <PageSkeleton statCards={4} filterButtons={5} tableRows={8} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Withdrawals</h1>
            <p className="text-gray-500 text-sm mt-1">{withdrawals.length} total requests</p>
          </div>
          <button
            onClick={loadWithdrawals}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Refresh withdrawals"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by driver, account, method..."
          className="w-full sm:w-80"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-yellow-600">{stats.pending.length}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Pending</div>
          <div className="text-yellow-600 text-xs font-medium mt-0.5">{formatCurrency(pendingAmount)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.approved.length}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Approved</div>
          <div className="text-blue-600 text-xs font-medium mt-0.5">{formatCurrency(approvedAmount)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-green-600">{stats.completed.length}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Completed</div>
          <div className="text-green-600 text-xs font-medium mt-0.5">{formatCurrency(completedAmount)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-red-600">{stats.rejected.length}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Rejected</div>
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
        <span>Showing {paginated.length} of {filtered.length} withdrawals</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginated.map((w) => (
          <div key={w.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {w.Driver?.User?.name || 'Unknown Driver'}
                  </h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{w.id}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {w.Driver?.User?.phone || 'No phone'}
                </p>
              </div>
              <StatusBadge status={w.status} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <span className="text-gray-400">Amount</span>
                <p className="font-semibold text-gray-900">{formatCurrency(w.amount)}</p>
              </div>
              <div>
                <span className="text-gray-400">Method</span>
                <p className="font-medium text-gray-900 uppercase">{w.method}</p>
              </div>
              <div>
                <span className="text-gray-400">Account</span>
                <p className="font-medium text-gray-900 truncate">{w.account_name}</p>
              </div>
              <div>
                <span className="text-gray-400">Number</span>
                <p className="font-medium text-gray-900">{w.account_number}</p>
              </div>
            </div>

            {w.note && (
              <p className="text-xs text-gray-500 mb-3 italic">Note: {w.note}</p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{formatDateTime(w.created_at)}</span>
              {w.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(w.id, 'approved')}
                    disabled={updatingId === w.id}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(w.id, 'rejected')}
                    disabled={updatingId === w.id}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
              {w.status === 'approved' && (
                <button
                  onClick={() => handleAction(w.id, 'completed')}
                  disabled={updatingId === w.id}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Complete
                </button>
              )}
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
                <th className="text-left px-4 py-3 font-semibold">Driver</th>
                <th className="text-left px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Method</th>
                <th className="text-left px-4 py-3 font-semibold">Account</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Note</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <EmptyState
                      title="No withdrawals found"
                      description={filter !== 'all' || debouncedSearch ? 'Try adjusting your filters or search.' : 'No withdrawal requests yet.'}
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{w.Driver?.User?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{w.Driver?.User?.phone || '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">{formatCurrency(w.amount)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase bg-gray-100 text-gray-700">
                        {w.method}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-gray-900">{w.account_name}</p>
                        <p className="text-xs text-gray-500">{w.account_number}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDateTime(w.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">
                      {w.note || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {w.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(w.id, 'approved')}
                              disabled={updatingId === w.id}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              {updatingId === w.id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleAction(w.id, 'rejected')}
                              disabled={updatingId === w.id}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              {updatingId === w.id ? '...' : 'Reject'}
                            </button>
                          </>
                        )}
                        {w.status === 'approved' && (
                          <button
                            onClick={() => handleAction(w.id, 'completed')}
                            disabled={updatingId === w.id}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {updatingId === w.id ? '...' : 'Complete'}
                          </button>
                        )}
                        {(w.status === 'completed' || w.status === 'rejected') && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
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

      {/* Confirm Dialog with Note */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-semibold text-gray-900">{confirmDialog.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{confirmDialog.message}</p>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-h-[40px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors min-h-[40px] ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : confirmDialog.variant === 'warning'
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalsPage;
