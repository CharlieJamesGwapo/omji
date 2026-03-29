import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import { formatDateTime, getErrorMessage } from '../utils';
import { PageSkeleton, EmptyState, Modal, ConfirmDialog } from '../components';
import { useTheme } from '../App';
import type { Announcement } from '../types';

type AnnouncementType = 'info' | 'warning' | 'promo' | 'update';

const TYPE_CONFIG: Record<AnnouncementType, { label: string; bg: string; text: string; dot: string; darkBg: string; darkText: string }> = {
  info:    { label: 'Info',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    darkBg: 'bg-blue-500/10',    darkText: 'text-blue-400' },
  warning: { label: 'Warning', bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500',  darkBg: 'bg-orange-500/10',  darkText: 'text-orange-400' },
  promo:   { label: 'Promo',   bg: 'bg-green-50',   text: 'text-green-700',   dot: 'bg-green-500',   darkBg: 'bg-green-500/10',   darkText: 'text-green-400' },
  update:  { label: 'Update',  bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500',  darkBg: 'bg-purple-500/10',  darkText: 'text-purple-400' },
};

const AnnouncementsPage: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info' as AnnouncementType,
    expires_at: '',
  });

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getAnnouncements();
      setAnnouncements(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load announcements'));
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setFormData({ title: '', message: '', type: 'info', expires_at: '' });
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((a: Announcement) => {
    setEditingId(a.id);
    setFormData({
      title: a.title,
      message: a.message,
      type: (a.type || 'info') as AnnouncementType,
      expires_at: a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : '',
    });
    setShowModal(true);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        type: formData.type,
        ...(formData.expires_at ? { expires_at: new Date(formData.expires_at).toISOString() } : {}),
      };
      if (editingId) {
        await adminService.updateAnnouncement(editingId, payload);
        toast.success('Announcement updated!');
      } else {
        await adminService.createAnnouncement(payload);
        toast.success('Announcement created!');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ title: '', message: '', type: 'info', expires_at: '' });
      await loadAnnouncements();
    } catch (err) {
      toast.error(getErrorMessage(err, editingId ? 'Failed to update announcement' : 'Failed to create announcement'));
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, loadAnnouncements]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await adminService.deleteAnnouncement(deleteTarget.id);
      toast.success('Announcement deleted');
      setDeleteTarget(null);
      await loadAnnouncements();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete announcement'));
    }
  }, [deleteTarget, loadAnnouncements]);

  const isExpired = (a: Announcement) => {
    if (!a.expires_at) return false;
    return new Date(a.expires_at) < new Date();
  };

  const getTypeCfg = (type: string) => TYPE_CONFIG[type as AnnouncementType] || TYPE_CONFIG.info;

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Announcements</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Manage announcements shown to app users
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Announcement
        </button>
      </div>

      {/* Cards */}
      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements"
          description="Create your first announcement to notify app users."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((a) => {
            const cfg = getTypeCfg(a.type);
            const expired = isExpired(a);
            const active = a.is_active && !expired;

            return (
              <div
                key={a.id}
                className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors ${
                  isDark
                    ? 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                } ${expired ? 'opacity-60' : ''}`}
              >
                {/* Top row: badge + status */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    isDark ? `${cfg.darkBg} ${cfg.darkText}` : `${cfg.bg} ${cfg.text}`
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    active
                      ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                      : isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {active ? 'Active' : 'Expired'}
                  </span>
                </div>

                {/* Title */}
                <h3 className={`text-sm font-semibold leading-snug ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {a.title}
                </h3>

                {/* Message */}
                <p className={`text-xs leading-relaxed flex-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {a.message}
                </p>

                {/* Dates */}
                <div className={`text-[11px] space-y-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <div>Created: {formatDateTime(a.created_at)}</div>
                  {a.expires_at && <div>Expires: {formatDateTime(a.expires_at)}</div>}
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-dashed flex justify-end gap-2" style={{ borderColor: isDark ? '#374151' : '#e5e7eb' }}>
                  <button
                    onClick={() => openEditModal(a)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      isDark
                        ? 'text-blue-400 hover:bg-blue-500/10'
                        : 'text-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(a)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      isDark
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-red-500 hover:bg-red-50'
                    }`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Announcement' : 'Create Announcement'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Announcement title"
              className={`w-full px-3 py-2.5 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
              required
            />
          </div>

          {/* Message */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Message</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Announcement message..."
              rows={4}
              className={`w-full px-3 py-2.5 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
              required
            />
          </div>

          {/* Type selector */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Type</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_CONFIG) as AnnouncementType[]).map((type) => {
                const cfg = TYPE_CONFIG[type];
                const selected = formData.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type }))}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                      selected
                        ? isDark
                          ? `${cfg.darkBg} ${cfg.darkText} border-current`
                          : `${cfg.bg} ${cfg.text} border-current`
                        : isDark
                          ? 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expires at */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Expires at <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
              className={`w-full px-3 py-2.5 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 shadow-sm"
            >
              {submitting ? (editingId ? 'Updating...' : 'Creating...') : (editingId ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Announcement"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
};

export default AnnouncementsPage;
