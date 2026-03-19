import React, { useEffect, useState } from 'react';
import { driverService } from '../services/api';

const DriverPage: React.FC = () => {
  const [isDriver, setIsDriver] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [earnings, setEarnings] = useState({ daily: 0, total: 0 });
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    loadDriverInfo();
  }, []);

  const loadDriverInfo = async () => {
    try {
      const [earningsRes, requestsRes] = await Promise.all([
        driverService.getEarnings(),
        driverService.getRequests(),
      ]).catch(() => [{ data: {} }, { data: [] }]);

      setEarnings(earningsRes.data);
      setRequests(requestsRes.data);
      setIsDriver(true);
    } catch (error) {
      console.error('Not a driver account');
    }
  };

  const handleToggleAvailability = async () => {
    try {
      await driverService.getEarnings(); // Just for testing
      setIsAvailable(!isAvailable);
    } catch (error) {
      console.error('Failed to update availability');
    }
  };

  if (!isDriver) {
    return (
      <div className="container py-8">
        <div className="card p-12 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Become a Driver</h2>
          <p className="text-gray-600 mb-6">Earn money driving on your own schedule</p>
          <button className="btn-primary">Start as Driver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Driver Dashboard</h1>
        <button
          onClick={handleToggleAvailability}
          className={`px-6 py-2 rounded-lg text-white font-medium transition ${
            isAvailable ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'
          }`}
        >
          {isAvailable ? 'Online' : 'Offline'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card p-6">
          <p className="text-gray-600 text-sm mb-2">Today's Earnings</p>
          <p className="text-3xl font-bold text-green-600">₱{earnings.daily?.toFixed(2) || '0'}</p>
        </div>
        <div className="card p-6">
          <p className="text-gray-600 text-sm mb-2">Total Earnings</p>
          <p className="text-3xl font-bold text-gray-900">₱{earnings.total?.toFixed(2) || '0'}</p>
        </div>
      </div>

      {/* Requests */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">New Requests</h2>
        {requests.length > 0 ? (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-gray-900">{request.user?.name}</h3>
                  <span className="badge badge-success">⭐ {request.user?.rating}</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  📍 {request.pickupLocation} → {request.dropoffLocation}
                </p>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg text-gray-900">₱{request.estimatedFare}</span>
                  <button className="btn-primary">Accept</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-8">No new requests</p>
        )}
      </div>
    </div>
  );
};

export default DriverPage;
