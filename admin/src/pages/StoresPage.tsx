import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';

const StoresPage: React.FC = () => {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'restaurant', address: '', phone: '', description: '' });

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const res = await adminService.getStores();
      setStores(res.data.data || []);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminService.createStore({ ...form, is_verified: true, rating: 5.0 });
      setStores([res.data.data, ...stores]);
      setShowForm(false);
      setForm({ name: '', category: 'restaurant', address: '', phone: '', description: '' });
    } catch (err) {
      alert('Failed to create store');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this store?')) return;
    try {
      await adminService.deleteStore(id);
      setStores(stores.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete store');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading stores...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
          <p className="text-gray-500">{stores.length} registered stores</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Store'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-bold mb-4">Add New Store</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              placeholder="Store Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="restaurant">Restaurant</option>
              <option value="grocery">Grocery</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
            <input
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 md:col-span-2"
              rows={2}
            />
            <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 md:col-span-2">
              Create Store
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => (
          <div key={store.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-gray-900">{store.name}</h3>
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 capitalize mt-1">{store.category}</span>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${store.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {store.is_verified ? 'Verified' : 'Pending'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-2">{store.address}</p>
            <p className="text-sm text-gray-500 mb-3">{store.description}</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-amber-600 font-medium">Rating: {(store.rating || 5).toFixed(1)}</span>
              <button onClick={() => handleDelete(store.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {stores.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl">No stores yet. Add one above.</div>
      )}
    </div>
  );
};

export default StoresPage;
