import { useState, useEffect } from 'react';
import { adminService } from '../services/api';
import type { PaymentProof } from '../types';
import { useTheme } from '../context/ThemeContext';
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
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
    } catch {
      setProofs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (proof: PaymentProof) => {
    if (!confirm('Verify this payment proof?')) return;
    setActionLoading(true);
    try {
      await adminService.verifyPaymentProof(proof.id);
      loadProofs();
    } catch {
      alert('Failed to verify payment proof');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedProof || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.rejectPaymentProof(selectedProof.id, rejectReason.trim());
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProof(null);
      loadProofs();
    } catch {
      alert('Failed to reject payment proof');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 20);
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  if (loading && proofs.length === 0) return <PageSkeleton />;

  return (
    <div className={bg}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 className={`text-2xl font-bold ${textColor}`}>Payment Proofs</h1>
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg border text-sm ${cardBg} ${borderColor} ${textColor}`}
          >
            <option value="">All Statuses</option>
            <option value="submitted">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={serviceFilter}
            onChange={e => { setServiceFilter(e.target.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg border text-sm ${cardBg} ${borderColor} ${textColor}`}
          >
            <option value="">All Services</option>
            <option value="ride">Rides</option>
            <option value="delivery">Deliveries</option>
            <option value="order">Orders</option>
          </select>
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
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>User</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Service</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Method</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Amount</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Reference</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Status</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Proof</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map(proof => (
                <tr key={proof.id} className={`border-b ${borderColor}`}>
                  <td className={`px-4 py-3 ${textColor}`}>{proof.user?.name || `User #${proof.user_id}`}</td>
                  <td className={`px-4 py-3 ${textColor} capitalize`}>{proof.service_type} #{proof.service_id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${proof.payment_method === 'gcash' ? 'bg-blue-500' : 'bg-green-500'}`}>
                      {proof.payment_method === 'gcash' ? 'GCash' : 'Maya'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${textColor}`}>&#8369;{proof.amount?.toFixed(2)}</td>
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
                    <button
                      onClick={() => { setSelectedProof(proof); setShowImageModal(true); }}
                      className="text-blue-500 hover:text-blue-700 text-xs font-semibold"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {proof.status === 'submitted' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVerify(proof)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => { setSelectedProof(proof); setShowRejectModal(true); }}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50"
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
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40`}>Prev</button>
          <span className={`px-3 py-1 ${subText}`}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40`}>Next</button>
        </div>
      )}

      {showImageModal && selectedProof && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowImageModal(false)}>
          <div className={`${cardBg} rounded-xl p-4 max-w-lg w-full max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`font-bold ${textColor}`}>Payment Proof</h3>
              <button onClick={() => setShowImageModal(false)} className={subText}>&#x2715;</button>
            </div>
            <img src={selectedProof.proof_image_url} alt="Payment proof" className="w-full rounded-lg" />
            <div className={`mt-3 text-sm ${subText}`}>
              <p>Reference: <span className="font-mono font-bold">{selectedProof.reference_number}</span></p>
              <p>Amount: <span className="font-bold">&#8369;{selectedProof.amount?.toFixed(2)}</span></p>
              <p>Attempt: {selectedProof.attempt_number}</p>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && selectedProof && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`${cardBg} rounded-xl p-6 max-w-md w-full`}>
            <h3 className={`font-bold text-lg mb-3 ${textColor}`}>Reject Payment Proof</h3>
            <p className={`text-sm mb-3 ${subText}`}>
              {selectedProof.user?.name} — &#8369;{selectedProof.amount?.toFixed(2)} via {selectedProof.payment_method}
            </p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className={`w-full p-3 rounded-lg border ${borderColor} ${cardBg} ${textColor} text-sm`} rows={3} />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className={`flex-1 py-2 rounded-lg border ${borderColor} ${textColor} font-semibold`}>Cancel</button>
              <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white font-bold disabled:opacity-50">
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
