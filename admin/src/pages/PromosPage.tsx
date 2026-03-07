import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

const PromosPage: React.FC = () => {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: 0,
    minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true,
    start_date: '', end_date: '',
  });

  useEffect(() => { loadPromos(); }, []);

  const loadPromos = async () => {
    try {
      const res = await adminService.getPromos();
      setPromos(res.data.data || []);
    } catch (err) {
      console.error('Failed to load promos:', err);
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
    try {
      const payload = { ...form, start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined, end_date: form.end_date ? new Date(form.end_date).toISOString() : undefined };
      const res = await adminService.createPromo(payload);
      setPromos([res.data.data, ...promos]);
      resetForm();
    } catch {
      alert('Failed to create promo');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;
    try {
      const payload = { ...editingPromo, ...form, start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined, end_date: form.end_date ? new Date(form.end_date).toISOString() : undefined };
      const res = await adminService.updatePromo(editingPromo.id, payload);
      setPromos(promos.map(p => p.id === editingPromo.id ? res.data.data : p));
      resetForm();
    } catch {
      alert('Failed to update promo');
    }
  };

  const handleEdit = (promo: any) => {
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

  const handleToggleActive = async (promo: any) => {
    try {
      const res = await adminService.updatePromo(promo.id, { ...promo, is_active: !promo.is_active });
      setPromos(promos.map(p => p.id === promo.id ? res.data.data : p));
    } catch {
      alert('Failed to update promo status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this promo?')) return;
    try {
      await adminService.deletePromo(id);
      setPromos(promos.filter(p => p.id !== id));
    } catch {
      alert('Failed to delete promo');
    }
  };

  const filtered = promos.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.code || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.applicable_to || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="text-center py-12 text-gray-500">Loading promos...</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Promo Codes</h1>
          <p className="text-gray-500 text-sm">{promos.length} total promos</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search promos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-4 py-2 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <button
            onClick={() => { if (showForm && !editingPromo) { resetForm(); } else { setEditingPromo(null); setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true, start_date: '', end_date: '' }); setShowForm(true); } }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base w-full sm:w-auto"
          >
            {showForm && !editingPromo ? 'Cancel' : '+ Create Promo'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-bold mb-4">{editingPromo ? 'Edit Promo Code' : 'New Promo Code'}</h2>
          <form onSubmit={editingPromo ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Code (e.g., RIDE50)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
            <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" placeholder="Discount Value" value={form.discount_value || ''} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
            <input type="number" placeholder="Min Amount" value={form.minimum_amount || ''} onChange={(e) => setForm({ ...form, minimum_amount: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Max Discount" value={form.max_discount || ''} onChange={(e) => setForm({ ...form, max_discount: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Usage Limit" value={form.usage_limit || ''} onChange={(e) => setForm({ ...form, usage_limit: Number(e.target.value) })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={form.applicable_to} onChange={(e) => setForm({ ...form, applicable_to: e.target.value })} className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Services</option>
              <option value="rides">Rides Only</option>
              <option value="deliveries">Deliveries Only</option>
              <option value="orders">Orders Only</option>
            </select>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
            <div className="flex gap-3 md:col-span-2">
              <button type="submit" className="flex-1 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                {editingPromo ? 'Update Promo' : 'Create Promo'}
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
        {filtered.map((promo) => (
          <div key={promo.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <span className="font-mono font-bold text-blue-600">{promo.code}</span>
              <button
                onClick={() => handleToggleActive(promo)}
                className={`px-2 py-1 text-xs rounded-full cursor-pointer transition-colors ${promo.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {promo.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{promo.description}</p>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div><span className="text-gray-500">Discount:</span> <span className="font-medium">{promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `P${promo.discount_value}`}</span></div>
              <div><span className="text-gray-500">Usage:</span> <span className="font-medium">{promo.usage_count || 0}/{promo.usage_limit}</span></div>
              <div><span className="text-gray-500">Applies to:</span> <span className="capitalize font-medium">{promo.applicable_to}</span></div>
              {promo.max_discount > 0 && <div><span className="text-gray-500">Max:</span> <span className="font-medium">P{promo.max_discount}</span></div>}
            </div>
            {(promo.start_date || promo.end_date) && (
              <div className="text-xs text-gray-400 mb-3">
                {promo.start_date && new Date(promo.start_date).getFullYear() > 1 ? new Date(promo.start_date).toLocaleDateString() : '—'} to {promo.end_date && new Date(promo.end_date).getFullYear() > 1 ? new Date(promo.end_date).toLocaleDateString() : '—'}
              </div>
            )}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button onClick={() => handleEdit(promo)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
              <button onClick={() => handleDelete(promo.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-400 bg-white rounded-xl">{search ? 'No promos match your search' : 'No promos yet'}</div>}
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
              {filtered.map((promo) => (
                <tr key={promo.id} className="hover:bg-gray-50">
                  <td className="px-4 lg:px-6 py-4 text-sm font-mono font-bold text-blue-600">{promo.code}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-600">{promo.description}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-900">
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `P${promo.discount_value}`}
                    {promo.max_discount > 0 && <span className="text-gray-400 text-xs ml-1">(max P{promo.max_discount})</span>}
                  </td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-600">{promo.usage_count || 0} / {promo.usage_limit}</td>
                  <td className="px-4 lg:px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 capitalize">{promo.applicable_to}</span></td>
                  <td className="px-4 lg:px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(promo)}
                      className={`px-2 py-1 text-xs rounded-full cursor-pointer transition-colors ${promo.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {promo.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(promo)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                      <button onClick={() => handleDelete(promo.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="text-center py-12 text-gray-400">{search ? 'No promos match your search' : 'No promos yet'}</div>}
      </div>
    </div>
  );
};

export default PromosPage;
