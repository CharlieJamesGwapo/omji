import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Delivery } from '../types';
import { ITEMS_PER_PAGE, DELIVERY_STATUS_OPTIONS } from '../constants';
import { formatStatus, formatCurrency, formatDateTime, formatDate, getErrorMessage, getStatusColor } from '../utils';
import { Pagination, ConfirmDialog, StatusBadge, SearchInput, EmptyState, Modal, PageSkeleton } from '../components';

type FilterStatus = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

const DeliveriesPage: React.FC = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  useEffect(() => {
    loadDeliveries();
  }, []);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterStatus]);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getDeliveries();
      setDeliveries(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load deliveries'));
    }
    setLoading(false);
  }, []);

  const handleStatusUpdate = useCallback((id: number, status: string) => {
    setConfirmDialog({
      open: true,
      title: 'Update Delivery Status',
      message: `Change delivery #${id} status to "${formatStatus(status)}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setUpdatingId(id);
        try {
          await adminService.updateDeliveryStatus(id, status);
          setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status } : d));
          setSelectedDelivery(prev => prev && prev.id === id ? { ...prev, status } : prev);
          toast.success(`Delivery #${id} updated to ${formatStatus(status)}`);
        } catch (err) {
          toast.error(getErrorMessage(err, 'Failed to update delivery status'));
        }
        setUpdatingId(null);
      },
    });
  }, []);

  const filtered = useMemo(() => deliveries.filter((d) => {
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? ['accepted', 'driver_arrived', 'picked_up', 'in_progress'].includes(d.status) : d.status === filterStatus);
    const q = debouncedSearch.toLowerCase();
    const matchesSearch =
      !q ||
      (d.User?.name || '').toLowerCase().includes(q) ||
      (d.item_description || '').toLowerCase().includes(q) ||
      (d.pickup_location || '').toLowerCase().includes(q) ||
      (d.dropoff_location || '').toLowerCase().includes(q) ||
      (d.Driver?.User?.name || '').toLowerCase().includes(q) ||
      String(d.id).includes(q);
    return matchesStatus && matchesSearch;
  }), [deliveries, filterStatus, debouncedSearch]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => ({
    total: deliveries.length,
    active: deliveries.filter(d => ['accepted', 'driver_arrived', 'picked_up', 'in_progress'].includes(d.status)).length,
    completed: deliveries.filter(d => d.status === 'completed').length,
    cancelled: deliveries.filter(d => d.status === 'cancelled').length,
    revenue: deliveries
      .filter(d => d.status === 'completed')
      .reduce((sum, d) => sum + (d.delivery_fee || 0), 0),
  }), [deliveries]);

  const filterButtons: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: deliveries.length },
    { key: 'pending', label: 'Pending', count: deliveries.filter(d => d.status === 'pending').length },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  if (loading) {
    return <PageSkeleton statCards={5} filterButtons={5} tableRows={8} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Pasugo Deliveries</h1>
            <p className="text-gray-500 text-sm mt-1">{stats.total} total deliveries</p>
          </div>
          <button
            onClick={loadDeliveries}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Refresh deliveries"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, item, location..."
          className="w-full sm:w-80"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Deliveries</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.active}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Active</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.completed}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Completed</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.cancelled}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Cancelled</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCurrency(stats.revenue)}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Revenue</div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilterStatus(btn.key)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              filterStatus === btn.key
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {btn.label} ({btn.count})
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginated.length} of {filtered.length} deliveries</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginated.map((delivery) => (
          <div
            key={delivery.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4"
            onClick={() => { setSelectedDelivery(delivery); setShowModal(true); }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                {delivery.item_photo ? (
                  <img
                    src={delivery.item_photo}
                    alt="Item"
                    className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{delivery.item_description || 'No description'}</h3>
                  <p className="text-xs text-gray-500 truncate">{delivery.User?.name || 'Unknown User'}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-gray-400">#{delivery.id}</span>
                <StatusBadge status={delivery.status} />
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-start gap-2 text-xs">
                <span className="text-green-500 font-bold mt-0.5">A</span>
                <span className="text-gray-600 truncate">{delivery.pickup_location || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="text-red-500 font-bold mt-0.5">B</span>
                <span className="text-gray-600 truncate">{delivery.dropoff_location || 'N/A'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{delivery.weight ? `${delivery.weight}kg` : '--'}</span>
                <span className="text-gray-500">{delivery.distance ? `${delivery.distance}km` : '--'}</span>
              </div>
              <span className="font-bold text-red-600">{formatCurrency(delivery.delivery_fee)}</span>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{delivery.Driver?.User?.name || 'Unassigned'}</span>
              <select
                value={delivery.status}
                onChange={(e) => { e.stopPropagation(); handleStatusUpdate(delivery.id, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                disabled={updatingId === delivery.id}
                className="text-sm min-h-[44px] px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:opacity-50"
              >
                {DELIVERY_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Driver</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Route</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((delivery) => (
                <tr
                  key={delivery.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => { setSelectedDelivery(delivery); setShowModal(true); }}
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">#{delivery.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {delivery.item_photo ? (
                        <img
                          src={delivery.item_photo}
                          alt="Item"
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{delivery.item_description || 'No description'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{delivery.User?.name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">{delivery.User?.email || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{delivery.Driver?.User?.name || 'Unassigned'}</div>
                    {delivery.Driver && (
                      <div className="text-xs text-gray-500">{delivery.Driver.vehicle_plate}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1 max-w-[200px]">
                      <div className="flex items-start gap-1.5 text-xs">
                        <span className="text-green-500 font-bold mt-0.5 flex-shrink-0">A</span>
                        <span className="text-gray-600 truncate">{delivery.pickup_location || 'N/A'}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs">
                        <span className="text-red-500 font-bold mt-0.5 flex-shrink-0">B</span>
                        <span className="text-gray-600 truncate">{delivery.dropoff_location || 'N/A'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-600">
                      {delivery.weight ? `${delivery.weight}kg` : '--'} / {delivery.distance ? `${delivery.distance}km` : '--'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-red-600">{formatCurrency(delivery.delivery_fee)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={delivery.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(delivery.created_at)}
                    </span>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={delivery.status}
                      onChange={(e) => handleStatusUpdate(delivery.id, e.target.value)}
                      disabled={updatingId === delivery.id}
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:opacity-50"
                    >
                      {DELIVERY_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{formatStatus(s)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <EmptyState
            title="No deliveries found"
            description={search || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'No deliveries have been created yet'}
          />
        )}
      </div>

      {/* Mobile Empty State */}
      {filtered.length === 0 && (
        <div className="sm:hidden">
          <EmptyState
            title="No deliveries found"
            description={search || filterStatus !== 'all' ? 'Try adjusting your filters' : 'No deliveries have been created yet'}
          />
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {/* Delivery Detail Modal */}
      <Modal
        open={showModal && !!selectedDelivery}
        onClose={() => setShowModal(false)}
        title={`Delivery #${selectedDelivery?.id ?? ''}`}
        size="lg"
        footer={
          <div className="space-y-4">
            <div>
              <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Update Status</div>
              <div className="flex gap-2 flex-wrap">
                {DELIVERY_STATUS_OPTIONS.map((s) => {
                  const config = getStatusColor(s);
                  const isActive = selectedDelivery?.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => selectedDelivery && handleStatusUpdate(selectedDelivery.id, s)}
                      disabled={!selectedDelivery || updatingId === selectedDelivery?.id || isActive}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : `${config.bg} ${config.text} hover:opacity-80`
                      }`}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="w-full px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedDelivery && (
          <div className="space-y-4 sm:space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={selectedDelivery.status} />
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
                {selectedDelivery.payment_method || 'N/A'}
              </span>
            </div>

            {/* Item Photo */}
            {selectedDelivery.item_photo && (
              <div>
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Item Photo</div>
                <img
                  src={selectedDelivery.item_photo}
                  alt="Delivery item"
                  className="w-full max-h-64 object-contain rounded-lg bg-gray-50 border border-gray-200"
                />
              </div>
            )}

            {/* Item Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg sm:col-span-2">
                <div className="text-xs text-gray-500 mb-1">Item Description</div>
                <div className="text-sm font-medium text-gray-900">{selectedDelivery.item_description || 'No description'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Weight</div>
                <div className="text-sm font-medium text-gray-900">{selectedDelivery.weight ? `${selectedDelivery.weight} kg` : 'N/A'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Distance</div>
                <div className="text-sm font-medium text-gray-900">{selectedDelivery.distance ? `${selectedDelivery.distance} km` : 'N/A'}</div>
              </div>
            </div>

            {/* Route */}
            <div>
              <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Route</div>
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">A</div>
                  <div>
                    <div className="text-xs text-gray-500">Pickup</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDelivery.pickup_location || 'N/A'}</div>
                  </div>
                </div>
                <div className="ml-3 border-l-2 border-dashed border-gray-300 h-4"></div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">B</div>
                  <div>
                    <div className="text-xs text-gray-500">Dropoff</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDelivery.dropoff_location || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer & Driver */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Customer</div>
                <div className="text-sm font-medium text-gray-900">{selectedDelivery.User?.name || 'Unknown'}</div>
                <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.User?.email || 'N/A'}</div>
                <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.User?.phone || 'N/A'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Driver</div>
                {selectedDelivery.Driver ? (
                  <>
                    <div className="text-sm font-medium text-gray-900">{selectedDelivery.Driver.User?.name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500 mt-0.5 capitalize">{selectedDelivery.Driver.vehicle_type || 'N/A'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.Driver.vehicle_plate || 'N/A'}</div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic">Unassigned</div>
                )}
              </div>
            </div>

            {/* Financial Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Delivery Fee</div>
                <div className="text-sm font-bold text-red-600">{formatCurrency(selectedDelivery.delivery_fee)}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Tip</div>
                <div className="text-sm font-medium text-gray-900">{formatCurrency(selectedDelivery.tip)}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg col-span-2 sm:col-span-1">
                <div className="text-xs text-gray-500 mb-1">Payment Method</div>
                <div className="text-sm font-medium text-gray-900 capitalize">{selectedDelivery.payment_method || 'N/A'}</div>
              </div>
            </div>

            {/* Extra Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {selectedDelivery.barcode_number && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Barcode Number</div>
                  <div className="text-sm font-medium text-gray-900 font-mono">{selectedDelivery.barcode_number}</div>
                </div>
              )}
              {selectedDelivery.notes && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg sm:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Notes</div>
                  <div className="text-sm text-gray-900">{selectedDelivery.notes}</div>
                </div>
              )}
              {selectedDelivery.started_at && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Started At</div>
                  <div className="text-sm font-medium text-gray-900">{formatDateTime(selectedDelivery.started_at)}</div>
                </div>
              )}
              {selectedDelivery.completed_at && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Completed At</div>
                  <div className="text-sm font-medium text-gray-900">{formatDateTime(selectedDelivery.completed_at)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant="warning"
        confirmLabel="Update"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default DeliveriesPage;
