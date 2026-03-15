import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface RiderApplication {
  id: number;
  user_id: number;
  User: {
    id: number;
    name: string;
    email: string;
    phone: string;
    profile_image?: string;
  };
  vehicle_type: string;
  vehicle_model: string;
  vehicle_plate: string;
  license_number: string;
  is_verified: boolean;
  is_available: boolean;
  rating: number;
  total_ratings: number;
  completed_rides: number;
  total_earnings: number;
  documents: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

const DOC_LABELS: Record<string, string> = {
  profile_photo: 'Profile Photo',
  license_photo: "Driver's License",
  orcr_photo: 'OR/CR Document',
  id_photo: 'Valid Government ID',
};

const getDocuments = (rider: RiderApplication): Record<string, string> => {
  if (!rider.documents) return {};
  if (typeof rider.documents === 'string') {
    try { return JSON.parse(rider.documents); } catch { return {}; }
  }
  return rider.documents;
};

const getDocCount = (rider: RiderApplication): number => {
  return Object.keys(getDocuments(rider)).length;
};

const RiderApprovalPage: React.FC = () => {
  const [riders, setRiders] = useState<RiderApplication[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderApplication | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRiders();
  }, []);

  const loadRiders = async () => {
    try {
      const response = await adminService.getDrivers();
      setRiders(response.data.data || []);
    } catch (error) {
      console.error('Failed to load riders:', error);
      toast.error('Failed to load rider applications');
    }
    setLoading(false);
  };

  const handleApprove = async (riderId: number) => {
    if (!confirm('Are you sure you want to approve this rider? They will gain access to the Rider Dashboard and can start accepting rides.')) return;

    setActionLoading(true);
    try {
      await adminService.verifyDriver(riderId);
      toast.success('Rider approved successfully! Their account is now active.');
      loadRiders();
      setSelectedRider(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to approve rider');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (riderId: number) => {
    if (!confirm('Are you sure you want to reject this rider application? This will permanently delete their application.')) return;

    setActionLoading(true);
    try {
      await adminService.deleteDriver(riderId);
      toast.success('Rider application rejected');
      loadRiders();
      setSelectedRider(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to reject rider');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = riders.filter((r) => !r.is_verified).length;
  const approvedCount = riders.filter((r) => r.is_verified).length;

  const filteredRiders = riders.filter((rider) => {
    if (filter === 'pending' && rider.is_verified) return false;
    if (filter === 'approved' && !rider.is_verified) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (rider.User?.name || '').toLowerCase().includes(s) ||
        (rider.User?.email || '').toLowerCase().includes(s) ||
        (rider.User?.phone || '').toLowerCase().includes(s) ||
        (rider.vehicle_plate || '').toLowerCase().includes(s)
      );
    }
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
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Rider Applications</h1>
          <p className="text-sm text-gray-500 mt-1">Review and verify rider documents before approval</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search name, email, phone, plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-4 py-2.5 min-h-[44px] border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm"
          />
          <button
            onClick={loadRiders}
            className="flex-shrink-0 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Summary Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <p className="text-gray-500 text-xs sm:text-sm font-medium">Pending Review</p>
          <p className="text-gray-900 text-xl sm:text-2xl font-bold mt-1">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <p className="text-gray-500 text-xs sm:text-sm font-medium">Verified</p>
          <p className="text-gray-900 text-xl sm:text-2xl font-bold mt-1">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <p className="text-gray-500 text-xs sm:text-sm font-medium">Total</p>
          <p className="text-gray-900 text-xl sm:text-2xl font-bold mt-1">{riders.length}</p>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['all', 'pending', 'approved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `All (${riders.length})` : f === 'pending' ? `Pending (${pendingCount})` : `Approved (${approvedCount})`}
          </button>
        ))}
      </div>

      {/* Rider Cards or Empty State */}
      {filteredRiders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-12 text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-gray-400 text-base sm:text-lg font-medium">
            No {filter === 'all' ? '' : filter} rider applications
          </p>
          <p className="text-gray-300 text-sm mt-1">
            {filter === 'pending' ? 'All caught up! No pending applications to review.' : filter === 'approved' ? 'No approved riders yet.' : 'No rider applications found.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {filteredRiders.map((rider) => {
            const docs = getDocuments(rider);
            const docCount = Object.keys(docs).length;
            return (
              <div
                key={rider.id}
                className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                {/* Header row */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {docs.profile_photo ? (
                      <img
                        src={docs.profile_photo}
                        alt="Profile"
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100" rx="50"/><text x="50" y="58" font-size="36" text-anchor="middle" fill="%239ca3af">?</text></svg>'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 font-bold text-lg">{rider.User?.name?.charAt(0) || '?'}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">{rider.User?.name || 'Unknown'}</h3>
                      <p className="text-xs text-gray-500 truncate">{rider.User?.email}</p>
                      <p className="text-xs text-gray-500">{rider.User?.phone}</p>
                    </div>
                  </div>
                  <span className={`ml-2 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                    rider.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {rider.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>

                {/* Vehicle & License Info */}
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Vehicle Type</p>
                      <p className="font-medium text-gray-900 text-sm capitalize">{rider.vehicle_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Plate Number</p>
                      <p className="font-medium text-gray-900 text-sm">{rider.vehicle_plate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Vehicle Model</p>
                      <p className="font-medium text-gray-900 text-sm">{rider.vehicle_model || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">License Number</p>
                      <p className="font-medium text-gray-900 text-sm">{rider.license_number}</p>
                    </div>
                  </div>
                </div>

                {/* Document Thumbnails */}
                {docCount > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Uploaded Documents ({docCount}/4)</p>
                    <div className="flex gap-2 overflow-x-auto">
                      {Object.entries(docs).map(([key, url]) => (
                        <div key={key} className="flex-shrink-0">
                          <button
                            onClick={() => { setSelectedRider(rider); }}
                            className="group relative"
                            title={DOC_LABELS[key] || key}
                          >
                            <img
                              src={url}
                              alt={DOC_LABELS[key] || key}
                              className="w-20 h-14 object-cover rounded-lg border border-gray-200 group-hover:border-gray-400 transition-colors"
                              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75"><rect fill="%23f3f4f6" width="100" height="75"/><text x="50" y="42" font-size="10" text-anchor="middle" fill="%239ca3af">No img</text></svg>'; }}
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-all flex items-center justify-center">
                              <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                            </div>
                          </button>
                          <p className="text-xs text-gray-400 mt-0.5 text-center truncate w-20">{DOC_LABELS[key]?.split(' ')[0] || key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {docCount === 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      No documents uploaded
                    </p>
                  </div>
                )}

                {/* Applied date */}
                <div className="text-xs text-gray-400 mb-4">
                  Applied: {new Date(rider.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedRider(rider)}
                    className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Review
                  </button>
                  {!rider.is_verified && (
                    <>
                      <button
                        onClick={() => handleReject(rider.id)}
                        disabled={actionLoading}
                        className="px-4 py-2.5 min-h-[44px] bg-red-50 text-red-600 rounded-lg hover:bg-red-100 active:bg-red-200 font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(rider.id)}
                        disabled={actionLoading}
                        className="px-4 py-2.5 min-h-[44px] bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Detail Modal */}
      {selectedRider && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setSelectedRider(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-3xl max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 sm:px-6 py-4 rounded-t-2xl sm:rounded-t-xl z-10">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {(() => {
                    const docs = getDocuments(selectedRider);
                    return docs.profile_photo ? (
                      <img src={docs.profile_photo} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-500 font-bold">{selectedRider.User?.name?.charAt(0) || '?'}</span>
                      </div>
                    );
                  })()}
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">{selectedRider.User?.name}</h2>
                    <p className="text-sm text-gray-500">Application Review</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedRider.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedRider.is_verified ? 'Verified' : 'Pending Review'}
                  </span>
                  <button
                    onClick={() => setSelectedRider(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Personal Information */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Full Name</p>
                    <p className="font-medium text-sm text-gray-900">{selectedRider.User?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">User ID</p>
                    <p className="font-medium text-sm text-gray-900">#{selectedRider.user_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone Number</p>
                    <p className="font-medium text-sm text-gray-900">{selectedRider.User?.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email Address</p>
                    <p className="font-medium text-sm text-gray-900 break-all">{selectedRider.User?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Application Date</p>
                    <p className="font-medium text-sm text-gray-900">
                      {new Date(selectedRider.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Driver ID</p>
                    <p className="font-medium text-sm text-gray-900">#{selectedRider.id}</p>
                  </div>
                </div>
              </div>

              {/* Vehicle Information */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Vehicle Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Vehicle Type</p>
                    <p className="font-medium text-sm text-gray-900 capitalize">{selectedRider.vehicle_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Plate Number</p>
                    <p className="font-medium text-sm text-gray-900 font-mono">{selectedRider.vehicle_plate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Vehicle Model</p>
                    <p className="font-medium text-sm text-gray-900">{selectedRider.vehicle_model || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">License Number</p>
                    <p className="font-medium text-sm text-gray-900 font-mono">{selectedRider.license_number}</p>
                  </div>
                </div>
              </div>

              {/* Performance (for verified riders) */}
              {selectedRider.is_verified && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Performance
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900">{selectedRider.completed_rides || 0}</p>
                      <p className="text-xs text-gray-500">Completed</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900">{selectedRider.rating?.toFixed(1) || '5.0'}</p>
                      <p className="text-xs text-gray-500">Rating</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-gray-900">₱{(selectedRider.total_earnings || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Earnings</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className={`text-lg font-bold ${selectedRider.is_available ? 'text-green-600' : 'text-gray-400'}`}>
                        {selectedRider.is_available ? 'Online' : 'Offline'}
                      </p>
                      <p className="text-xs text-gray-500">Status</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Uploaded Documents */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Uploaded Documents
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    ({getDocCount(selectedRider)}/4 uploaded)
                  </span>
                </h3>

                {getDocCount(selectedRider) === 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                    <svg className="w-10 h-10 text-red-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-600 font-medium text-sm">No documents were uploaded</p>
                    <p className="text-red-400 text-xs mt-1">This application should NOT be approved without documents</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['profile_photo', 'license_photo', 'orcr_photo', 'id_photo'] as const).map((docKey) => {
                      const docs = getDocuments(selectedRider);
                      const url = docs[docKey];
                      return (
                        <div key={docKey} className={`rounded-xl border-2 overflow-hidden ${url ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50'}`}>
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700">{DOC_LABELS[docKey]}</span>
                            {url ? (
                              <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Uploaded</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Missing</span>
                            )}
                          </div>
                          {url ? (
                            <button
                              onClick={() => setLightboxImage(url)}
                              className="w-full cursor-pointer hover:opacity-90 transition-opacity relative group"
                            >
                              <img
                                src={url}
                                alt={DOC_LABELS[docKey]}
                                className="w-full h-44 object-cover"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 176"><rect fill="%23f3f4f6" width="200" height="176"/><text x="100" y="88" font-size="14" text-anchor="middle" fill="%239ca3af">Failed to load</text></svg>';
                                  img.className = 'w-full h-44 object-contain bg-gray-50';
                                }}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                                <div className="bg-white bg-opacity-90 rounded-lg px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-sm font-medium text-gray-700">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                  </svg>
                                  Click to enlarge
                                </div>
                              </div>
                            </button>
                          ) : (
                            <div className="h-44 flex flex-col items-center justify-center text-gray-400">
                              <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-xs">Not provided</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Security Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-amber-800">Verification Checklist</p>
                    <ul className="text-xs text-amber-700 mt-1.5 space-y-1">
                      <li>• Verify the profile photo matches the ID photo</li>
                      <li>• Confirm the license number matches the uploaded license document</li>
                      <li>• Check that the OR/CR matches the declared vehicle plate number</li>
                      <li>• Ensure the valid ID is a government-issued document (not a selfie)</li>
                      <li>• Verify plate number format is valid</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {!selectedRider.is_verified && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleReject(selectedRider.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-3 min-h-[44px] bg-red-50 text-red-600 rounded-xl hover:bg-red-100 active:bg-red-200 font-semibold transition-colors text-sm border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject Application
                  </button>
                  <button
                    onClick={() => handleApprove(selectedRider.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-3 min-h-[44px] bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 font-semibold transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Approve & Verify Rider
                  </button>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <div className="p-5 pt-0 sm:hidden">
              <button
                onClick={() => setSelectedRider(null)}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white bg-opacity-20 rounded-full text-white hover:bg-opacity-40 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxImage}
            alt="Document preview"
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default RiderApprovalPage;
