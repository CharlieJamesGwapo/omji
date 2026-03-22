import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import { useDebounce } from '../hooks/useDebounce';
import { ITEMS_PER_PAGE } from '../constants';
import { formatDateTime, getErrorMessage } from '../utils';
import { SearchInput, EmptyState, PageSkeleton, Pagination, Modal } from '../components';

interface Notification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
}

type FilterType = 'all' | 'users' | 'drivers';

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    target_type: 'all' as 'all' | 'users' | 'drivers',
  });

  useEffect(() => {
    loadNotifications();
  }, []);

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterType]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getNotifications();
      setNotifications(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load notifications'));
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await adminService.sendNotification({
        title: formData.title,
        message: formData.message,
        target_type: formData.target_type,
      });
      toast.success('Notification sent successfully!');
      setShowModal(false);
      setFormData({ title: '', message: '', target_type: 'all' });
      await loadNotifications();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send notification. Please try again.'));
    } finally {
      setSending(false);
    }
  }, [formData, loadNotifications]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'all': return 'All';
      case 'users': return 'Users';
      case 'drivers': return 'Drivers';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'all': return 'bg-purple-100 text-purple-800';
      case 'users': return 'bg-blue-100 text-blue-800';
      case 'drivers': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const { totalSent, toUsers, toDrivers, sentToday } = useMemo(() => ({
    totalSent: notifications.length,
    toUsers: notifications.filter(n => n.type === 'users').length,
    toDrivers: notifications.filter(n => n.type === 'drivers').length,
    sentToday: notifications.filter(
      n => new Date(n.created_at).toDateString() === new Date().toDateString()
    ).length,
  }), [notifications]);

  // Filter and search
  const filtered = useMemo(() => notifications.filter((n) => {
    const matchesFilter = filterType === 'all' || n.type === filterType;
    const q = debouncedSearch.toLowerCase();
    const matchesSearch = !q ||
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  }), [notifications, filterType, debouncedSearch]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const filterButtons: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalSent },
    { key: 'users', label: 'To Users', count: notifications.filter(n => n.type === 'users').length },
    { key: 'drivers', label: 'To Drivers', count: notifications.filter(n => n.type === 'drivers').length },
  ];

  if (loading) {
    return <PageSkeleton statCards={4} filterButtons={3} tableRows={6} />;
  }

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
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm flex items-center gap-2 w-full sm:w-auto justify-center text-sm sm:text-base"
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
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalSent}</p>
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
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{toUsers}</p>
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
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{toDrivers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 truncate">Sent Today</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{sentToday}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilterType(btn.key)}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filterType === btn.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {btn.label} ({btn.count})
            </button>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by title or message..."
          className="w-full sm:w-72"
        />
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {paginated.length === 0 ? (
          <EmptyState
            title="No notifications found"
            description={search || filterType !== 'all' ? 'Try adjusting your filters' : 'Tap "Send Notification" to get started'}
          />
        ) : (
          paginated.map((notification) => (
            <div
              key={notification.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900 text-sm leading-snug">
                  {notification.title}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getTypeColor(
                    notification.type
                  )}`}
                >
                  {getTypeLabel(notification.type)}
                </span>
              </div>

              <p className="text-sm text-gray-600 line-clamp-2">{notification.body}</p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {formatDateTime(notification.created_at)}
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
            <thead className="bg-gray-50/80 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Body</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <EmptyState
                      title="No notifications found"
                      description={search || filterType !== 'all' ? 'Try adjusting your filters' : 'Click "Send Notification" to get started'}
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((notification) => (
                  <tr key={notification.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{notification.title}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 max-w-xs truncate">{notification.body}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(notification.type)}`}>
                        {getTypeLabel(notification.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(notification.created_at)}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {/* Send Notification Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Send Push Notification"
        size="lg"
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="notification-form"
              disabled={sending}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm text-sm sm:text-base flex items-center justify-center gap-2 min-h-[44px]"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending...
                </>
              ) : (
                'Send Notification'
              )}
            </button>
          </div>
        }
      >
        <form id="notification-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Target Type - Visual selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Send To</label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { value: 'all', label: 'Everyone', desc: 'All users & drivers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
                { value: 'users', label: 'Users Only', desc: 'All app users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
                { value: 'drivers', label: 'Drivers Only', desc: 'All drivers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, target_type: opt.value as 'all' | 'users' | 'drivers' })}
                  className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all min-h-[44px] ${
                    formData.target_type === opt.value
                      ? 'border-emerald-600 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <svg
                    className={`w-5 h-5 sm:w-6 sm:h-6 mb-1.5 ${
                      formData.target_type === opt.value ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                  </svg>
                  <div className={`text-xs sm:text-sm font-semibold ${
                    formData.target_type === opt.value ? 'text-emerald-600' : 'text-gray-500'
                  }`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm sm:text-base"
              placeholder="Enter notification title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Message</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none text-sm sm:text-base"
              placeholder="Enter notification message"
              rows={4}
              maxLength={500}
              required
            />
            <p className="text-xs text-gray-400 mt-1">{formData.message.length}/500 characters</p>
          </div>

          {/* Preview */}
          {(formData.title || formData.message) && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Preview</div>
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{formData.title || 'Notification Title'}</p>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{formData.message || 'Message body will appear here...'}</p>
                    <p className="text-xs text-gray-400 mt-1">Just now</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};

export default NotificationsPage;
