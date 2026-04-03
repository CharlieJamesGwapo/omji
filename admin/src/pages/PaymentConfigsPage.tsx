import React, { useEffect, useState, useCallback, useRef } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import type { PaymentConfig } from '../types';
import { getErrorMessage } from '../utils';
import { ConfirmDialog, PageSkeleton, Modal } from '../components';

const EMPTY_FORM = {
  type: 'gcash',
  account_name: '',
  account_number: '',
  qr_code_url: '',
  is_active: true,
};

const THEME = {
  gcash: { color: '#007bff', bg: 'bg-blue-600', bgLight: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', label: 'GCash' },
  maya: { color: '#34A853', bg: 'bg-green-600', bgLight: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', label: 'Maya' },
} as Record<string, { color: string; bg: string; bgLight: string; border: string; text: string; label: string }>;

const GCashIcon = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
    <rect width="24" height="24" rx="6" fill="#007bff" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">G</text>
  </svg>
);

const MayaIcon = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
    <rect width="24" height="24" rx="6" fill="#34A853" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">M</text>
  </svg>
);

const PaymentConfigsPage: React.FC = () => {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; configId: number | null }>({ open: false, configId: null });
  const [uploadingQR, setUploadingQR] = useState(false);
  const [qrInputMode, setQrInputMode] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConfigs = useCallback(async () => {
    try {
      const res = await adminService.getPaymentConfigs();
      setConfigs(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load payment configs'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const getConfig = (type: string) => configs.find(c => c.type === type);

  const openCreate = (type: string) => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, type });
    setModalOpen(true);
  };

  const openEdit = (config: PaymentConfig) => {
    setEditId(config.id);
    setForm({
      type: config.type,
      account_name: config.account_name,
      account_number: config.account_number,
      qr_code_url: config.qr_code_url,
      is_active: config.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.account_name.trim() || form.account_name.trim().length < 2) {
      toast.error('Account name must be at least 2 characters');
      return;
    }
    if (!form.account_number.trim()) {
      toast.error('Account number is required');
      return;
    }
    if (form.is_active && !form.qr_code_url) {
      toast.error('QR code is required for active payment configs');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await adminService.updatePaymentConfig(editId, form);
        toast.success('Payment config updated');
      } else {
        await adminService.createPaymentConfig(form);
        toast.success('Payment config created');
      }
      setModalOpen(false);
      await loadConfigs();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save'));
    }
    setSaving(false);
  };

  const handleQRUpload = async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Only PNG, JPG, WEBP allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum 5MB allowed');
      return;
    }

    setUploadingQR(true);
    try {
      const res = await adminService.uploadQRCode(file);
      const url = res.data?.data?.url;
      if (url) {
        setForm(prev => ({ ...prev, qr_code_url: url }));
        toast.success('QR code uploaded successfully');
      } else {
        toast.error('Upload succeeded but no URL returned');
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to upload QR code'));
    } finally {
      setUploadingQR(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDialog.configId) return;
    const configToDelete = configs.find(c => c.id === confirmDialog.configId);
    if (configToDelete?.is_active) {
      toast.error('Cannot delete an active payment config. Deactivate it first.');
      setConfirmDialog({ open: false, configId: null });
      return;
    }
    try {
      await adminService.deletePaymentConfig(confirmDialog.configId);
      toast.success('Payment config deleted');
      await loadConfigs();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete'));
    }
    setConfirmDialog({ open: false, configId: null });
  };

  const theme = THEME[form.type] || THEME.gcash;

  if (loading) {
    return <PageSkeleton statCards={0} tableRows={2} showSearch={false} />;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage GCash and Maya QR code payment methods</p>
      </div>

      {/* Payment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(['gcash', 'maya'] as const).map((type) => {
          const config = getConfig(type);
          const t = THEME[type];
          return (
            <div key={type} className={`bg-white rounded-xl border ${t.border} overflow-hidden`}>
              {/* Card Header */}
              <div className={`${t.bg} px-5 py-4 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  {type === 'gcash' ? <GCashIcon /> : <MayaIcon />}
                  <div>
                    <h3 className="text-white font-bold text-lg">{t.label}</h3>
                    <p className="text-white/70 text-xs">QR Code Payment</p>
                  </div>
                </div>
                {config && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    config.is_active ? 'bg-white/20 text-white' : 'bg-black/20 text-white/70'
                  }`}>
                    {config.is_active ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>

              {/* Card Body */}
              <div className="p-5">
                {config ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Account Name</p>
                        <p className="text-sm font-semibold text-gray-900">{config.account_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Account Number</p>
                        <p className="text-sm font-semibold text-gray-900">{config.account_number}</p>
                      </div>
                    </div>

                    {config.qr_code_url && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">QR Code Preview</p>
                        <div className={`${t.bgLight} rounded-lg p-3 flex justify-center`}>
                          <img
                            src={config.qr_code_url}
                            alt={`${t.label} QR Code`}
                            className="w-32 h-32 min-h-[120px] object-contain rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => openEdit(config)}
                        className={`flex-1 px-4 py-2 min-h-[40px] ${t.bg} text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDialog({ open: true, configId: config.id })}
                        className="px-4 py-2 min-h-[40px] bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className={`w-14 h-14 ${t.bgLight} rounded-full flex items-center justify-center mx-auto mb-3`}>
                      <svg className={`w-7 h-7 ${t.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">Not configured yet</p>
                    <button
                      onClick={() => openCreate(type)}
                      className={`px-5 py-2 ${t.bg} text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity`}
                    >
                      Configure {t.label}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">How it works</p>
            <ul className="list-disc list-inside space-y-0.5 text-gray-500">
              <li>Upload your GCash/Maya QR code image directly or paste an image URL</li>
              <li>Users will see this QR code when they select GCash/Maya as their payment method</li>
              <li>They can scan the QR code or tap "Open in GCash/Maya" to complete payment</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="Delete Payment Config"
        message="Are you sure you want to delete this payment configuration? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDialog({ open: false, configId: null })}
      />

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setForm(EMPTY_FORM); setEditId(null); setModalOpen(false); }}
        title={`${editId ? 'Edit' : 'Configure'} ${THEME[form.type]?.label || form.type} Payment`}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setForm(EMPTY_FORM); setEditId(null); setModalOpen(false); }}
              className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-50"
              style={{ backgroundColor: theme.color }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <input
                type="text"
                value={THEME[form.type]?.label || form.type}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
              <input
                type="text"
                value={form.account_name}
                onChange={e => setForm({ ...form, account_name: e.target.value })}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
              <input
                type="text"
                value={form.account_number}
                onChange={e => setForm({ ...form, account_number: e.target.value })}
                placeholder="e.g. 09171234567"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">{form.is_active ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
          </div>

          {/* QR Code */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">QR Code Image</label>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setQrInputMode('upload')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    qrInputMode === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => setQrInputMode('url')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    qrInputMode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  URL
                </button>
              </div>
            </div>

            {qrInputMode === 'upload' ? (
              <div
                onClick={() => !uploadingQR && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleQRUpload(file);
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  uploadingQR ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQRUpload(file);
                  }}
                />
                {uploadingQR ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Uploading...</p>
                  </div>
                ) : form.qr_code_url ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={form.qr_code_url} alt="QR Code" className="w-32 h-32 object-contain rounded-lg border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <p className="text-xs text-gray-500">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Click to upload or drag & drop</p>
                    <p className="text-xs text-gray-400">PNG, JPG, WEBP up to 5MB</p>
                  </div>
                )}
              </div>
            ) : (
              <input
                type="url"
                placeholder="https://example.com/my-qr-code.png"
                value={form.qr_code_url}
                onChange={(e) => setForm({ ...form, qr_code_url: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
              />
            )}
          </div>

          {/* Mobile Preview */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Mobile App Preview</p>
            <div className="bg-gray-100 rounded-xl p-4 flex justify-center">
              <div className="w-72 bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
                {/* Preview Header */}
                <div className="px-4 py-3" style={{ backgroundColor: theme.color }}>
                  <p className="text-white text-center text-sm font-semibold">
                    Complete the payment in your {THEME[form.type]?.label} app
                  </p>
                </div>

                {/* Preview Body */}
                <div className="p-4 space-y-4">
                  {form.account_name && (
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Send to</p>
                      <p className="text-sm font-bold text-gray-900">{form.account_name}</p>
                      {form.account_number && (
                        <p className="text-xs text-gray-500">{form.account_number}</p>
                      )}
                    </div>
                  )}

                  {form.qr_code_url ? (
                    <div className="flex justify-center">
                      <img
                        src={form.qr_code_url}
                        alt="QR Preview"
                        className="w-40 h-40 object-contain rounded-lg border border-gray-100"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" font-size="10" text-anchor="middle" fill="%239ca3af">No image</text></svg>';
                          (e.target as HTMLImageElement).alt = 'Invalid image URL';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-40 mx-auto bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                      <p className="text-xs text-gray-400 text-center px-4">QR code will appear here</p>
                    </div>
                  )}

                  <button
                    className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                    style={{ backgroundColor: theme.color }}
                    disabled
                  >
                    Open in {THEME[form.type]?.label}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PaymentConfigsPage;
