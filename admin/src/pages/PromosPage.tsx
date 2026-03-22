import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import { useDebounce } from '../hooks/useDebounce';
import type { Promo } from '../types';
import { ITEMS_PER_PAGE } from '../constants';
import { formatCurrency, getErrorMessage } from '../utils';
import { SearchInput, ConfirmDialog, EmptyState, PageSkeleton, Pagination } from '../components';

const PromosPage: React.FC = () => {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; promoId: number | null }>({ open: false, promoId: null });
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: 0,
    minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true,
    start_date: '', end_date: '',
  });

  useEffect(() => { loadPromos(); }, []);

  // Reset page on search change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch]);

  const loadPromos = async () => {
    try {
      const res = await adminService.getPromos();
      setPromos(res.data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load promos'));
    }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true, start_date: '', end_date: '' });
    setEditingPromo(null);
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.discount_value < 0) {
      toast.error('Discount value cannot be negative');
      return;
    }
    if (form.discount_type === 'percentage' && form.discount_value > 100) {
      toast.error('Percentage discount cannot exceed 100');
      return;
    }
    if (form.start_date && form.end_date && new Date(form.end_date) <= new Date(form.start_date)) {
      toast.error('End date must be after start date');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined, end_date: form.end_date ? new Date(form.end_date).toISOString() : undefined };
      const res = await adminService.createPromo(payload);
      const newPromo = res.data.data;
      if (newPromo) setPromos([newPromo, ...promos]);
      toast.success('Promo created successfully!');
      resetForm();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create promo'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;
    if (form.discount_value < 0) {
      toast.error('Discount value cannot be negative');
      return;
    }
    if (form.discount_type === 'percentage' && form.discount_value > 100) {
      toast.error('Percentage discount cannot exceed 100');
      return;
    }
    if (form.start_date && form.end_date && new Date(form.end_date) <= new Date(form.start_date)) {
      toast.error('End date must be after start date');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined, end_date: form.end_date ? new Date(form.end_date).toISOString() : undefined };
      const res = await adminService.updatePromo(editingPromo.id, payload);
      const updated = res.data.data;
      if (updated) setPromos(promos.map(p => p.id === updated.id ? updated : p));
      toast.success('Promo updated successfully!');
      resetForm();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update promo'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (promo: Promo) => {
    setEditingPromo(promo);
    setForm({
      code: promo.code || '',
      description: promo.description || '',
      discount_type: promo.discount_type || 'percentage',
      discount_value: promo.discount_value || 0,
      minimum_amount: promo.minimum_amount || 0,
      max_discount: promo.max_discount || 0,
      usage_limit: promo.usage_limit || 100,
      applicable_to: promo.applicable_to || 'all',
      is_active: promo.is_active !== false,
      start_date: promo.start_date ? new Date(promo.start_date).toISOString().slice(0, 16) : '',
      end_date: promo.end_date ? new Date(promo.end_date).toISOString().slice(0, 16) : '',
    });
    setShowForm(true);
  };

  const handleToggleActive = async (promo: Promo) => {
    try {
      const res = await adminService.updatePromo(promo.id, { is_active: !promo.is_active });
      const updated = res.data.data;
      if (updated) setPromos(promos.map(p => p.id === promo.id ? updated : p));
      toast.success(promo.is_active ? 'Promo deactivated' : 'Promo activated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update promo status'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDialog.promoId) return;
    try {
      await adminService.deletePromo(confirmDialog.promoId);
      setPromos(promos.filter(p => p.id !== confirmDialog.promoId));
      toast.success('Promo deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete promo'));
    }
    setConfirmDialog({ open: false, promoId: null });
  };

  const filtered = promos.filter((p) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      (p.code || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.applicable_to || '').toLowerCase().includes(q)
    );
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading) {
    return <PageSkeleton statCards={0} tableRows={5} showSearch />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Promo Codes</h1>
          <p className="text-gray-500 text-sm">{promos.length} total promos</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search promos..."
            className="w-full sm:w-64"
          />
          <button
            onClick={() => { if (showForm && !editingPromo) { resetForm(); } else { setEditingPromo(null); setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true, start_date: '', end_date: '' }); setShowForm(true); } }}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm sm:text-base w-full sm:w-auto"
          >
            {showForm && !editingPromo ? 'Cancel' : '+ Create Promo'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-bold mb-4">{editingPromo ? 'Edit Promo Code' : 'New Promo Code'}</h2>
          <form onSubmit={editingPromo ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Code (e.g., RIDE50)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" required />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" required />
            <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="Discount Value" value={form.discount_value ?? ''} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" required />
            <input type="number" placeholder="Min Amount" value={form.minimum_amount ?? ''} onChange={(e) => setForm({ ...form, minimum_amount: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="number" placeholder="Max Discount" value={form.max_discount ?? ''} onChange={(e) => setForm({ ...form, max_discount: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="number" placeholder="Usage Limit" value={form.usage_limit ?? ''} onChange={(e) => setForm({ ...form, usage_limit: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <select value={form.applicable_to} onChange={(e) => setForm({ ...form, applicable_to: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">All Services</option>
              <option value="rides">Rides Only</option>
              <option value="deliveries">Deliveries Only</option>
              <option value="orders">Orders Only</option>
            </select>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
            <div className="flex gap-3 md:col-span-2">
              <button type="submit" disabled={saving} className="flex-1 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving...' : editingPromo ? 'Update Promo' : 'Create Promo'}
              </button>
              {editingPromo && (
                <button type="button" onClick={resetForm} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Mobile card view */}
      <div className="sm:hidden space-y-4">
        {paginated.map((promo) => (
          <div key={promo.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono font-bold text-gray-900">{promo.code}</span>
              <button
                onClick={() => handleToggleActive(promo)}
                className={`px-2 py-1 text-xs rounded-full cursor-pointer transition-colors min-h-[40px] ${promo.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                aria-label={promo.is_active ? 'Deactivate promo' : 'Activate promo'}
              >
                {promo.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{promo.description}</p>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div><span className="text-gray-500">Discount:</span> <span className="font-medium">{promo.discount_type === 'percentage' ? `${promo.discount_value}%` : formatCurrency(promo.discount_value)}</span></div>
              <div><span className="text-gray-500">Usage:</span> <span className="font-medium">{promo.usage_count || 0}/{promo.usage_limit}</span></div>
              <div><span className="text-gray-500">Applies to:</span> <span className="capitalize font-medium">{promo.applicable_to}</span></div>
              {promo.max_discount > 0 && <div><span className="text-gray-500">Max:</span> <span className="font-medium">{formatCurrency(promo.max_discount)}</span></div>}
            </div>
            {(promo.start_date || promo.end_date) && (
              <div className="text-xs text-gray-400 mb-3">
                {promo.start_date && new Date(promo.start_date).getFullYear() > 1 ? new Date(promo.start_date).toLocaleDateString() : '\u2014'} to {promo.end_date && new Date(promo.end_date).getFullYear() > 1 ? new Date(promo.end_date).toLocaleDateString() : '\u2014'}
              </div>
            )}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button onClick={() => handleEdit(promo)} className="text-gray-600 hover:text-gray-900 text-sm font-medium min-h-[40px]">Edit</button>
              <button onClick={() => setConfirmDialog({ open: true, promoId: promo.id })} className="text-red-600 hover:text-red-800 text-sm font-medium min-h-[40px]">Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <EmptyState
            title={search ? 'No promos match your search' : 'No promos yet'}
            description={search ? 'Try adjusting your search terms' : 'Create your first promo code to get started'}
          />
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Discount</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usage</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Applies To</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((promo) => (
                <tr key={promo.id} className="hover:bg-gray-50">
                  <td className="px-4 lg:px-6 py-4 text-sm font-mono font-bold text-gray-900">{promo.code}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-600">{promo.description}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : formatCurrency(promo.discount_value)}
                    {promo.max_discount > 0 && <span className="text-gray-400 text-xs ml-1">(max {formatCurrency(promo.max_discount)})</span>}
                  </td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-600">{promo.usage_count || 0} / {promo.usage_limit}</td>
                  <td className="px-4 lg:px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 capitalize">{promo.applicable_to}</span></td>
                  <td className="px-4 lg:px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(promo)}
                      className={`px-2 py-1 text-xs rounded-full cursor-pointer transition-colors ${promo.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      aria-label={promo.is_active ? 'Deactivate promo' : 'Activate promo'}
                    >
                      {promo.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(promo)} className="text-gray-600 hover:text-gray-900 text-sm font-medium">Edit</button>
                      <button onClick={() => setConfirmDialog({ open: true, promoId: promo.id })} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            title={search ? 'No promos match your search' : 'No promos yet'}
            description={search ? 'Try adjusting your search terms' : 'Create your first promo code to get started'}
          />
        )}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="Delete Promo"
        message="Are you sure you want to delete this promo code? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDialog({ open: false, promoId: null })}
      />
    </div>
  );
};

export default PromosPage;
