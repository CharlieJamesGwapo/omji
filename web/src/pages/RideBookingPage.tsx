import React, { useState } from 'react';
import { rideService } from '../services/api';
import toast from 'react-hot-toast';

const RideBookingPage: React.FC = () => {
  const [formData, setFormData] = useState({
    pickupLocation: '',
    dropoffLocation: '',
    vehicleType: 'car',
  });
  const [loading, setLoading] = useState(false);
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await rideService.createRide(formData);
      toast.success('Ride booked successfully!');
      setFormData({ pickupLocation: '', dropoffLocation: '', vehicleType: 'car' });
      setEstimatedFare(null);
    } catch (error) {
      toast.error('Failed to book ride');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Book a Ride</h1>
      <p className="text-gray-600 mb-8">Get to your destination safely and affordably</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pickup Location
                </label>
                <input
                  type="text"
                  name="pickupLocation"
                  value={formData.pickupLocation}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Where are you now?"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dropoff Location
                </label>
                <input
                  type="text"
                  name="dropoffLocation"
                  value={formData.dropoffLocation}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Where are you going?"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle Type
                </label>
                <select
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  className="input-field"
                  disabled={loading}
                >
                  <option value="motorcycle">🏍️ Motorcycle (₱25/km)</option>
                  <option value="car">🚗 Car (₱40/km)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 text-lg"
              >
                {loading ? 'Booking...' : 'Book Ride Now'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card p-6 bg-blue-50">
            <h3 className="font-bold text-gray-900 mb-4">How It Works</h3>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">1</span>
                <span>Enter your pickup and dropoff locations</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">2</span>
                <span>Choose vehicle type and confirm</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">3</span>
                <span>Driver will arrive in minutes</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">4</span>
                <span>Enjoy your ride and rate driver</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideBookingPage;
