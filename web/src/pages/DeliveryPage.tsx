import React, { useState } from 'react';
import { deliveryService } from '../services/api';
import toast from 'react-hot-toast';

const DeliveryPage: React.FC = () => {
  const [formData, setFormData] = useState({
    pickupLocation: '',
    dropoffLocation: '',
    itemDescription: '',
    weight: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await deliveryService.createDelivery(formData);
      toast.success('Delivery request created!');
      setFormData({ pickupLocation: '', dropoffLocation: '', itemDescription: '', weight: '' });
    } catch (error) {
      toast.error('Failed to create delivery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Send Items (Pasugo)</h1>
      <p className="text-gray-600 mb-8">Fast and secure delivery service</p>

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
                  placeholder="Where to pick up?"
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
                  placeholder="Where to deliver?"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Description
                </label>
                <textarea
                  name="itemDescription"
                  value={formData.itemDescription}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Describe the item"
                  rows={4}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="0"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 text-lg"
              >
                {loading ? 'Creating...' : 'Request Delivery'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card p-6 bg-orange-50">
            <h3 className="font-bold text-gray-900 mb-4">Pricing</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Base fare</span>
                <span className="font-bold">₱50</span>
              </div>
              <div className="flex justify-between">
                <span>Per km</span>
                <span className="font-bold">₱15</span>
              </div>
              <div className="flex justify-between">
                <span>Weight surcharge</span>
                <span className="font-bold">₱5/kg</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryPage;
