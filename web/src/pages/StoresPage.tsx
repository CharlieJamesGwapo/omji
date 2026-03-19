import React, { useEffect, useState } from 'react';
import { storeService } from '../services/api';

const StoresPage: React.FC = () => {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const response = await storeService.getStores();
      setStores(response.data || []);
    } catch (error) {
      console.error('Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  const categories = ['all', 'restaurant', 'grocery', 'pharmacy'];
  const filteredStores = filterCategory === 'all' 
    ? stores 
    : stores.filter(store => store.category === filterCategory);

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Food & Stores</h1>
      <p className="text-gray-600 mb-8">Order from your favorite restaurants, groceries, and pharmacies</p>

      {/* Filter */}
      <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
              filterCategory === cat
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-900 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading stores...</p>
        </div>
      ) : filteredStores.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStores.map((store) => (
            <div key={store.id} className="card overflow-hidden hover:shadow-lg transition">
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{store.name}</h3>
                  <span className="badge badge-success">⭐ {store.rating?.toFixed(1) || '5.0'}</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{store.category}</p>
                <p className="text-xs text-gray-500 mb-4">{store.address}</p>
                <button className="w-full btn-primary py-2">
                  Order Now
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="text-gray-600">No stores found</p>
        </div>
      )}
    </div>
  );
};

export default StoresPage;
