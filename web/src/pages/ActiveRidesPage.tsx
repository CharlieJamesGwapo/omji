import React, { useEffect, useState } from 'react';
import { rideService } from '../services/api';

const ActiveRidesPage: React.FC = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      const response = await rideService.getActiveRides();
      setRides(response.data || []);
    } catch (error) {
      console.error('Failed to load rides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">My Rides</h1>
      <p className="text-gray-600 mb-8">Track your active rides and history</p>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading rides...</p>
        </div>
      ) : rides.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rides.map((ride) => (
            <div key={ride.id} className="card p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-gray-900">{ride.pickupLocation}</h3>
                <span className="badge badge-success">{ride.status}</span>
              </div>
              <p className="text-gray-600 mb-4">→ {ride.dropoffLocation}</p>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-600">Distance:</span> {ride.distance} km</p>
                <p><span className="text-gray-600">Fare:</span> ₱{ride.estimatedFare}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="text-gray-600 mb-4">No active rides</p>
          <a href="/rides" className="btn-primary">Book a Ride</a>
        </div>
      )}
    </div>
  );
};

export default ActiveRidesPage;
