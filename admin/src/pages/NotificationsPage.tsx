import React, { useState, useEffect } from 'react';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'all' | 'users' | 'drivers' | 'specific';
  target_users?: string;
  sent_at: string;
  sent_count: number;
  status: 'draft' | 'sent' | 'scheduled';
}

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'all' as 'all' | 'users' | 'drivers' | 'specific',
    target_users: '',
  });

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    // Load from localStorage
    const saved = localStorage.getItem('omji_notifications');
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch {
        setNotifications([]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const newNotification: Notification = {
        id: Date.now(),
        title: formData.title,
        message: formData.message,
        type: formData.type,
        target_users: formData.target_users,
        sent_at: new Date().toISOString(),
        sent_count: formData.type === 'all' ? 0 : 0,
        status: 'sent',
      };
      const updated = [newNotification, ...notifications];
      setNotifications(updated);
      localStorage.setItem('omji_notifications', JSON.stringify(updated));
      setShowModal(false);
      setFormData({ title: '', message: '', type: 'all', target_users: '' });
    } catch (error: any) {
      alert('Failed to send notification');
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'all':
        return 'bg-purple-100 text-purple-800';
      case 'users':
        return 'bg-blue-100 text-blue-800';
      case 'drivers':
        return 'bg-green-100 text-green-800';
      case 'specific':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Push Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">Send notifications to users and drivers</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 active:bg-red-800 transition-colors shadow-lg shadow-red-600/30 flex items-center gap-2 w-full sm:w-auto justify-center text-sm sm:text-base"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Send Notification
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Total Sent</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{notifications.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">To Users</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{notifications.filter(n => n.type === 'users' || n.type === 'all').length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">To Drivers</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{notifications.filter(n => n.type === 'drivers' || n.type === 'all').length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Sent Today</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{notifications.filter(n => new Date(n.sent_at).toDateString() === new Date().toDateString()).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center text-gray-500">
            No notifications sent yet
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900 text-sm leading-snug">
                  {notification.title}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${getStatusColor(notification.status)}`}>
                  {notification.status}
                </span>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2">
                {notification.message}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${getTypeColor(notification.type)}`}>
                    {notification.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {notification.sent_count.toLocaleString()} sent
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(notification.sent_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Sent Count
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No notifications sent yet
                  </td>
                </tr>
              ) : (
                notifications.map((notification) => (
                  <tr key={notification.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{notification.title}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 max-w-xs truncate">{notification.message}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(notification.type)}`}>
                        {notification.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(notification.status)}`}>
                        {notification.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900 font-medium">{notification.sent_count.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {new Date(notification.sent_at).toLocaleDateString()}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Notification Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Send Push Notification</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors p-1 -m-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base"
                  placeholder="Enter notification title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none resize-none text-sm sm:text-base"
                  placeholder="Enter notification message"
                  rows={4}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Send To</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base bg-white"
                >
                  <option value="all">All Users & Drivers</option>
                  <option value="users">Users Only</option>
                  <option value="drivers">Drivers Only</option>
                  <option value="specific">Specific Users</option>
                </select>
              </div>

              {formData.type === 'specific' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                    User IDs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.target_users}
                    onChange={(e) => setFormData({ ...formData, target_users: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none text-sm sm:text-base"
                    placeholder="e.g., 1, 5, 12, 25"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-600/30 text-sm sm:text-base"
                >
                  {loading ? 'Sending...' : 'Send Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
