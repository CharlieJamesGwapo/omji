import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

interface RiderApplication {
  id: number;
  User: {
    name: string;
    email: string;
    phone: string;
  };
  vehicle_type: string;
  vehicle_plate: string;
  license_number: string;
  is_verified: boolean;
  created_at: string;
}

const RiderApprovalPage: React.FC = () => {
  const [riders, setRiders] = useState<RiderApplication[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');
  const [loading, setLoading] = useState(true);
  const [selectedRider, setSelectedRider] = useState<RiderApplication | null>(null);

  useEffect(() => {
    loadRiders();
  }, []);

  const loadRiders = async () => {
    try {
      const response = await adminService.getDrivers();
      setRiders(response.data.data || []);
    } catch (error) {
      console.error('Failed to load riders:', error);
    }
    setLoading(false);
  };

  const handleApprove = async (riderId: number) => {
    if (!confirm('Are you sure you want to approve this rider?')) return;

    try {
      await adminService.verifyDriver(riderId);
      alert('Rider approved successfully!');
      loadRiders();
    } catch (error) {
      alert('Failed to approve rider');
      console.error(error);
    }
  };

  const handleReject = async (riderId: number) => {
    if (!confirm('Are you sure you want to reject this rider application?')) return;

    try {
      await adminService.deleteDriver(riderId);
      alert('Rider application rejected');
      loadRiders();
    } catch (error) {
      alert('Failed to reject rider');
      console.error(error);
    }
  };

  const filteredRiders = riders.filter((rider) => {
    if (filter === 'pending') return !rider.is_verified;
    if (filter === 'approved') return rider.is_verified;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading rider applications...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rider Applications</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({riders.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'pending'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({riders.filter((r) => !r.is_verified).length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'approved'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Approved ({riders.filter((r) => r.is_verified).length})
          </button>
        </div>
      </div>

      {filteredRiders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-gray-400 text-lg">No {filter} rider applications</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredRiders.map((rider) => (
            <div
              key={rider.id}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">
                    {rider.User?.name || 'Unknown'}
                  </h3>
                  <p className="text-sm text-gray-500">{rider.User?.email}</p>
                  <p className="text-sm text-gray-500">{rider.User?.phone}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    rider.is_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {rider.is_verified ? 'Approved' : 'Pending'}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Vehicle Type</p>
                    <p className="font-medium text-gray-900">{rider.vehicle_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Plate Number</p>
                    <p className="font-medium text-gray-900">{rider.vehicle_plate}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">License Number</p>
                    <p className="font-medium text-gray-900">{rider.license_number}</p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-4">
                Applied: {new Date(rider.created_at).toLocaleDateString()}
              </div>

              {!rider.is_verified && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReject(rider.id)}
                    className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(rider.id)}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    Approve
                  </button>
                </div>
              )}

              {rider.is_verified && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedRider(rider)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                  >
                    View Details
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRider && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedRider(null)}
        >
          <div
            className="bg-white rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedRider.User?.name}
                </h2>
                <p className="text-gray-500">{selectedRider.User?.email}</p>
              </div>
              <button
                onClick={() => setSelectedRider(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Vehicle Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Type</p>
                    <p className="font-medium">{selectedRider.vehicle_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Plate</p>
                    <p className="font-medium">{selectedRider.vehicle_plate}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">License Number</p>
                    <p className="font-medium">{selectedRider.license_number}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium">{selectedRider.User?.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{selectedRider.User?.email}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Status</h3>
                <span
                  className={`inline-block px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedRider.is_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {selectedRider.is_verified ? 'Approved' : 'Pending Approval'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderApprovalPage;
