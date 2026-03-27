import { useState, useEffect } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';
import { useDebounce } from '../hooks/useDebounce';
import type { Store, MenuItem } from '../types';
import { ITEMS_PER_PAGE, STORE_CATEGORY_COLORS, MENU_CATEGORY_COLORS } from '../constants';
import { formatCurrency, getErrorMessage } from '../utils';
import { Pagination, ConfirmDialog, SearchInput, EmptyState, Modal, PageSkeleton } from '../components';

type FilterTab = 'all' | 'restaurant' | 'grocery' | 'pharmacy' | 'verified' | 'unverified';

const emptyStoreForm = {
  name: '',
  category: 'restaurant',
  address: '',
  phone: '',
  description: '',
  logo: '',
  is_verified: false,
};

const emptyMenuForm = {
  name: '',
  price: 0,
  category: 'food',
  image: '',
  available: true,
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Store modal
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [savingStore, setSavingStore] = useState(false);

  // Menu modal
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuStore, setMenuStore] = useState<Store | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [savingMenuItem, setSavingMenuItem] = useState(false);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeTab]);

  const fetchStores = async () => {
    try {
      const res = await adminService.getStores();
      setStores(res.data?.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load stores'));
    } finally {
      setLoading(false);
    }
  };

  // --- Filtering ---
  const filtered = stores.filter((s) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matches =
        (s.name || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    switch (activeTab) {
      case 'restaurant': return s.category === 'restaurant';
      case 'grocery': return s.category === 'grocery';
      case 'pharmacy': return s.category === 'pharmacy';
      case 'verified': return s.is_verified;
      case 'unverified': return !s.is_verified;
      default: return true;
    }
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // --- Stats ---
  const totalStores = stores.length;
  const verifiedCount = stores.filter(s => s.is_verified).length;
  const categoryBreakdown = {
    restaurant: stores.filter(s => s.category === 'restaurant').length,
    grocery: stores.filter(s => s.category === 'grocery').length,
    pharmacy: stores.filter(s => s.category === 'pharmacy').length,
  };
  const avgRating = totalStores > 0
    ? stores.reduce((sum, s) => sum + (s.rating || 0), 0) / totalStores
    : 0;

  // --- Tab counts ---
  const tabCounts: Record<FilterTab, number> = {
    all: stores.length,
    restaurant: categoryBreakdown.restaurant,
    grocery: categoryBreakdown.grocery,
    pharmacy: categoryBreakdown.pharmacy,
    verified: verifiedCount,
    unverified: stores.length - verifiedCount,
  };

  // --- Store CRUD ---
  const openCreateStore = () => {
    setEditingStore(null);
    setStoreForm({ ...emptyStoreForm });
    setShowStoreModal(true);
  };

  const openEditStore = (store: Store) => {
    setEditingStore(store);
    setStoreForm({
      name: store.name || '',
      category: store.category || 'restaurant',
      address: store.address || '',
      phone: store.phone || '',
      description: store.description || '',
      logo: store.logo || '',
      is_verified: store.is_verified,
    });
    setShowStoreModal(true);
  };

  const handleSaveStore = async () => {
    if (!storeForm.name.trim()) {
      toast.error('Store name is required');
      return;
    }
    if (!storeForm.address.trim()) {
      toast.error('Address is required');
      return;
    }
    setSavingStore(true);
    try {
      if (editingStore) {
        await adminService.updateStore(editingStore.id, storeForm);
        toast.success('Store updated');
      } else {
        await adminService.createStore({ ...storeForm, rating: 0, total_ratings: 0 });
        toast.success('Store created');
      }
      setShowStoreModal(false);
      fetchStores();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to save store'));
    } finally {
      setSavingStore(false);
    }
  };

  const handleDeleteStore = (store: Store) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Store',
      message: `Delete "${store.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await adminService.deleteStore(store.id);
          toast.success('Store deleted');
          setStores(prev => prev.filter(s => s.id !== store.id));
        } catch (err) {
          toast.error(getErrorMessage(err, 'Failed to delete store'));
        }
      },
    });
  };

  const handleToggleVerified = async (store: Store) => {
    try {
      await adminService.updateStore(store.id, { is_verified: !store.is_verified });
      toast.success(store.is_verified ? 'Store unverified' : 'Store verified');
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_verified: !store.is_verified } : s));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update verification'));
    }
  };

  // --- Menu CRUD ---
  const openMenuModal = async (store: Store) => {
    setMenuStore(store);
    setShowMenuModal(true);
    setLoadingMenu(true);
    setShowMenuForm(false);
    setEditingMenuItem(null);
    try {
      const res = await adminService.getMenuItems(store.id);
      setMenuItems(res.data?.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load menu items'));
      setMenuItems([]);
    } finally {
      setLoadingMenu(false);
    }
  };

  const openCreateMenuItem = () => {
    setEditingMenuItem(null);
    setMenuForm({ ...emptyMenuForm });
    setShowMenuForm(true);
  };

  const openEditMenuItem = (item: MenuItem) => {
    setEditingMenuItem(item);
    setMenuForm({
      name: item.name || '',
      price: item.price || 0,
      category: item.category || 'food',
      image: item.image || '',
      available: item.available,
    });
    setShowMenuForm(true);
  };

  const handleSaveMenuItem = async () => {
    if (!menuStore) return;
    if (!menuForm.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!menuForm.price || menuForm.price <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }
    setSavingMenuItem(true);
    try {
      if (editingMenuItem) {
        const res = await adminService.updateMenuItem(menuStore.id, editingMenuItem.id, menuForm);
        setMenuItems(prev => prev.map(i => i.id === editingMenuItem.id ? (res.data?.data || { ...editingMenuItem, ...menuForm }) : i));
        toast.success('Menu item updated');
      } else {
        await adminService.createMenuItem(menuStore.id, menuForm);
        const menuRes = await adminService.getMenuItems(menuStore.id);
        setMenuItems(menuRes.data?.data || []);
        toast.success('Menu item created');
      }
      setShowMenuForm(false);
      setEditingMenuItem(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to save menu item'));
    } finally {
      setSavingMenuItem(false);
    }
  };

  const handleDeleteMenuItem = (item: MenuItem) => {
    if (!menuStore) return;
    setConfirmDialog({
      open: true,
      title: 'Delete Menu Item',
      message: `Delete "${item.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await adminService.deleteMenuItem(menuStore.id, item.id);
          setMenuItems(prev => prev.filter(i => i.id !== item.id));
          toast.success('Menu item deleted');
        } catch (err) {
          toast.error(getErrorMessage(err, 'Failed to delete menu item'));
        }
      },
    });
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    if (!menuStore) return;
    try {
      await adminService.updateMenuItem(menuStore.id, item.id, { available: !item.available });
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, available: !i.available } : i));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update availability'));
    }
  };

  // --- Loading Skeleton ---
  if (loading) {
    return <PageSkeleton statCards={4} filterButtons={6} tableRows={6} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage stores and their menu items</p>
        </div>
        <button
          onClick={openCreateStore}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Store
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stores */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gray-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalStores}</p>
            <p className="text-xs text-gray-500 mt-1">Registered stores</p>
          </div>
        </div>

        {/* Verified */}
        <div className="bg-white rounded-xl p-5 border border-green-200 ring-1 ring-green-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Verified</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{verifiedCount}</p>
            <p className="text-xs text-gray-500 mt-1">{totalStores > 0 ? `${Math.round((verifiedCount / totalStores) * 100)}%` : '0%'} of stores</p>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-orange-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categories</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">{categoryBreakdown.restaurant} rest</span>
              <span className="text-xs font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{categoryBreakdown.grocery} groc</span>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{categoryBreakdown.pharmacy} phar</span>
            </div>
          </div>
        </div>

        {/* Average Rating */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Rating</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
            <p className="text-xs text-gray-500 mt-1">Across all stores</p>
          </div>
        </div>
      </div>

      {/* Search + Filter Tabs */}
      <div className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, category, address, or phone..."
          className="w-full"
        />
        <div className="flex flex-wrap gap-2">
          {(['all', 'restaurant', 'grocery', 'pharmacy', 'verified', 'unverified'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)} ({tabCounts[tab]})
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table View */}
      {filtered.length > 0 && (
        <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Store</th>
                  <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Category</th>
                  <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Phone</th>
                  <th className="text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Rating</th>
                  <th className="text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map((store) => {
                  const catColor = STORE_CATEGORY_COLORS[store.category] || STORE_CATEGORY_COLORS.restaurant;
                  return (
                    <tr key={store.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {store.logo ? (
                            <img src={store.logo} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{store.name}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{store.address || 'No address'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${catColor.bg} ${catColor.text}`}>
                          {store.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-700">{store.phone || '---'}</td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">{(store.rating || 0).toFixed(1)}</span>
                          <span className="text-xs text-gray-400">({store.total_ratings || 0})</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          onClick={() => handleToggleVerified(store)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                            store.is_verified
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          }`}
                          aria-label={store.is_verified ? 'Unverify store' : 'Verify store'}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${store.is_verified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                          {store.is_verified ? 'Verified' : 'Unverified'}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openMenuModal(store)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors"
                            aria-label={`View menu for ${store.name}`}
                          >
                            Menu
                          </button>
                          <button
                            onClick={() => openEditStore(store)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            aria-label={`Edit ${store.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteStore(store)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            aria-label={`Delete ${store.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      {filtered.length > 0 && (
        <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
          {paginated.map((store) => {
            const catColor = STORE_CATEGORY_COLORS[store.category] || STORE_CATEGORY_COLORS.restaurant;
            return (
              <div key={store.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-base truncate">{store.name}</h3>
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full capitalize mt-1 font-bold ${catColor.bg} ${catColor.text}`}>
                      {store.category}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleVerified(store)}
                    className={`ml-2 flex-shrink-0 px-2.5 py-1 text-xs rounded-full font-bold cursor-pointer transition-colors ${
                      store.is_verified
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                    aria-label={store.is_verified ? 'Unverify store' : 'Verify store'}
                  >
                    {store.is_verified ? 'Verified' : 'Unverified'}
                  </button>
                </div>

                {store.address && (
                  <div className="flex items-start gap-2 mb-2">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-xs text-gray-500">{store.address}</p>
                  </div>
                )}

                {store.phone && (
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <p className="text-xs text-gray-500">{store.phone}</p>
                  </div>
                )}

                {store.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{store.description}</p>
                )}

                <div className="flex items-center gap-1 mb-3">
                  <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-sm font-medium text-amber-600">{(store.rating || 0).toFixed(1)}</span>
                  <span className="text-xs text-gray-400">({store.total_ratings || 0} ratings)</span>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openMenuModal(store)}
                    className="flex-1 py-2 min-h-[40px] text-xs font-semibold text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    View Menu
                  </button>
                  <button
                    onClick={() => openEditStore(store)}
                    className="flex-1 py-2 min-h-[40px] text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteStore(store)}
                    className="flex-1 py-2 min-h-[40px] text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <EmptyState
            title={search || activeTab !== 'all' ? 'No stores match your filters' : 'No stores yet'}
            description={search || activeTab !== 'all' ? 'Try adjusting your search or filters' : 'Add your first store to get started'}
            action={!search && activeTab === 'all' ? { label: 'Add First Store', onClick: openCreateStore } : undefined}
          />
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {/* ========== STORE CREATE/EDIT MODAL ========== */}
      <Modal
        open={showStoreModal}
        onClose={() => !savingStore && setShowStoreModal(false)}
        title={editingStore ? 'Edit Store' : 'New Store'}
        footer={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStoreModal(false)}
              disabled={savingStore}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveStore}
              disabled={savingStore}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingStore ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                editingStore ? 'Update Store' : 'Create Store'
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Store Name</label>
            <input
              type="text"
              value={storeForm.name}
              onChange={e => setStoreForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="e.g. Jollibee CDO"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
            <select
              value={storeForm.category}
              onChange={e => setStoreForm(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
            >
              <option value="restaurant">Restaurant</option>
              <option value="grocery">Grocery</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Address</label>
            <input
              type="text"
              value={storeForm.address}
              onChange={e => setStoreForm(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="e.g. 123 Corrales Ave, CDO"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
            <input
              type="text"
              value={storeForm.phone}
              onChange={e => setStoreForm(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="e.g. 09171234567"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea
              value={storeForm.description}
              onChange={e => setStoreForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              rows={3}
              placeholder="Brief description of the store..."
            />
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Logo URL</label>
            <input
              type="text"
              value={storeForm.logo}
              onChange={e => setStoreForm(prev => ({ ...prev, logo: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* Verified Toggle */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Verified</p>
              <p className="text-xs text-gray-500">Mark this store as verified</p>
            </div>
            <button
              type="button"
              onClick={() => setStoreForm(prev => ({ ...prev, is_verified: !prev.is_verified }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                storeForm.is_verified ? 'bg-green-500' : 'bg-gray-300'
              }`}
              aria-label="Toggle verified status"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                storeForm.is_verified ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </Modal>

      {/* ========== MENU MANAGEMENT MODAL ========== */}
      <Modal
        open={showMenuModal && menuStore !== null}
        onClose={() => { if (!savingMenuItem) { setShowMenuModal(false); setShowMenuForm(false); } }}
        title="Menu Items"
        size="lg"
      >
        {menuStore && (
          <div>
            {/* Sub-header with store name and add button */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">{menuStore.name}</p>
              {!showMenuForm && (
                <button
                  onClick={openCreateMenuItem}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </button>
              )}
            </div>

            {/* Menu Item Form */}
            {showMenuForm && (
              <div className="mb-4 p-4 border border-gray-100 bg-gray-50 rounded-xl">
                <h3 className="text-sm font-bold text-gray-900 mb-3">{editingMenuItem ? 'Edit Item' : 'New Item'}</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={menuForm.name}
                        onChange={e => setMenuForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        placeholder="e.g. Chicken Joy"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Price (PHP)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={menuForm.price || ''}
                        onChange={e => setMenuForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        placeholder="e.g. 99"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                      <select
                        value={menuForm.category}
                        onChange={e => setMenuForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                      >
                        <option value="food">Food</option>
                        <option value="drink">Drink</option>
                        <option value="dessert">Dessert</option>
                        <option value="snack">Snack</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Image URL</label>
                      <input
                        type="text"
                        value={menuForm.image}
                        onChange={e => setMenuForm(prev => ({ ...prev, image: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Available</span>
                    <button
                      type="button"
                      onClick={() => setMenuForm(prev => ({ ...prev, available: !prev.available }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        menuForm.available ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      aria-label="Toggle availability"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        menuForm.available ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => { setShowMenuForm(false); setEditingMenuItem(null); }}
                      disabled={savingMenuItem}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveMenuItem}
                      disabled={savingMenuItem}
                      className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingMenuItem ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        editingMenuItem ? 'Update Item' : 'Add Item'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Items List */}
            {loadingMenu ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl animate-pulse">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                    <div className="h-6 w-16 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            ) : menuItems.length === 0 ? (
              <EmptyState
                title="No menu items yet"
                description="Add items to this store's menu"
                action={{ label: 'Add First Item', onClick: openCreateMenuItem }}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">{menuItems.length} item{menuItems.length !== 1 ? 's' : ''}</p>
                {menuItems.map((item) => {
                  const menuCatColor = MENU_CATEGORY_COLORS[item.category] || MENU_CATEGORY_COLORS.other;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all group"
                    >
                      {/* Image */}
                      {item.image ? (
                        <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold capitalize ${menuCatColor}`}>
                            {item.category}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {formatCurrency(item.price ?? 0)}
                        </p>
                      </div>

                      {/* Available Toggle */}
                      <button
                        onClick={() => handleToggleAvailable(item)}
                        className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-bold transition-colors ${
                          item.available
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        aria-label={item.available ? 'Mark as unavailable' : 'Mark as available'}
                      >
                        {item.available ? 'Available' : 'Unavailable'}
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditMenuItem(item)}
                          className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center"
                          aria-label={`Edit ${item.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteMenuItem(item)}
                          className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center"
                          aria-label={`Delete ${item.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
