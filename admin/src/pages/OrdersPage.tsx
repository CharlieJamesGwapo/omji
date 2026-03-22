import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import { useDebounce } from '../hooks/useDebounce';
import type { Order } from '../types';
import { ITEMS_PER_PAGE, ORDER_STATUS_OPTIONS } from '../constants';
import { formatStatus, formatCurrency, formatDateTime, parseItems, getErrorMessage } from '../utils';
import { Pagination, ConfirmDialog, StatusBadge, SearchInput, EmptyState, Modal, PageSkeleton } from '../components';

type FilterStatus = 'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  useEffect(() => {
    loadOrders();
  }, []);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterStatus]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getOrders();
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load orders'));
    }
    setLoading(false);
  }, []);

  const handleStatusUpdate = useCallback((id: number, newStatus: string) => {
    setConfirmDialog({
      open: true,
      title: 'Update Order Status',
      message: `Change order #${id} status to "${formatStatus(newStatus)}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setUpdatingId(id);
        try {
          await adminService.updateOrderStatus(id, newStatus);
          setOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
          );
          setSelectedOrder(prev => prev && prev.id === id ? { ...prev, status: newStatus } : prev);
          toast.success(`Order #${id} updated to ${formatStatus(newStatus)}`);
        } catch (err: any) {
          toast.error(getErrorMessage(err, 'Failed to update order status'));
        }
        setUpdatingId(null);
      },
    });
  }, []);

  const filtered = useMemo(() => orders.filter((o) => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return (
        (o.User?.name || '').toLowerCase().includes(q) ||
        (o.Store?.name || '').toLowerCase().includes(q) ||
        (o.delivery_location || '').toLowerCase().includes(q) ||
        String(o.id).includes(q)
      );
    }
    return true;
  }), [orders, filterStatus, debouncedSearch]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    revenue: orders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0),
  }), [orders]);

  const filterButtons: { label: string; value: FilterStatus; count: number }[] = [
    { label: 'All', value: 'all', count: orders.length },
    { label: 'Pending', value: 'pending', count: orders.filter(o => o.status === 'pending').length },
    { label: 'Confirmed', value: 'confirmed', count: orders.filter(o => o.status === 'confirmed').length },
    { label: 'Preparing', value: 'preparing', count: orders.filter(o => o.status === 'preparing').length },
    { label: 'Ready', value: 'ready', count: orders.filter(o => o.status === 'ready').length },
    { label: 'Out for Delivery', value: 'out_for_delivery', count: orders.filter(o => o.status === 'out_for_delivery').length },
    { label: 'Delivered', value: 'delivered', count: stats.delivered },
    { label: 'Cancelled', value: 'cancelled', count: stats.cancelled },
  ];

  if (loading) {
    return <PageSkeleton statCards={5} filterButtons={6} tableRows={8} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-1">{orders.length} total order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={loadOrders}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm sm:text-base font-medium"
        >
          Refresh Orders
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Orders</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.active}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Active</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.delivered}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Delivered</div>
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

      {/* Filters & Search */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilterStatus(btn.value)}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                filterStatus === btn.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {btn.label} ({btn.count})
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by user, store, location, or order ID..."
          className="w-full sm:w-96"
        />
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginated.length} of {filtered.length} orders</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginated.map((order) => {
          const items = parseItems(order.items);
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">#{order.id}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(order.created_at)}</p>
                </div>
                <span className="text-sm font-bold text-gray-900 flex-shrink-0">{formatCurrency(order.total_amount)}</span>
              </div>

              {/* User & Store */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                    {order.User?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{order.User?.name || 'N/A'}</p>
                    <p className="text-[10px] text-gray-400 truncate">{order.User?.email || ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{order.Store?.name || 'N/A'}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{order.Store?.category || ''}</p>
                  </div>
                </div>
              </div>

              {/* Items & Totals */}
              <div className="bg-gray-50 rounded-lg p-2.5 mb-3 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  <span>{order.payment_method || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-gray-500 mt-1">
                  <span>Subtotal: {formatCurrency(order.subtotal)}</span>
                  <span>Fee: {formatCurrency(order.delivery_fee)}</span>
                </div>
              </div>

              {/* Status Update */}
              <div className="mb-3">
                <select
                  value={order.status}
                  onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                  disabled={updatingId === order.id}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50"
                  aria-label={`Update status for order #${order.id}`}
                >
                  {ORDER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {formatStatus(s)}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Details */}
              <button
                onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                className="w-full px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-colors"
              >
                View Details
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <EmptyState
              title="No orders found"
              description="Try adjusting your filters."
            />
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Store</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((order) => {
                const items = parseItems(order.items);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">#{order.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {order.User?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{order.User?.name || 'N/A'}</div>
                          <div className="text-xs text-gray-500 truncate">{order.User?.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{order.Store?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500 capitalize">{order.Store?.category || ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{items.length} item{items.length !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-gray-500">Sub: {formatCurrency(order.subtotal)} + {formatCurrency(order.delivery_fee)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total_amount)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 capitalize">{order.payment_method || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 whitespace-nowrap">{formatDateTime(order.created_at)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                          disabled={updatingId === order.id}
                          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50 cursor-pointer"
                          aria-label={`Update status for order #${order.id}`}
                        >
                          {ORDER_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {formatStatus(s)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                          aria-label={`View details for order #${order.id}`}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            title="No orders found"
            description="Try adjusting your filters."
          />
        )}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {/* Order Detail Modal */}
      <Modal
        open={showModal && selectedOrder !== null}
        onClose={() => setShowModal(false)}
        title={selectedOrder ? `Order #${selectedOrder.id}` : ''}
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-4 sm:space-y-6">
            {/* Status Badge & Update */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <StatusBadge status={selectedOrder.status} />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-sm text-gray-500 flex-shrink-0">Update:</label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleStatusUpdate(selectedOrder.id, e.target.value)}
                  disabled={updatingId === selectedOrder.id}
                  className="flex-1 sm:flex-initial px-3 py-2 border-2 border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50"
                  aria-label="Update order status"
                >
                  {ORDER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {formatStatus(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer & Store Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Customer</div>
                <div className="text-sm font-semibold text-gray-900">{selectedOrder.User?.name || 'N/A'}</div>
                <div className="text-xs text-gray-500 mt-0.5">{selectedOrder.User?.email || 'No email'}</div>
                <div className="text-xs text-gray-500 mt-0.5">{selectedOrder.User?.phone || 'No phone'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Store</div>
                <div className="text-sm font-semibold text-gray-900">{selectedOrder.Store?.name || 'N/A'}</div>
                <div className="text-xs text-gray-500 mt-0.5 capitalize">{selectedOrder.Store?.category || ''}</div>
                <div className="text-xs text-gray-500 mt-0.5">{selectedOrder.Store?.address || ''}</div>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Items</div>
              {(() => {
                const items = parseItems(selectedOrder.items);
                if (items.length === 0) {
                  return <p className="text-sm text-gray-500">No items data available</p>;
                }
                return (
                  <div className="space-y-2">
                    {items.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-900">{item.name || item.product_name || `Item ${idx + 1}`}</span>
                          {item.quantity && (
                            <span className="text-xs text-gray-500 ml-2">x{item.quantity}</span>
                          )}
                        </div>
                        {(item.price || item.total) && (
                          <span className="text-sm font-medium text-gray-700 flex-shrink-0 ml-2">
                            {formatCurrency(item.total || (item.price || 0) * (item.quantity || 1))}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Pricing Breakdown */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Pricing</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.delivery_fee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="text-gray-900">{formatCurrency(selectedOrder.tax)}</span>
                </div>
                <div className="border-t border-gray-200 my-2" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-red-600">{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Extra Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Payment Method</div>
                <div className="text-sm font-medium text-gray-900 capitalize">{selectedOrder.payment_method || 'N/A'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Delivery Location</div>
                <div className="text-sm font-medium text-gray-900 break-all">{selectedOrder.delivery_location || 'N/A'}</div>
              </div>
              {selectedOrder.user_rating != null && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">User Rating</div>
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm font-bold text-gray-900">{selectedOrder.user_rating}</span>
                  </div>
                </div>
              )}
              {selectedOrder.store_rating != null && (
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Store Rating</div>
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm font-bold text-gray-900">{selectedOrder.store_rating}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base"
              >
                Close
              </button>
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

export default OrdersPage;
