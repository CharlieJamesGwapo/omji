import React, { useEffect, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';

interface RideUser {
  name: string;
  email: string;
  phone: string;
}

interface RideDriver {
  User: { name: string };
  vehicle_type: string;
  vehicle_plate: string;
}

interface Ride {
  id: number;
  user_id: number;
  driver_id: number | null;
  pickup_location: string;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_location: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  distance: number;
  estimated_fare: number;
  final_fare: number;
  status: string;
  vehicle_type: string;
  payment_method: string;
  user_rating: number | null;
  driver_rating: number | null;
  user_review: string | null;
  driver_review: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  User: RideUser;
  Driver: RideDriver | null;
}

type FilterType = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

const ITEMS_PER_PAGE = 20;

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-blue-100 text-blue-700',
  driver_arrived: 'bg-cyan-100 text-cyan-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const RidesPage: React.FC = () => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadRides();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const loadRides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getRides();
      setRides(res.data.data || []);
    } catch (err) {
      console.error('Failed to load rides:', err);
      toast.error('Failed to load rides');
    }
    setLoading(false);
  }, []);

  const handleStatusUpdate = useCallback(async (id: number, status: string) => {
    if (!window.confirm(`Change ride #${id} status to "${status}"?`)) return;
    setUpdatingId(id);
    try {
      await adminService.updateRideStatus(id, status);
      setRides(prev => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      setSelectedRide(prev => prev && prev.id === id ? { ...prev, status } : prev);
      toast.success(`Ride #${id} updated to ${status.replace(/_/g, ' ')}`);
    } catch {
      toast.error('Failed to update ride status');
    } finally {
      setUpdatingId(null);
    }
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
    const q = search.toLowerCase();
    const matchesSearch = !q || userName.includes(q) || userEmail.includes(q) || pickup.includes(q) || dropoff.includes(q) || driverName.includes(q);

    let matchesFilter = true;
    if (filter === 'pending') matchesFilter = r.status === 'pending';
    else if (filter === 'active') matchesFilter = r.status === 'accepted' || r.status === 'driver_arrived' || r.status === 'in_progress';
    else if (filter === 'completed') matchesFilter = r.status === 'completed';
    else if (filter === 'cancelled') matchesFilter = r.status === 'cancelled';

    return matchesSearch && matchesFilter;
  }), [rides, search, filter]);

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
    revenue: rides
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + (r.final_fare || r.estimated_fare || 0), 0),
  }), [rides]);

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rides.length },
    { key: 'pending', label: 'Pending', count: rides.filter((r) => r.status === 'pending').length },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-full sm:w-80 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 sm:h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Filter skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
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
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Rides (Pasundo)</h1>
            <p className="text-gray-500 text-sm mt-1">{stats.total} total rides</p>
          </div>
          <button
            onClick={loadRides}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh rides"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, pickup, dropoff..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Rides</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.active}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Active</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.completed}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Completed</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.cancelled}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Cancelled</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-gray-900">₱{stats.revenue.toLocaleString()}</div>
          <div className="text-gray-500 text-xs sm:text-sm mt-1">Total Revenue</div>
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
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {fb.label} ({fb.count})
          </button>
        ))}
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
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${statusColors[ride.status] || 'bg-gray-100 text-gray-700'}`}>
                {statusLabel(ride.status)}
              </span>
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
                <p className="font-medium text-gray-900">P{(ride.estimated_fare || 0).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-400">Final Fare</span>
                <p className="font-medium text-gray-900">{ride.final_fare ? `P${ride.final_fare.toLocaleString()}` : '--'}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {new Date(ride.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <select
                value={ride.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  handleStatusUpdate(ride.id, e.target.value);
                }}
                disabled={updatingId === ride.id}
                className="text-sm min-h-[44px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="driver_arrived">Driver Arrived</option>
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
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Driver</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Route</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Vehicle</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Fare</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
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
                    <div className="text-sm font-medium text-gray-900">P{(ride.estimated_fare || 0).toLocaleString()}</div>
                    {ride.final_fare ? (
                      <div className="text-xs text-green-600 font-medium">Final: P{ride.final_fare.toLocaleString()}</div>
                    ) : (
                      <div className="text-xs text-gray-400">No final fare</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusColors[ride.status] || 'bg-gray-100 text-gray-700'}`}>
                      {statusLabel(ride.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {new Date(ride.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(ride.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
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
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="driver_arrived">Driver Arrived</option>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-gray-400 text-lg">
              {search || filter !== 'all' ? 'No rides match your filters' : 'No rides yet'}
            </p>
          </div>
        )}
      </div>

      {/* Mobile Empty State */}
      {filtered.length === 0 && (
        <div className="sm:hidden text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-gray-400 text-lg">
            {search || filter !== 'all' ? 'No rides match your filters' : 'No rides yet'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                      className={`w-10 h-10 text-sm font-medium rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-red-600 text-white'
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
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Ride Detail Modal */}
      {showModal && selectedRide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Ride #{selectedRide.id}</h2>
                  <p className="text-gray-500 text-xs sm:text-sm mt-1">
                    {new Date(selectedRide.created_at).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg transition-colors flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
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
                <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${statusColors[selectedRide.status] || 'bg-gray-100 text-gray-700'}`}>
                  {statusLabel(selectedRide.status)}
                </span>
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
                  <div className="text-sm font-medium text-gray-900">P{(selectedRide.estimated_fare || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Final Fare</div>
                  <div className="text-sm font-medium text-green-600">
                    {selectedRide.final_fare ? `P${selectedRide.final_fare.toLocaleString()}` : '--'}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Created</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(selectedRide.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Started</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedRide.started_at
                      ? new Date(selectedRide.started_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })
                      : '--'}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Completed</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedRide.completed_at
                      ? new Date(selectedRide.completed_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })
                      : '--'}
                  </div>
                </div>
              </div>

              {/* Update Status & Close */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm text-gray-600 font-medium flex-shrink-0">Update Status:</label>
                  <select
                    value={selectedRide.status}
                    onChange={(e) => handleStatusUpdate(selectedRide.id, e.target.value)}
                    disabled={updatingId === selectedRide.id}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="driver_arrived">Driver Arrived</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base"
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

export default RidesPage;
