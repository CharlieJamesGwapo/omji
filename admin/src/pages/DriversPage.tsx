import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

const DriversPage: React.FC = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    try {
      const res = await adminService.getDrivers();
      setDrivers(res.data.data || []);
    } catch (err) {
      console.error('Failed to load drivers:', err);
    }
    setLoading(false);
  };

  const handleVerify = async (id: number) => {
    try {
      await adminService.verifyDriver(id);
      setDrivers(drivers.map(d => d.id === id ? { ...d, is_verified: true } : d));
    } catch (err) {
      alert('Failed to verify driver');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this driver?')) return;
    try {
      await adminService.deleteDriver(id);
      setDrivers(drivers.filter(d => d.id !== id));
    } catch (err) {
      alert('Failed to delete driver');
    }
  };

  const filtered = drivers.filter((d) => {
    const name = (d.User?.name || d.user?.name || '').toLowerCase();
    const email = (d.User?.email || d.user?.email || '').toLowerCase();
    const phone = (d.User?.phone || d.user?.phone || '');
    const plate = (d.vehicle_plate || '').toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q) || plate.includes(q);
  });

  const stats = {
    total: drivers.length,
    verified: drivers.filter((d) => d.is_verified).length,
    pending: drivers.filter((d) => !d.is_verified).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading drivers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-500 text-sm mt-1">{stats.total} registered drivers</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, phone, plate..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.total}</div>
          <div className="text-blue-100 text-xs sm:text-sm mt-1">Total Drivers</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.verified}</div>
          <div className="text-green-100 text-xs sm:text-sm mt-1">Verified</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 sm:p-6 text-white shadow-lg col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold">{stats.pending}</div>
          <div className="text-red-100 text-xs sm:text-sm mt-1">Pending</div>
        </div>
      </div>

      {/* Driver Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filtered.map((driver) => (
          <div key={driver.id} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base flex-shrink-0">
                  {(driver.User?.name || driver.user?.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{driver.User?.name || driver.user?.name || 'Unknown'}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 truncate">{driver.User?.email || driver.user?.email}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{driver.User?.phone || driver.user?.phone}</p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ml-2 ${driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {driver.is_verified ? 'Verified' : 'Unverified'}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium text-gray-900 capitalize">{driver.vehicle_type}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Model</span>
                <span className="font-medium text-gray-900">{driver.vehicle_model}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Plate</span>
                <span className="font-medium text-gray-900">{driver.vehicle_plate}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">License</span>
                <span className="font-medium text-gray-900">{driver.license_number}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Rating</span>
                <span className="font-medium text-amber-600">{(driver.rating || 5).toFixed(1)} ({driver.total_ratings || 0} reviews)</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Earnings</span>
                <span className="font-medium text-green-600">P{(driver.total_earnings || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Completed Rides</span>
                <span className="font-medium text-gray-900">{driver.completed_rides || 0}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium ${driver.is_available ? 'text-green-600' : 'text-gray-400'}`}>
                  {driver.is_available ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {!driver.is_verified && (
                <button
                  onClick={() => handleVerify(driver.id)}
                  className="flex-1 py-2.5 sm:py-2 min-h-[44px] bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors font-medium"
                >
                  Verify
                </button>
              )}
              <button
                onClick={() => handleDelete(driver.id)}
                className="flex-1 py-2.5 sm:py-2 min-h-[44px] bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 sm:py-16 bg-white rounded-xl shadow-sm border border-gray-100">
          <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-400 text-base sm:text-lg">
            {search ? 'No drivers match your search' : 'No drivers registered yet'}
          </p>
        </div>
      )}
    </div>
  );
};

export default DriversPage;
