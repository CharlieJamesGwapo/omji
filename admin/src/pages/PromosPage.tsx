import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

const PromosPage: React.FC = () => {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: 0,
    minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true,
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminService.createPromo(form);
      setPromos([res.data.data, ...promos]);
      setShowForm(false);
      setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, minimum_amount: 0, max_discount: 0, usage_limit: 100, applicable_to: 'all', is_active: true });
    } catch (err) {
      alert('Failed to create promo');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this promo?')) return;
    try {
      await adminService.deletePromo(id);
      setPromos(promos.filter(p => p.id !== id));
    } catch (err) {
      alert('Failed to delete promo');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading promos...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promo Codes</h1>
          <p className="text-gray-500">{promos.length} total promos</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Create Promo'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-bold mb-4">New Promo Code</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 md:col-span-2">Create Promo</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Discount</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usage</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Applies To</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {promos.map((promo) => (
              <tr key={promo.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono font-bold text-blue-600">{promo.code}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{promo.description}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `P${promo.discount_value}`}
                  {promo.max_discount > 0 && <span className="text-gray-400 text-xs ml-1">(max P{promo.max_discount})</span>}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{promo.usage_count || 0} / {promo.usage_limit}</td>
                <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 capitalize">{promo.applicable_to}</span></td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${promo.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {promo.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => handleDelete(promo.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {promos.length === 0 && <div className="text-center py-12 text-gray-400">No promos yet</div>}
      </div>
    </div>
  );
};

export default PromosPage;
