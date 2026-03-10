import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface Driver {
  id: number;
  user_id: number;
  vehicle_type: string;
  vehicle_model: string;
  vehicle_plate: string;
  license_number: string;
  is_verified: boolean;
  is_available: boolean;
  current_latitude: number;
  current_longitude: number;
  total_earnings: number;
  completed_rides: number;
  rating: number;
  total_ratings: number;
  created_at: string;
  updated_at: string;
  User?: {
    id: number;
    name: string;
    email: string;
    phone: string;
    profile_image: string;
    is_verified: boolean;
    role: string;
    rating: number;
    created_at: string;
  };
}

type FilterType = 'all' | 'online' | 'offline' | 'verified' | 'pending';

const ITEMS_PER_PAGE = 20;

const DriversPage: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState({
    vehicle_type: '',
    vehicle_model: '',
    vehicle_plate: '',
    license_number: '',
    is_available: false,
    is_verified: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const res = await adminService.getDrivers();
      setDrivers(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load drivers:', err);
      toast.error('Failed to load drivers. Please check your connection.');
    }
    setLoading(false);
  };

  const handleVerify = async (id: number) => {
    try {
      await adminService.verifyDriver(id);
      setDrivers(drivers.map(d => d.id === id ? { ...d, is_verified: true } : d));
      if (selectedDriver && selectedDriver.id === id) {
        setSelectedDriver({ ...selectedDriver, is_verified: true });
      }
      toast.success('Driver verified successfully!');
    } catch (err) {
      toast.error('Failed to verify driver');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete driver "${name}"? This action cannot be undone.`)) return;
    try {
      await adminService.deleteDriver(id);
      setDrivers(drivers.filter(d => d.id !== id));
      if (showDetailModal && selectedDriver?.id === id) {
        setShowDetailModal(false);
        setSelectedDriver(null);
      }
      toast.success('Driver deleted successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete driver');
    }
  };

  const handleOpenEdit = (driver: Driver) => {
    setEditDriver(driver);
    setEditForm({
      vehicle_type: driver.vehicle_type || 'motorcycle',
      vehicle_model: driver.vehicle_model || '',
      vehicle_plate: driver.vehicle_plate || '',
      license_number: driver.license_number || '',
      is_available: driver.is_available || false,
      is_verified: driver.is_verified || false,
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDriver) return;
    setSaving(true);
    try {
      await adminService.updateDriver(editDriver.id, editForm);
      setDrivers(drivers.map(d =>
        d.id === editDriver.id
          ? { ...d, ...editForm }
          : d
      ));
      if (selectedDriver && selectedDriver.id === editDriver.id) {
        setSelectedDriver({ ...selectedDriver, ...editForm });
      }
      setShowEditModal(false);
      setEditDriver(null);
      toast.success('Driver updated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update driver');
    } finally {
      setSaving(false);
    }
  };

  const handleViewDetails = (driver: Driver) => {
    setSelectedDriver(driver);
    setShowDetailModal(true);
  };

  // Filtering
  const filtered = drivers.filter((d) => {
    const name = (d.User?.name || '').toLowerCase();
    const email = (d.User?.email || '').toLowerCase();
    const phone = (d.User?.phone || '');
    const plate = (d.vehicle_plate || '').toLowerCase();
    const license = (d.license_number || '').toLowerCase();
    const q = search.toLowerCase();
    const matchesSearch = !q || name.includes(q) || email.includes(q) || phone.includes(q) || plate.includes(q) || license.includes(q);

    let matchesFilter = true;
    if (filter === 'online') matchesFilter = d.is_available === true;
    else if (filter === 'offline') matchesFilter = d.is_available === false;
    else if (filter === 'verified') matchesFilter = d.is_verified === true;
    else if (filter === 'pending') matchesFilter = d.is_verified === false;

    return matchesSearch && matchesFilter;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Stats
  const stats = {
    total: drivers.length,
    verified: drivers.filter(d => d.is_verified).length,
    pending: drivers.filter(d => !d.is_verified).length,
    online: drivers.filter(d => d.is_available).length,
  };

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'online', label: 'Online', count: stats.online },
    { key: 'offline', label: 'Offline', count: stats.total - stats.online },
    { key: 'verified', label: 'Verified', count: stats.verified },
    { key: 'pending', label: 'Pending', count: stats.pending },
  ];

  // Loading skeleton
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
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
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Driver Management</h1>
          <p className="text-gray-500 text-sm mt-1">{stats.total} registered drivers</p>
        </div>
        <div className="relative w-full sm:w-80">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search name, email, phone, plate, license..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Drivers */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Total Drivers</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        {/* Verified */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Verified</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.verified}</p>
            </div>
          </div>
        </div>

        {/* Pending Approval */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Pending Approval</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
          </div>
        </div>

        {/* Online Now */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 relative">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Online Now</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.online}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === fb.key
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {fb.label} ({fb.count})
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {paginated.length} of {filtered.length} drivers</span>
        {totalPages > 1 && (
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {paginated.map((driver) => (
          <div
            key={driver.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            {/* Header row */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {(driver.User?.name || 'D').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{driver.User?.name || 'Unknown'}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{driver.id}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{driver.User?.email || 'No email'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{driver.User?.phone || 'No phone'}</p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {driver.is_verified ? 'Verified' : 'Pending'}
              </span>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 ${driver.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${driver.is_available ? 'bg-green-500' : 'bg-gray-400'}`} />
                {driver.is_available ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Vehicle info */}
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {driver.vehicle_type === 'car' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10 M17 16V11a1 1 0 00-.4-.8l-4-3A1 1 0 0012 7H3" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  )}
                </svg>
                <span className="text-xs font-medium text-gray-700 capitalize">{driver.vehicle_type || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Model</span>
                  <p className="font-medium text-gray-700 truncate">{driver.vehicle_model || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-400">Plate</span>
                  <p className="font-medium text-gray-700">{driver.vehicle_plate || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-0.5">
                  <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-bold text-gray-900">{(driver.rating || 0).toFixed(1)}</span>
                </div>
                <span className="text-gray-400">Rating</span>
              </div>
              <div className="text-center">
                <p className="font-bold text-green-600">P{(driver.total_earnings || 0).toLocaleString()}</p>
                <span className="text-gray-400">Earnings</span>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-900">{driver.completed_rides || 0}</p>
                <span className="text-gray-400">Rides</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleViewDetails(driver)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-lg transition-colors"
              >
                View
              </button>
              <button
                onClick={() => handleOpenEdit(driver)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors"
              >
                Edit
              </button>
              {!driver.is_verified && (
                <button
                  onClick={() => handleVerify(driver.id)}
                  className="flex-1 px-3 py-2.5 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 active:bg-green-200 rounded-lg transition-colors"
                >
                  Verify
                </button>
              )}
              <button
                onClick={() => handleDelete(driver.id, driver.User?.name || 'Unknown')}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {/* Mobile empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-400 text-lg">
              {search || filter !== 'all' ? 'No drivers match your filters' : 'No drivers registered yet'}
            </p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Driver</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Vehicle</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">License</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Rating</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Earnings</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Rides</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((driver) => (
                <tr
                  key={driver.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                        {(driver.User?.name || 'D').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{driver.User?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 truncate">{driver.User?.email || 'No email'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{driver.User?.phone || 'No phone'}</div>
                    <div className="text-xs text-gray-500">ID: #{driver.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {driver.vehicle_type === 'car' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10 M17 16V11a1 1 0 00-.4-.8l-4-3A1 1 0 0012 7H3" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        )}
                      </svg>
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 capitalize">{driver.vehicle_type || 'N/A'}</div>
                        <div className="text-xs text-gray-500 truncate">{driver.vehicle_model || 'N/A'} - {driver.vehicle_plate || 'N/A'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{driver.license_number || 'N/A'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full w-fit ${driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {driver.is_verified ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                        )}
                        {driver.is_verified ? 'Verified' : 'Pending'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full w-fit ${driver.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${driver.is_available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        {driver.is_available ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">{(driver.rating || 0).toFixed(1)}</span>
                      <span className="text-xs text-gray-400">({driver.total_ratings || 0})</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-green-600">P{(driver.total_earnings || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">{driver.completed_rides || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleViewDetails(driver)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View details"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleOpenEdit(driver)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit driver"
                      >
                        Edit
                      </button>
                      {!driver.is_verified ? (
                        <button
                          onClick={() => handleVerify(driver.id)}
                          className="px-2.5 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Verify driver"
                        >
                          Verify
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenEdit(driver)}
                          className="px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Unverify driver via edit"
                        >
                          Unverify
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(driver.id, driver.User?.name || 'Unknown')}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete driver"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Desktop empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-400 text-lg">
              {search || filter !== 'all' ? 'No drivers match your filters' : 'No drivers registered yet'}
            </p>
          </div>
        )}
      </div>

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

      {/* ==================== DETAIL MODAL ==================== */}
      {showDetailModal && selectedDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 sm:p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center text-red-600 text-xl sm:text-2xl font-bold flex-shrink-0">
                    {(selectedDriver.User?.name || 'D').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{selectedDriver.User?.name || 'Unknown Driver'}</h2>
                    <p className="text-red-100 text-xs sm:text-sm">Driver #{selectedDriver.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
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
              {/* Status Badges */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${selectedDriver.is_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {selectedDriver.is_verified ? 'Verified Driver' : 'Pending Verification'}
                </span>
                <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 ${selectedDriver.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${selectedDriver.is_available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  {selectedDriver.is_available ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Driver Information */}
              <div>
                <div className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Driver Information</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Full Name</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDriver.User?.name || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Email Address</div>
                    <div className="text-sm font-medium text-gray-900 break-all">{selectedDriver.User?.email || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Phone Number</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDriver.User?.phone || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Role</div>
                    <div className="text-sm font-medium text-gray-900 capitalize">{selectedDriver.User?.role || 'driver'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg col-span-1 sm:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Joined Date</div>
                    <div className="text-sm font-medium text-gray-900">
                      {selectedDriver.User?.created_at
                        ? new Date(selectedDriver.User.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                        : new Date(selectedDriver.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Information */}
              <div>
                <div className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Vehicle Information</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Vehicle Type</div>
                    <div className="text-sm font-medium text-gray-900 capitalize">{selectedDriver.vehicle_type || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Vehicle Model</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDriver.vehicle_model || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Vehicle Plate</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDriver.vehicle_plate || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">License Number</div>
                    <div className="text-sm font-medium text-gray-900">{selectedDriver.license_number || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div>
                <div className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Performance</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Rating</div>
                    <div className="flex items-center gap-1">
                      <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-bold text-gray-900">{(selectedDriver.rating || 0).toFixed(1)}</span>
                      <span className="text-xs text-gray-500">({selectedDriver.total_ratings || 0} ratings)</span>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Completed Rides</div>
                    <div className="text-sm font-bold text-gray-900">{selectedDriver.completed_rides || 0}</div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Total Earnings</div>
                    <div className="text-sm font-bold text-green-600">P{(selectedDriver.total_earnings || 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleOpenEdit(selectedDriver);
                  }}
                  className="flex-1 px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Driver
                </button>
                {!selectedDriver.is_verified && (
                  <button
                    onClick={() => {
                      handleVerify(selectedDriver.id);
                    }}
                    className="flex-1 px-4 sm:px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 active:bg-green-800 transition-colors text-sm sm:text-base"
                  >
                    Verify Driver
                  </button>
                )}
                <button
                  onClick={() => {
                    handleDelete(selectedDriver.id, selectedDriver.User?.name || 'Unknown');
                  }}
                  className="flex-1 px-4 sm:px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 active:bg-red-800 transition-colors text-sm sm:text-base"
                >
                  Delete Driver
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="flex-1 px-4 sm:px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm sm:text-base"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT MODAL ==================== */}
      {showEditModal && editDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Edit Modal Header */}
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Edit Driver</h2>
                  <p className="text-sm text-gray-500 mt-1">{editDriver.User?.name || 'Unknown'} - #{editDriver.id}</p>
                </div>
                <button
                  onClick={() => { setShowEditModal(false); setEditDriver(null); }}
                  className="text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors p-1 -m-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Vehicle Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle Type</label>
                <select
                  value={editForm.vehicle_type}
                  onChange={(e) => setEditForm({ ...editForm, vehicle_type: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base bg-white"
                >
                  <option value="motorcycle">Motorcycle</option>
                  <option value="car">Car</option>
                </select>
              </div>

              {/* Vehicle Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle Model</label>
                <input
                  type="text"
                  value={editForm.vehicle_model}
                  onChange={(e) => setEditForm({ ...editForm, vehicle_model: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base"
                  placeholder="e.g. Honda Click 160"
                />
              </div>

              {/* Vehicle Plate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle Plate</label>
                <input
                  type="text"
                  value={editForm.vehicle_plate}
                  onChange={(e) => setEditForm({ ...editForm, vehicle_plate: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base"
                  placeholder="e.g. ABC 1234"
                />
              </div>

              {/* License Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">License Number</label>
                <input
                  type="text"
                  value={editForm.license_number}
                  onChange={(e) => setEditForm({ ...editForm, license_number: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base"
                  placeholder="e.g. N01-12-345678"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-4 pt-2">
                {/* Is Available Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Available / Online</label>
                    <p className="text-xs text-gray-500 mt-0.5">Toggle driver's online status</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_available: !editForm.is_available })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editForm.is_available ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        editForm.is_available ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Is Verified Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Verified</label>
                    <p className="text-xs text-gray-500 mt-0.5">Toggle driver's verification status</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_verified: !editForm.is_verified })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editForm.is_verified ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        editForm.is_verified ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditDriver(null); }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-600/30 text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriversPage;
