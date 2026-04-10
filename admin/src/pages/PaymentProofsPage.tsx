import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../services/api';
import type { PaymentProof } from '../types';
import { getErrorMessage } from '../utils';
import { useTheme } from '../App';
import PageSkeleton from '../components/PageSkeleton';

export default function PaymentProofsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [serviceFilter, setServiceFilter] = useState('');
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => { loadProofs(); }, [page, statusFilter, serviceFilter]);

  const loadProofs = async () => {
    setLoading(true);
    try {
      const res = await adminService.getPaymentProofs({
        status: statusFilter || undefined,
        service_type: serviceFilter || undefined,
        page,
        limit: 20,
      });
      setProofs(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load payment proofs'));
      setProofs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedProof) return;
    setActionLoading(true);
    try {
      await adminService.verifyPaymentProof(selectedProof.id);
      toast.success(`Payment proof #${selectedProof.id} verified`);
      setShowVerifyModal(false);
      setSelectedProof(null);
      loadProofs();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to verify payment proof'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedProof || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.rejectPaymentProof(selectedProof.id, rejectReason.trim());
      toast.success(`Payment proof #${selectedProof.id} rejected`);
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProof(null);
      loadProofs();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reject payment proof'));
    } finally {
      setActionLoading(false);
    }
  };

  const openVerify = (proof: PaymentProof) => {
    setSelectedProof(proof);
    setShowVerifyModal(true);
  };

  const openReject = (proof: PaymentProof) => {
    setSelectedProof(proof);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const openImage = (proof: PaymentProof) => {
    setSelectedProof(proof);
    setImageError(false);
    setShowImageModal(true);
  };

  const totalPages = Math.ceil(total / 20);
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const inputClass = `px-3 py-1.5 rounded-lg border text-sm ${cardBg} ${borderColor} ${textColor}`;

  if (loading && proofs.length === 0) return <PageSkeleton />;

  return (
    <div className={bg}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 className={`text-2xl font-bold ${textColor}`}>Payment Proofs</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">All Statuses</option>
            <option value="submitted">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={serviceFilter} onChange={e => { setServiceFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">All Services</option>
            <option value="ride">Rides</option>
            <option value="delivery">Deliveries</option>
            <option value="order">Orders</option>
          </select>
          <button onClick={loadProofs} className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${cardBg} ${borderColor} ${textColor} hover:opacity-80 transition-opacity`}>
            Refresh
          </button>
        </div>
      </div>

      {proofs.length === 0 ? (
        <div className={`${cardBg} rounded-xl p-12 text-center ${subText}`}>
          No payment proofs found.
        </div>
      ) : (
        <div className={`${cardBg} rounded-xl border ${borderColor} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} border-b ${borderColor}`}>
                {['User', 'Service', 'Method', 'Amount', 'Reference', 'Status', 'Proof', 'Actions'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${subText}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proofs.map(proof => (
                <tr key={proof.id} className={`border-b ${borderColor} hover:${isDark ? 'bg-gray-700/30' : 'bg-gray-50/50'} transition-colors`}>
                  <td className={`px-4 py-3 ${textColor}`}>{proof.user?.name || `User #${proof.user_id}`}</td>
                  <td className={`px-4 py-3 ${textColor} capitalize`}>{proof.service_type} #{proof.service_id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${proof.payment_method === 'gcash' ? 'bg-blue-500' : 'bg-green-500'}`}>
                      {proof.payment_method === 'gcash' ? 'GCash' : 'Maya'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${textColor}`}>₱{proof.amount?.toFixed(2) ?? '0.00'}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${subText}`}>{proof.reference_number}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      proof.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                      proof.status === 'verified' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {proof.status === 'submitted' ? 'Pending' : proof.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openImage(proof)} className="text-blue-500 hover:text-blue-700 text-xs font-semibold underline-offset-2 hover:underline">
                      View
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {proof.status === 'submitted' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openVerify(proof)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => openReject(proof)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40 transition-opacity`}>
            Prev
          </button>
          <span className={`px-3 py-1 ${subText}`}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40 transition-opacity`}>
            Next
          </button>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && selectedProof && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowImageModal(false)}>
          <div className={`${cardBg} rounded-xl p-4 max-w-lg w-full max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`font-bold ${textColor}`}>Payment Proof</h3>
              <button onClick={() => setShowImageModal(false)} className={`${subText} hover:opacity-70 text-xl leading-none`}>✕</button>
            </div>
            {imageError ? (
              <div className={`w-full h-48 rounded-lg flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'} ${subText} text-sm`}>
                Image could not be loaded
              </div>
            ) : (
              <img
                src={selectedProof.proof_image_url}
                alt="Payment proof"
                className="w-full rounded-lg"
                onError={() => setImageError(true)}
              />
            )}
            <div className={`mt-3 text-sm ${subText} space-y-1`}>
              <p>Reference: <span className="font-mono font-bold">{selectedProof.reference_number}</span></p>
              <p>Amount: <span className="font-bold">₱{selectedProof.amount?.toFixed(2) ?? '0.00'}</span></p>
              <p>Attempt: {selectedProof.attempt_number ?? 1}</p>
            </div>
            {selectedProof.status === 'submitted' && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => { setShowImageModal(false); openVerify(selectedProof); }}
                  className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors"
                >
                  Verify
                </button>
                <button
                  onClick={() => { setShowImageModal(false); openReject(selectedProof); }}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify Confirm Modal */}
      {showVerifyModal && selectedProof && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`${cardBg} rounded-xl p-6 max-w-sm w-full shadow-xl`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className={`font-bold ${textColor}`}>Verify Payment Proof</h3>
                <p className={`text-xs ${subText}`}>This action cannot be undone</p>
              </div>
            </div>
            <p className={`text-sm ${subText} mb-4`}>
              Verify payment of <strong className={textColor}>₱{selectedProof.amount?.toFixed(2)}</strong> from{' '}
              <strong className={textColor}>{selectedProof.user?.name || `User #${selectedProof.user_id}`}</strong> via{' '}
              {selectedProof.payment_method === 'gcash' ? 'GCash' : 'Maya'}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowVerifyModal(false); setSelectedProof(null); }}
                disabled={actionLoading}
                className={`flex-1 py-2 rounded-lg border ${borderColor} ${textColor} font-semibold text-sm disabled:opacity-50 transition-opacity`}
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                disabled={actionLoading}
                className="flex-1 py-2 rounded-lg bg-green-500 text-white font-bold text-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedProof && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`${cardBg} rounded-xl p-6 max-w-md w-full shadow-xl`}>
            <h3 className={`font-bold text-lg mb-1 ${textColor}`}>Reject Payment Proof</h3>
            <p className={`text-sm mb-4 ${subText}`}>
              {selectedProof.user?.name || `User #${selectedProof.user_id}`} — ₱{selectedProof.amount?.toFixed(2)} via{' '}
              {selectedProof.payment_method === 'gcash' ? 'GCash' : 'Maya'}
            </p>
            <label className={`block text-xs font-semibold mb-1.5 ${subText}`}>Rejection reason <span className="text-red-500">*</span></label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason…"
              className={`w-full p-3 rounded-lg border ${borderColor} ${isDark ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-900'} text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500`}
              rows={3}
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); setSelectedProof(null); }}
                disabled={actionLoading}
                className={`flex-1 py-2 rounded-lg border ${borderColor} ${textColor} font-semibold text-sm disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
