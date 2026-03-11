import React, { useEffect, useState, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface PaymentConfig {
  id: number;
  type: string;
  account_name: string;
  account_number: string;
  qr_code_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  const loadConfigs = useCallback(async () => {
    try {
      const res = await adminService.getPaymentConfigs();
      setConfigs(res.data.data || []);
    } catch {
      toast.error('Failed to load payment configs');
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
    if (!form.account_name.trim() || !form.account_number.trim()) {
      toast.error('Account name and number are required');
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
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this payment config?')) return;
    try {
      await adminService.deletePaymentConfig(id);
      toast.success('Payment config deleted');
      await loadConfigs();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const theme = THEME[form.type] || THEME.gcash;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
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
                        onClick={() => handleDelete(config.id)}
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
              <li>Upload your GCash/Maya QR code image and paste the URL here</li>
              <li>Users will see this QR code when they select GCash/Maya as their payment method</li>
              <li>They can scan the QR code or tap "Open in GCash/Maya" to complete payment</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? 'Edit' : 'Configure'} {THEME[form.type]?.label || form.type} Payment
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-2 min-w-[40px] min-h-[40px] hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={form.account_number}
                    onChange={e => setForm({ ...form, account_number: e.target.value })}
                    placeholder="e.g. 09171234567"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QR Code Image URL</label>
                <input
                  type="url"
                  value={form.qr_code_url}
                  onChange={e => setForm({ ...form, qr_code_url: e.target.value })}
                  placeholder="https://example.com/my-qr-code.png"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
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

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setModalOpen(false)}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentConfigsPage;
