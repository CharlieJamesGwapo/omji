import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';

interface DeliveryUser {
  name: string;
  email: string;
  phone: string;
}

interface DeliveryDriver {
  User: { name: string };
  vehicle_type: string;
  vehicle_plate: string;
}

interface Delivery {
  id: number;
  user_id: number;
  driver_id: number | null;
  pickup_location: string;
  dropoff_location: string;
  item_description: string;
  item_photo: string;
  notes: string;
  weight: number;
  distance: number;
  delivery_fee: number;
  tip: number;
  status: string;
  payment_method: string;
  barcode_number: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  User: DeliveryUser;
  Driver: DeliveryDriver | null;
}

type FilterStatus = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

const ITEMS_PER_PAGE = 20;

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
  accepted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Accepted' },
  driver_arrived: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Driver Arrived' },
  picked_up: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Picked Up' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'In Progress' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
};

const DeliveriesPage: React.FC = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadDeliveries();
  }, []);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus]);

  const loadDeliveries = async () => {
    setLoading(true);
    try {
      const res = await adminService.getDeliveries();
      setDeliveries(res.data.data || []);
    } catch (err) {
      console.error('Failed to load deliveries:', err);
    }
    setLoading(false);
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      await adminService.updateDeliveryStatus(id, status);
      setDeliveries(deliveries.map(d => d.id === id ? { ...d, status } : d));
      if (selectedDelivery?.id === id) {
        setSelectedDelivery({ ...selectedDelivery, status });
      }
    } catch {
      toast.error('Failed to update delivery status');
    }
    setUpdatingId(null);
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return (
      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const filtered = deliveries.filter((d) => {
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? ['accepted', 'driver_arrived', 'picked_up', 'in_progress'].includes(d.status) : d.status === filterStatus);
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (d.User?.name || '').toLowerCase().includes(q) ||
      (d.item_description || '').toLowerCase().includes(q) ||
      (d.pickup_location || '').toLowerCase().includes(q) ||
      (d.dropoff_location || '').toLowerCase().includes(q) ||
      (d.Driver?.User?.name || '').toLowerCase().includes(q) ||
      String(d.id).includes(q);
    return matchesStatus && matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = {
    total: deliveries.length,
    active: deliveries.filter(d => ['accepted', 'driver_arrived', 'picked_up', 'in_progress'].includes(d.status)).length,
    completed: deliveries.filter(d => d.status === 'completed').length,
    cancelled: deliveries.filter(d => d.status === 'cancelled').length,
    revenue: deliveries
      .filter(d => d.status === 'completed')
      .reduce((sum, d) => sum + (d.delivery_fee || 0), 0),
  };

  const filterButtons: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: deliveries.length },
    { key: 'pending', label: 'Pending', count: deliveries.filter(d => d.status === 'pending').length },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-full sm:w-80 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 sm:h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
              <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Pasugo Deliveries</h1>
          <p className="text-gray-500 text-sm mt-1">{stats.total} total deliveries</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, item, location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.total}</div>
          <div className="text-blue-100 text-xs sm:text-sm mt-1">Total Deliveries</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.active}</div>
          <div className="text-purple-100 text-xs sm:text-sm mt-1">Active</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.completed}</div>
          <div className="text-green-100 text-xs sm:text-sm mt-1">Completed</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.cancelled}</div>
          <div className="text-red-100 text-xs sm:text-sm mt-1">Cancelled</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-6 text-white shadow-lg col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold">P{stats.revenue.toLocaleString()}</div>
          <div className="text-orange-100 text-xs sm:text-sm mt-1">Total Revenue</div>
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
                ? 'bg-red-600 text-white shadow-md shadow-red-600/25'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
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
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
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
                  <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
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
                {getStatusBadge(delivery.status)}
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
              <span className="font-bold text-red-600">P{(delivery.delivery_fee || 0).toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{delivery.Driver?.User?.name || 'Unassigned'}</span>
              <select
                value={delivery.status}
                onChange={(e) => { e.stopPropagation(); handleStatusUpdate(delivery.id, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                disabled={updatingId === delivery.id}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none disabled:opacity-50"
              >
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="driver_arrived">Driver Arrived</option>
                <option value="picked_up">Picked Up</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Item</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Driver</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Route</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fee</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
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
                        <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
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
                    <div className="text-xs text-gray-500">{delivery.User?.email || ''}</div>
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
                    <span className="text-sm font-bold text-red-600">P{(delivery.delivery_fee || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(delivery.status)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(delivery.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={delivery.status}
                      onChange={(e) => handleStatusUpdate(delivery.id, e.target.value)}
                      disabled={updatingId === delivery.id}
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none disabled:opacity-50"
                    >
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="driver_arrived">Driver Arrived</option>
                      <option value="picked_up">Picked Up</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-400 text-lg">No deliveries found</p>
          </div>
        )}
      </div>

      {/* Mobile Empty State */}
      {filtered.length === 0 && (
        <div className="sm:hidden text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-gray-400 text-lg font-medium">No deliveries found</p>
          <p className="text-gray-300 text-sm mt-1">
            {search || filterStatus !== 'all' ? 'Try adjusting your filters' : 'No deliveries have been created yet'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .map((page, idx, arr) => {
                const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                return (
                  <React.Fragment key={page}>
                    {showEllipsis && (
                      <span className="px-2 py-1 text-sm text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Delivery Detail Modal */}
      {showModal && selectedDelivery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 sm:p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold text-white truncate">Delivery #{selectedDelivery.id}</h2>
                  <p className="text-red-100 text-xs sm:text-sm mt-1">
                    {formatDate(selectedDelivery.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-white hover:bg-red-500/30 p-2 rounded-lg transition-colors flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-3 flex-wrap">
                {getStatusBadge(selectedDelivery.status)}
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
                  <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.User?.email || ''}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.User?.phone || ''}</div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Driver</div>
                  {selectedDelivery.Driver ? (
                    <>
                      <div className="text-sm font-medium text-gray-900">{selectedDelivery.Driver.User?.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500 mt-0.5 capitalize">{selectedDelivery.Driver.vehicle_type || ''}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{selectedDelivery.Driver.vehicle_plate || ''}</div>
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
                  <div className="text-sm font-bold text-red-600">P{(selectedDelivery.delivery_fee || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Tip</div>
                  <div className="text-sm font-medium text-gray-900">P{(selectedDelivery.tip || 0).toLocaleString()}</div>
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
                    <div className="text-sm font-medium text-gray-900">{formatDate(selectedDelivery.started_at)}</div>
                  </div>
                )}
                {selectedDelivery.completed_at && (
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Completed At</div>
                    <div className="text-sm font-medium text-gray-900">{formatDate(selectedDelivery.completed_at)}</div>
                  </div>
                )}
              </div>

              {/* Update Status */}
              <div className="pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Update Status</div>
                <div className="flex gap-2 flex-wrap">
                  {['pending', 'accepted', 'driver_arrived', 'picked_up', 'in_progress', 'completed', 'cancelled'].map((s) => {
                    const config = statusConfig[s];
                    const isActive = selectedDelivery.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusUpdate(selectedDelivery.id, s)}
                        disabled={updatingId === selectedDelivery.id || isActive}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                          isActive
                            ? 'bg-red-600 text-white shadow-md'
                            : `${config.bg} ${config.text} hover:opacity-80`
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveriesPage;
