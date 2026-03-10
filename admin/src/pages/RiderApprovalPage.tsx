import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

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
      toast.success('Rider approved successfully!');
      loadRiders();
    } catch (error) {
      toast.error('Failed to approve rider');
      console.error(error);
    }
  };

  const handleReject = async (riderId: number) => {
    if (!confirm('Are you sure you want to reject this rider application?')) return;

    try {
      await adminService.deleteDriver(riderId);
      toast.success('Rider application rejected');
      loadRiders();
    } catch (error) {
      toast.error('Failed to reject rider');
      console.error(error);
    }
  };

  const pendingCount = riders.filter((r) => !r.is_verified).length;
  const approvedCount = riders.filter((r) => r.is_verified).length;

  const filteredRiders = riders.filter((rider) => {
    if (filter === 'pending') return !rider.is_verified;
    if (filter === 'approved') return rider.is_verified;
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-red-600 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading rider applications...</p>
      </div>
    );
  }

  return (
    <div className="px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Rider Applications</h1>
      </div>

      {/* Stat Summary Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-red-100 text-xs sm:text-sm font-medium">Pending</p>
          <p className="text-white text-xl sm:text-2xl font-bold mt-1">{pendingCount}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-green-100 text-xs sm:text-sm font-medium">Approved</p>
          <p className="text-white text-xl sm:text-2xl font-bold mt-1">{approvedCount}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-600 to-gray-700 rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-gray-200 text-xs sm:text-sm font-medium">Total</p>
          <p className="text-white text-xl sm:text-2xl font-bold mt-1">{riders.length}</p>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({riders.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'pending'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('approved')}
          className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'approved'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Approved ({approvedCount})
        </button>
      </div>

      {/* Rider Cards or Empty State */}
      {filteredRiders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-12 text-center">
          <div className="flex justify-center mb-4">
            <svg
              className="w-16 h-16 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <p className="text-gray-400 text-base sm:text-lg font-medium">
            No {filter === 'all' ? '' : filter} rider applications
          </p>
          <p className="text-gray-300 text-sm mt-1">
            {filter === 'pending'
              ? 'All caught up! No pending applications to review.'
              : filter === 'approved'
              ? 'No approved riders yet.'
              : 'No rider applications found.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {filteredRiders.map((rider) => (
            <div
              key={rider.id}
              className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                    {rider.User?.name || 'Unknown'}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">{rider.User?.email}</p>
                  <p className="text-sm text-gray-500">{rider.User?.phone}</p>
                </div>
                <span
                  className={`ml-2 flex-shrink-0 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium ${
                    rider.is_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {rider.is_verified ? 'Approved' : 'Pending'}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Vehicle Type</p>
                    <p className="font-medium text-gray-900 text-sm sm:text-base">
                      {rider.vehicle_type}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Plate Number</p>
                    <p className="font-medium text-gray-900 text-sm sm:text-base">
                      {rider.vehicle_plate}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">License Number</p>
                    <p className="font-medium text-gray-900 text-sm sm:text-base">
                      {rider.license_number}
                    </p>
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
                    className="flex-1 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 active:bg-red-200 font-medium transition-colors text-sm sm:text-base"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(rider.id)}
                    className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 font-medium transition-colors text-sm sm:text-base"
                  >
                    Approve
                  </button>
                </div>
              )}

              {rider.is_verified && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedRider(rider)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 font-medium transition-colors text-sm sm:text-base"
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50"
          onClick={() => setSelectedRider(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl p-5 sm:p-8 w-full sm:max-w-2xl sm:mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-5 sm:mb-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {selectedRider.User?.name}
                </h2>
                <p className="text-gray-500 text-sm sm:text-base truncate">
                  {selectedRider.User?.email}
                </p>
              </div>
              <button
                onClick={() => setSelectedRider(null)}
                className="ml-3 flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">
                  Vehicle Information
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Type</p>
                    <p className="font-medium text-sm sm:text-base">{selectedRider.vehicle_type}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Plate</p>
                    <p className="font-medium text-sm sm:text-base">
                      {selectedRider.vehicle_plate}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs sm:text-sm text-gray-500">License Number</p>
                    <p className="font-medium text-sm sm:text-base">
                      {selectedRider.license_number}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">
                  Contact Information
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Phone</p>
                    <p className="font-medium text-sm sm:text-base">
                      {selectedRider.User?.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Email</p>
                    <p className="font-medium text-sm sm:text-base break-all">
                      {selectedRider.User?.email}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">
                  Status
                </h3>
                <span
                  className={`inline-block px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
                    selectedRider.is_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {selectedRider.is_verified ? 'Approved' : 'Pending Approval'}
                </span>
              </div>
            </div>

            {/* Mobile close button at bottom for easier thumb reach */}
            <button
              onClick={() => setSelectedRider(null)}
              className="mt-5 w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors sm:hidden"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderApprovalPage;
