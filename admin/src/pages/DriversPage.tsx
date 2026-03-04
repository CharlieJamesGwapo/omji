import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

const DriversPage: React.FC = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="text-center py-12 text-gray-500">Loading drivers...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="text-gray-500">{drivers.length} registered drivers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map((driver) => (
          <div key={driver.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{driver.User?.name || driver.user?.name || 'Unknown'}</h3>
                <p className="text-sm text-gray-500">{driver.User?.email || driver.user?.email}</p>
                <p className="text-sm text-gray-500">{driver.User?.phone || driver.user?.phone}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${driver.is_verified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {driver.is_verified ? 'Verified' : 'Unverified'}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium text-gray-900 capitalize">{driver.vehicle_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Model</span>
                <span className="font-medium text-gray-900">{driver.vehicle_model}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Plate</span>
                <span className="font-medium text-gray-900">{driver.vehicle_plate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">License</span>
                <span className="font-medium text-gray-900">{driver.license_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Rating</span>
                <span className="font-medium text-amber-600">{(driver.rating || 5).toFixed(1)} ({driver.total_ratings || 0} reviews)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Earnings</span>
                <span className="font-medium text-green-600">P{(driver.total_earnings || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Completed Rides</span>
                <span className="font-medium text-gray-900">{driver.completed_rides || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
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
                  className="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Verify
                </button>
              )}
              <button
                onClick={() => handleDelete(driver.id)}
                className="flex-1 py-2 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {drivers.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl">No drivers registered yet</div>
      )}
    </div>
  );
};

export default DriversPage;
