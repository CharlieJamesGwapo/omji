import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Ride } from '../types';
import { ITEMS_PER_PAGE, RIDE_STATUS_OPTIONS } from '../constants';
import { formatStatus, formatCurrency, formatDateTime, formatDate, getErrorMessage } from '../utils';
import { Pagination, ConfirmDialog, StatusBadge, SearchInput, EmptyState, Modal, PageSkeleton } from '../components';

type FilterType = 'all' | 'pending' | 'active' | 'completed' | 'cancelled' | 'scheduled';

const RidesPage: React.FC = () => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [processingScheduled, setProcessingScheduled] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  useEffect(() => {
    loadRides();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filter]);

  const loadRides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getRides();
      setRides(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load rides'));
    }
    setLoading(false);
  }, []);

  const handleStatusUpdate = useCallback((id: number, status: string) => {
    setConfirmDialog({
      open: true,
      title: 'Update Ride Status',
      message: `Change ride #${id} status to "${formatStatus(status)}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setUpdatingId(id);
        try {
          await adminService.updateRideStatus(id, status);
          setRides(prev => prev.map((r) => (r.id === id ? { ...r, status } : r)));
          setSelectedRide(prev => prev && prev.id === id ? { ...prev, status } : prev);
          toast.success(`Ride #${id} updated to ${formatStatus(status)}`);
        } catch (err) {
          toast.error(getErrorMessage(err, 'Failed to update ride status'));
        } finally {
          setUpdatingId(null);
        }
      },
    });
  }, []);

  const handleViewDetails = (ride: Ride) => {
    setSelectedRide(ride);
    setShowModal(true);
  };

  const filtered = useMemo(() => rides.filter((r) => {
    const userName = (r.User?.name || '').toLowerCase();
    const userEmail = (r.User?.email || '').toLowerCase();
    const pickup = (r.pickup_location || '').toLowerCase();
    const dropoff = (r.dropoff_location || '').toLowerCase();
    const driverName = (r.Driver?.User?.name || '').toLowerCase();
    const q = debouncedSearch.toLowerCase();
    const matchesSearch = !q || userName.includes(q) || userEmail.includes(q) || pickup.includes(q) || dropoff.includes(q) || driverName.includes(q);

    let matchesFilter = true;
    if (filter === 'pending') matchesFilter = r.status === 'pending' && !r.scheduled_at;
    else if (filter === 'active') matchesFilter = r.status === 'accepted' || r.status === 'driver_arrived' || r.status === 'in_progress';
    else if (filter === 'completed') matchesFilter = r.status === 'completed';
    else if (filter === 'cancelled') matchesFilter = r.status === 'cancelled';
    else if (filter === 'scheduled') matchesFilter = !!r.scheduled_at && r.status === 'pending';

    return matchesSearch && matchesFilter;
  }), [rides, debouncedSearch, filter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedRides = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => ({
    total: rides.length,
    active: rides.filter((r) => r.status === 'accepted' || r.status === 'driver_arrived' || r.status === 'in_progress').length,
    completed: rides.filter((r) => r.status === 'completed').length,
    cancelled: rides.filter((r) => r.status === 'cancelled').length,
    scheduled: rides.filter((r) => !!r.scheduled_at && r.status === 'pending').length,
    revenue: rides
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + (r.final_fare || r.estimated_fare || 0), 0),
  }), [rides]);

  const handleProcessScheduled = useCallback(async () => {
    setProcessingScheduled(true);
    try {
      const res = await adminService.processScheduledRides();
      const count = res.data.data?.processed_count ?? res.data.processed_count ?? 0;
      toast.success(`Processed ${count} scheduled ride${count !== 1 ? 's' : ''}`);
      await loadRides();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to process scheduled rides'));
    } finally {
      setProcessingScheduled(false);
    }
  }, [loadRides]);

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rides.length },
    { key: 'pending', label: 'Pending', count: rides.filter((r) => r.status === 'pending' && !r.scheduled_at).length },
    { key: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  if (loading) {
    return <PageSkeleton statCards={5} filterButtons={6} tableRows={8} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Rides (Pasundo)</h1>
            <p className="text-gray-500 text-sm mt-1">{stats.total} total rides</p>
          </div>
          <button
            onClick={loadRides}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Refresh rides"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, email, pickup, dropoff..."
          className="w-full sm:w-80"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Rides</div>
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
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
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
        {filter === 'scheduled' && stats.scheduled > 0 && (
          <button
            onClick={handleProcessScheduled}
            disabled={processingScheduled}
            className="flex-shrink-0 ml-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {processingScheduled ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Process Now
              </>
            )}
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginatedRides.length} of {filtered.length} rides</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginatedRides.map((ride) => (
          <div
            key={ride.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4"
            onClick={() => handleViewDetails(ride)}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{ride.User?.name || 'Unknown'}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{ride.id}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{ride.User?.email || 'No email'}</p>
              </div>
              <StatusBadge status={ride.status} />
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                <p className="text-xs text-gray-600 line-clamp-1">{ride.pickup_location || 'N/A'}</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                <p className="text-xs text-gray-600 line-clamp-1">{ride.dropoff_location || 'N/A'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <span className="text-gray-400">Driver</span>
                <p className="font-medium text-gray-900 truncate">{ride.Driver?.User?.name || 'Unassigned'}</p>
              </div>
              <div>
                <span className="text-gray-400">Vehicle</span>
                <p className="font-medium text-gray-900 capitalize">{ride.vehicle_type || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-400">Est. Fare</span>
                <p className="font-medium text-gray-900">{formatCurrency(ride.estimated_fare)}</p>
              </div>
              <div>
                <span className="text-gray-400">Final Fare</span>
                <p className="font-medium text-gray-900">{ride.final_fare ? formatCurrency(ride.final_fare) : '--'}</p>
              </div>
            </div>

            {ride.scheduled_at && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 rounded-lg mb-3">
                <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-blue-700">Scheduled: {formatDateTime(ride.scheduled_at)}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {formatDate(ride.created_at)}
              </span>
              <select
                value={ride.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  handleStatusUpdate(ride.id, e.target.value);
                }}
                disabled={updatingId === ride.id}
                className="text-sm min-h-[44px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {RIDE_STATUS_OPTIONS.map((s) => (
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
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Driver</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Route</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fare</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRides.map((ride) => (
                <tr
                  key={ride.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleViewDetails(ride)}
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">#{ride.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        {(ride.User?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{ride.User?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 truncate">{ride.User?.email || 'No email'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{ride.Driver?.User?.name || 'Unassigned'}</div>
                    {ride.Driver?.vehicle_plate && (
                      <div className="text-xs text-gray-500">{ride.Driver.vehicle_plate}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-[200px]">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center gap-0.5 mt-1 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <div className="w-px h-3 bg-gray-300"></div>
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 truncate">{ride.pickup_location || 'N/A'}</p>
                        <p className="text-xs text-gray-500 truncate mt-1">{ride.dropoff_location || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 capitalize">{ride.vehicle_type || 'N/A'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{formatCurrency(ride.estimated_fare)}</div>
                    {ride.final_fare ? (
                      <div className="text-xs text-green-600 font-medium">Final: {formatCurrency(ride.final_fare)}</div>
                    ) : (
                      <div className="text-xs text-gray-400">No final fare</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={ride.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {formatDate(ride.created_at)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(ride.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {ride.scheduled_at && (
                      <div className="flex items-center gap-1 mt-1">
                        <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs text-blue-600 font-medium">{formatDateTime(ride.scheduled_at)}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={ride.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleStatusUpdate(ride.id, e.target.value);
                      }}
                      disabled={updatingId === ride.id}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {RIDE_STATUS_OPTIONS.map((s) => (
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
            title={search || filter !== 'all' ? 'No rides match your filters' : 'No rides yet'}
            description={search || filter !== 'all' ? 'Try adjusting your search or filters' : undefined}
          />
        )}
      </div>

      {/* Mobile Empty State */}
      {filtered.length === 0 && (
        <div className="sm:hidden">
          <EmptyState
            title={search || filter !== 'all' ? 'No rides match your filters' : 'No rides yet'}
            description={search || filter !== 'all' ? 'Try adjusting your search or filters' : undefined}
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

      {/* Ride Detail Modal */}
      <Modal
        open={showModal && !!selectedRide}
        onClose={() => setShowModal(false)}
        title={`Ride #${selectedRide?.id ?? ''}`}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm text-gray-600 font-medium flex-shrink-0">Update Status:</label>
              <select
                value={selectedRide?.status || ''}
                onChange={(e) => selectedRide && handleStatusUpdate(selectedRide.id, e.target.value)}
                disabled={!selectedRide || updatingId === selectedRide?.id}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {RIDE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedRide && (
          <div className="space-y-4 sm:space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={selectedRide.status} />
              <span className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-gray-100 text-gray-700 capitalize">
                {selectedRide.vehicle_type || 'N/A'}
              </span>
              <span className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-gray-100 text-gray-700 capitalize">
                {selectedRide.payment_method || 'N/A'}
              </span>
            </div>

            {/* User & Driver Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Passenger</div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    {(selectedRide.User?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">{selectedRide.User?.name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500 truncate">{selectedRide.User?.email || 'No email'}</div>
                    <div className="text-xs text-gray-500">{selectedRide.User?.phone || 'No phone'}</div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Driver</div>
                {selectedRide.Driver ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                      {(selectedRide.Driver.User?.name || 'D').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{selectedRide.Driver.User?.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500 capitalize">{selectedRide.Driver.vehicle_type || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{selectedRide.Driver.vehicle_plate || 'N/A'}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No driver assigned</p>
                )}
              </div>
            </div>

            {/* Route */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <div className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Route</div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500 mt-1 flex-shrink-0"></div>
                  <div>
                    <div className="text-xs text-gray-400">Pickup</div>
                    <div className="text-sm font-medium text-gray-900">{selectedRide.pickup_location || 'N/A'}</div>
                    {selectedRide.pickup_latitude && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {selectedRide.pickup_latitude.toFixed(6)}, {selectedRide.pickup_longitude.toFixed(6)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-1.5 border-l-2 border-dashed border-gray-300 h-4"></div>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 mt-1 flex-shrink-0"></div>
                  <div>
                    <div className="text-xs text-gray-400">Dropoff</div>
                    <div className="text-sm font-medium text-gray-900">{selectedRide.dropoff_location || 'N/A'}</div>
                    {selectedRide.dropoff_latitude && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {selectedRide.dropoff_latitude.toFixed(6)}, {selectedRide.dropoff_longitude.toFixed(6)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fare & Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Distance</div>
                <div className="text-sm font-medium text-gray-900">{selectedRide.distance ? `${selectedRide.distance.toFixed(1)} km` : 'N/A'}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Estimated Fare</div>
                <div className="text-sm font-medium text-gray-900">{formatCurrency(selectedRide.estimated_fare)}</div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Final Fare</div>
                <div className="text-sm font-medium text-green-600">
                  {selectedRide.final_fare ? formatCurrency(selectedRide.final_fare) : '--'}
                </div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">User Rating</div>
                <div className="flex items-center gap-1">
                  {selectedRide.user_rating ? (
                    <>
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">{selectedRide.user_rating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">--</span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Driver Rating</div>
                <div className="flex items-center gap-1">
                  {selectedRide.driver_rating ? (
                    <>
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">{selectedRide.driver_rating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">--</span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Payment</div>
                <div className="text-sm font-medium text-gray-900 capitalize">{selectedRide.payment_method || 'N/A'}</div>
              </div>
            </div>

            {/* Reviews */}
            {(selectedRide.user_review || selectedRide.driver_review) && (
              <div className="space-y-3">
                {selectedRide.user_review && (
                  <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-blue-600 font-semibold mb-1">User Review</div>
                    <p className="text-sm text-gray-700">{selectedRide.user_review}</p>
                  </div>
                )}
                {selectedRide.driver_review && (
                  <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-purple-600 font-semibold mb-1">Driver Review</div>
                    <p className="text-sm text-gray-700">{selectedRide.driver_review}</p>
                  </div>
                )}
              </div>
            )}

            {/* Timestamps */}
            <div className={`grid grid-cols-1 ${selectedRide.scheduled_at ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 sm:gap-4`}>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Created</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatDateTime(selectedRide.created_at)}
                </div>
              </div>
              {selectedRide.scheduled_at && (
                <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-blue-600 mb-1 font-semibold">Scheduled For</div>
                  <div className="text-sm font-medium text-blue-900">
                    {formatDateTime(selectedRide.scheduled_at)}
                  </div>
                </div>
              )}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Started</div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedRide.started_at ? formatDateTime(selectedRide.started_at) : '--'}
                </div>
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Completed</div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedRide.completed_at ? formatDateTime(selectedRide.completed_at) : '--'}
                </div>
              </div>
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

export default RidesPage;
