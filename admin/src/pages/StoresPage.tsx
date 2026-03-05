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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading stores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Stores</h1>
          <p className="text-gray-500 text-sm mt-1">{stores.length} registered store{stores.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm sm:text-base font-medium"
        >
          {showForm ? 'Cancel' : '+ Add Store'}
        </button>
      </div>

      {/* Create Store Form */}
      {showForm && (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Add New Store</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <input
              placeholder="Store Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
              required
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base bg-white"
            >
              <option value="restaurant">Restaurant</option>
              <option value="grocery">Grocery</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
            <input
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
              required
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base"
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-sm sm:text-base md:col-span-2"
              rows={2}
            />
            <button
              type="submit"
              className="w-full px-6 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-colors font-medium text-sm sm:text-base md:col-span-2"
            >
              Create Store
            </button>
          </form>
        </div>
      )}

      {/* Store Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {stores.map((store) => (
          <div key={store.id} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate">{store.name}</h3>
                <span className="inline-block px-2.5 py-0.5 text-xs rounded-full bg-red-50 text-red-700 capitalize mt-1 font-medium">
                  {store.category}
                </span>
              </div>
              <span className={`ml-2 flex-shrink-0 px-2.5 py-1 text-xs rounded-full font-medium ${store.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {store.is_verified ? 'Verified' : 'Pending'}
              </span>
            </div>

            {store.address && (
              <div className="flex items-start gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm text-gray-500">{store.address}</p>
              </div>
            )}

            {store.description && (
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{store.description}</p>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-medium text-amber-600">{(store.rating || 5).toFixed(1)}</span>
              </div>
              <button
                onClick={() => handleDelete(store.id)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors active:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {stores.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p className="text-gray-400 text-lg font-medium">No stores yet</p>
          <p className="text-gray-300 text-sm mt-1">Add one above to get started.</p>
        </div>
      )}
    </div>
  );
};

export default StoresPage;
