import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_verified: boolean;
  rating: number;
  created_at: string;
  profile_image?: string;
}

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminService.getUsers();
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      alert('Failed to load users. Please check your connection.');
    }
    setLoading(false);
  };

  const handleViewDetails = async (userId: number) => {
    try {
      const res = await adminService.getUserById(userId);
      setSelectedUser(res.data.data);
      setShowModal(true);
    } catch (err) {
      alert('Failed to load user details');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete user "${name}"? This action cannot be undone.`)) return;
    try {
      await adminService.deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
      alert('User deleted successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const filtered = users.filter((u) =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || '').includes(search)
  );

  const stats = {
    total: users.length,
    verified: users.filter((u) => u.is_verified).length,
    admins: users.filter((u) => u.role === 'admin').length,
    drivers: users.filter((u) => u.role === 'driver').length,
    regular: users.filter((u) => u.role === 'user').length,
  };

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700';
      case 'driver':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Users Management</h1>
          <p className="text-gray-500 text-sm mt-1">{stats.total} total users</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.total}</div>
          <div className="text-blue-100 text-xs sm:text-sm mt-1">Total Users</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.verified}</div>
          <div className="text-green-100 text-xs sm:text-sm mt-1">Verified</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.admins}</div>
          <div className="text-purple-100 text-xs sm:text-sm mt-1">Admins</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-6 text-white shadow-lg">
          <div className="text-2xl sm:text-3xl font-bold">{stats.drivers}</div>
          <div className="text-orange-100 text-xs sm:text-sm mt-1">Drivers</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 sm:p-6 text-white shadow-lg col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold">{stats.regular}</div>
          <div className="text-red-100 text-xs sm:text-sm mt-1">Regular Users</div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {filtered.map((user) => (
          <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{user.name || 'N/A'}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{user.id}</span>
                </div>

                <div className="text-xs text-gray-500 truncate mt-0.5">{user.email || 'No email'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{user.phone || 'No phone'}</div>

                {/* Badges */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeClasses(user.role)}`}>
                    {user.role}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                      user.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {user.is_verified ? 'Verified' : 'Pending'}
                  </span>
                  <div className="flex items-center gap-0.5 ml-auto">
                    <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-xs font-medium text-gray-700">{(user.rating || 5).toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleViewDetails(user.id)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-lg transition-colors"
              >
                View Details
              </button>
              <button
                onClick={() => handleDelete(user.id, user.name)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-gray-400 text-lg">No users found</p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block -mx-0 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Rating</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">#{user.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.name || 'N/A'}</div>
                        <div className="text-xs text-gray-500">User ID: {user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{user.email || 'No email'}</div>
                    <div className="text-xs text-gray-500">{user.phone || 'No phone'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getRoleBadgeClasses(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        user.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {user.is_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">{(user.rating || 5).toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(user.id)}
                        className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDelete(user.id, user.name)}
                        className="px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-gray-400 text-lg">No users found</p>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 sm:p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center text-red-600 text-xl sm:text-2xl font-bold flex-shrink-0">
                    {selectedUser.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{selectedUser.name}</h2>
                    <p className="text-red-100 text-xs sm:text-sm">User ID: #{selectedUser.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
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
                <span
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${
                    selectedUser.is_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {selectedUser.is_verified ? 'Verified Account' : 'Pending Verification'}
                </span>
                <span
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${getRoleBadgeClasses(selectedUser.role)}`}
                >
                  {selectedUser.role.toUpperCase()}
                </span>
              </div>

              {/* User Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Email Address</div>
                  <div className="text-sm font-medium text-gray-900 break-all">{selectedUser.email || 'Not provided'}</div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Phone Number</div>
                  <div className="text-sm font-medium text-gray-900">{selectedUser.phone || 'Not provided'}</div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Rating</div>
                  <div className="flex items-center gap-1">
                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm font-bold text-gray-900">{(selectedUser.rating || 5).toFixed(1)}</span>
                    <span className="text-xs text-gray-500">/ 5.0</span>
                  </div>
                </div>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Joined Date</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(selectedUser.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm sm:text-base"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleDelete(selectedUser.id, selectedUser.name);
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 sm:px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 active:bg-red-800 transition-colors text-sm sm:text-base"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
