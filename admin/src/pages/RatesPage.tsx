import { useState, useEffect } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface RateConfig {
  id: number;
  service_type: string;
  vehicle_type: string;
  base_fare: number;
  rate_per_km: number;
  minimum_fare: number;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SERVICE_LABELS: Record<string, string> = {
  ride: 'Pasundo (Ride)',
  delivery: 'Pasugo (Delivery)',
  order: 'Store Order',
};

const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string; badge: string; light: string }> = {
  ride: { bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', light: 'bg-blue-50' },
  delivery: { bg: 'bg-purple-600', text: 'text-purple-600', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', light: 'bg-purple-50' },
  order: { bg: 'bg-orange-600', text: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', light: 'bg-orange-50' },
};

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: 'Motorcycle',
  car: 'Car',
};

const DEFAULT_RATES: Record<string, { base: number; perKm: number }> = {
  'ride-motorcycle': { base: 40, perKm: 10 },
  'ride-car': { base: 60, perKm: 15 },
  'delivery-': { base: 50, perKm: 15 },
  'order-': { base: 30, perKm: 0 },
};

const emptyForm: Partial<RateConfig> = {
  service_type: 'ride',
  vehicle_type: 'motorcycle',
  base_fare: 0,
  rate_per_km: 0,
  minimum_fare: 0,
  description: '',
  is_active: true,
};

export default function RatesPage() {
  const [rates, setRates] = useState<RateConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<RateConfig | null>(null);
  const [form, setForm] = useState<Partial<RateConfig>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      const res = await adminService.getRates();
      setRates(res.data?.data || []);
    } catch (err: any) {
      toast.error('Failed to load rates');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingRate(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (rate: RateConfig) => {
    setEditingRate(rate);
    setForm({
      service_type: rate.service_type,
      vehicle_type: rate.vehicle_type,
      base_fare: rate.base_fare,
      rate_per_km: rate.rate_per_km,
      minimum_fare: rate.minimum_fare,
      description: rate.description,
      is_active: rate.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.service_type) {
      toast.error('Service type is required');
      return;
    }
    if (form.service_type === 'ride' && !form.vehicle_type) {
      toast.error('Vehicle type is required for rides');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        base_fare: Number(form.base_fare) || 0,
        rate_per_km: Number(form.rate_per_km) || 0,
        minimum_fare: Number(form.minimum_fare) || 0,
        vehicle_type: form.service_type === 'ride' ? form.vehicle_type : '',
      };
      if (editingRate) {
        await adminService.updateRate(editingRate.id, payload);
        toast.success('Rate updated successfully');
      } else {
        await adminService.createRate(payload);
        toast.success('Rate created successfully');
      }
      setShowModal(false);
      fetchRates();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save rate');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this rate config?')) return;
    setDeletingId(id);
    try {
      await adminService.deleteRate(id);
      toast.success('Rate deleted');
      fetchRates();
    } catch {
      toast.error('Failed to delete rate');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (rate: RateConfig) => {
    try {
      await adminService.updateRate(rate.id, { is_active: !rate.is_active });
      toast.success(rate.is_active ? 'Rate deactivated' : 'Rate activated');
      fetchRates();
    } catch {
      toast.error('Failed to update rate');
    }
  };

  const getActiveRate = (serviceType: string, vehicleType: string = '') => {
    return rates.find(r => r.service_type === serviceType && r.vehicle_type === vehicleType && r.is_active);
  };

  const getDisplayRate = (serviceType: string, vehicleType: string = '') => {
    const active = getActiveRate(serviceType, vehicleType);
    const key = `${serviceType}-${vehicleType}`;
    const def = DEFAULT_RATES[key];
    return {
      base: active?.base_fare ?? def?.base ?? 0,
      perKm: active?.rate_per_km ?? def?.perKm ?? 0,
      isCustom: !!active,
      isActive: active?.is_active ?? false,
    };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-200 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg mb-3" />
          ))}
        </div>
      </div>
    );
  }

  const motoRate = getDisplayRate('ride', 'motorcycle');
  const carRate = getDisplayRate('ride', 'car');
  const deliveryRate = getDisplayRate('delivery', '');
  const orderRate = getDisplayRate('order', '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rate Management</h1>
          <p className="text-sm text-gray-500 mt-1">Configure pricing for all services</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 shadow-sm transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Rate Config
        </button>
      </div>

      {/* Rate Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Motorcycle Rate */}
        <div className={`bg-white rounded-xl p-5 border ${motoRate.isCustom ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200'} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Motorcycle</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₱{motoRate.base.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">+ ₱{motoRate.perKm.toFixed(0)}/km</p>
            <div className="mt-3">
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${motoRate.isCustom ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {motoRate.isCustom ? 'Custom' : 'Default'}
              </span>
            </div>
          </div>
        </div>

        {/* Car Rate */}
        <div className={`bg-white rounded-xl p-5 border ${carRate.isCustom ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200'} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Car</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₱{carRate.base.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">+ ₱{carRate.perKm.toFixed(0)}/km</p>
            <div className="mt-3">
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${carRate.isCustom ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {carRate.isCustom ? 'Custom' : 'Default'}
              </span>
            </div>
          </div>
        </div>

        {/* Delivery Rate */}
        <div className={`bg-white rounded-xl p-5 border ${deliveryRate.isCustom ? 'border-purple-200 ring-1 ring-purple-100' : 'border-gray-200'} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Delivery</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₱{deliveryRate.base.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">+ ₱{deliveryRate.perKm.toFixed(0)}/km</p>
            <div className="mt-3">
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${deliveryRate.isCustom ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                {deliveryRate.isCustom ? 'Custom' : 'Default'}
              </span>
            </div>
          </div>
        </div>

        {/* Order Delivery Fee */}
        <div className={`bg-white rounded-xl p-5 border ${orderRate.isCustom ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-200'} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-20 h-20 bg-orange-50 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Fee</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₱{orderRate.base.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">Flat delivery fee</p>
            <div className="mt-3">
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${orderRate.isCustom ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                {orderRate.isCustom ? 'Custom' : 'Default'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fare Calculator Preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Fare Preview (5km example)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Motorcycle 5km</p>
            <p className="text-lg font-bold text-gray-900">₱{Math.max(motoRate.base + motoRate.perKm * 5, getActiveRate('ride', 'motorcycle')?.minimum_fare || 0).toFixed(0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Car 5km</p>
            <p className="text-lg font-bold text-gray-900">₱{Math.max(carRate.base + carRate.perKm * 5, getActiveRate('ride', 'car')?.minimum_fare || 0).toFixed(0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Delivery 5km</p>
            <p className="text-lg font-bold text-gray-900">₱{Math.max(deliveryRate.base + deliveryRate.perKm * 5, getActiveRate('delivery', '')?.minimum_fare || 0).toFixed(0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Order Fee</p>
            <p className="text-lg font-bold text-gray-900">₱{orderRate.base.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Rate Configs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">All Rate Configurations</h3>
          <span className="text-xs text-gray-400">{rates.length} config{rates.length !== 1 ? 's' : ''}</span>
        </div>

        {rates.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium mb-1">No custom rates configured</p>
            <p className="text-gray-400 text-sm mb-4">Default rates are being used. Add a custom rate to override defaults.</p>
            <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add First Rate
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Service</th>
                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Vehicle</th>
                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Base Fare</th>
                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Per KM</th>
                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Min Fare</th>
                    <th className="text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rates.map(rate => {
                    const colors = SERVICE_COLORS[rate.service_type] || SERVICE_COLORS.ride;
                    return (
                      <tr key={rate.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${colors.badge}`}>
                            {SERVICE_LABELS[rate.service_type] || rate.service_type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">
                          {rate.vehicle_type ? VEHICLE_LABELS[rate.vehicle_type] || rate.vehicle_type : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900 text-right">₱{rate.base_fare.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-700 text-right">₱{rate.rate_per_km.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 text-right">{rate.minimum_fare > 0 ? `₱${rate.minimum_fare.toFixed(2)}` : '—'}</td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => handleToggleActive(rate)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                              rate.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${rate.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {rate.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(rate)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(rate.id)}
                              disabled={deletingId === rate.id}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete"
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

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {rates.map(rate => {
                const colors = SERVICE_COLORS[rate.service_type] || SERVICE_COLORS.ride;
                return (
                  <div key={rate.id} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${colors.badge}`}>
                          {SERVICE_LABELS[rate.service_type] || rate.service_type}
                        </span>
                        {rate.vehicle_type && (
                          <span className="text-xs text-gray-500">{VEHICLE_LABELS[rate.vehicle_type]}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleActive(rate)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold min-h-[40px] ${
                          rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold">Base</p>
                        <p className="text-lg font-bold text-gray-900">₱{rate.base_fare.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold">Per KM</p>
                        <p className="text-lg font-bold text-gray-900">₱{rate.rate_per_km.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 uppercase font-bold">Min</p>
                        <p className="text-lg font-bold text-gray-900">{rate.minimum_fare > 0 ? `₱${rate.minimum_fare.toFixed(0)}` : '—'}</p>
                      </div>
                    </div>
                    {rate.description && <p className="text-xs text-gray-500 mb-3">{rate.description}</p>}
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(rate)} className="flex-1 py-2 min-h-[40px] text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rate.id)}
                        disabled={deletingId === rate.id}
                        className="flex-1 py-2 min-h-[40px] text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Default Rates Info */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Default Fallback Rates
        </h3>
        <p className="text-xs text-gray-500 mb-3">These rates are used when no active custom config exists for a service.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <p className="font-bold text-gray-700 mb-1">Motorcycle</p>
            <p className="text-gray-500">₱40 base + ₱10/km</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <p className="font-bold text-gray-700 mb-1">Car</p>
            <p className="text-gray-500">₱60 base + ₱15/km</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <p className="font-bold text-gray-700 mb-1">Delivery</p>
            <p className="text-gray-500">₱50 base + ₱15/km</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <p className="font-bold text-gray-700 mb-1">Order Fee</p>
            <p className="text-gray-500">₱30 flat fee</p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingRate ? 'Edit Rate Config' : 'New Rate Config'}</h2>
              <button onClick={() => !saving && setShowModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Service Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Service Type</label>
                <select
                  value={form.service_type}
                  onChange={e => setForm(prev => ({ ...prev, service_type: e.target.value, vehicle_type: e.target.value === 'ride' ? 'motorcycle' : '' }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                  disabled={!!editingRate}
                >
                  <option value="ride">Pasundo (Ride)</option>
                  <option value="delivery">Pasugo (Delivery)</option>
                  <option value="order">Store Order</option>
                </select>
              </div>

              {/* Vehicle Type (only for rides) */}
              {form.service_type === 'ride' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Vehicle Type</label>
                  <select
                    value={form.vehicle_type}
                    onChange={e => setForm(prev => ({ ...prev, vehicle_type: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                    disabled={!!editingRate}
                  >
                    <option value="motorcycle">Motorcycle</option>
                    <option value="car">Car</option>
                  </select>
                </div>
              )}

              {/* Base Fare */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {form.service_type === 'order' ? 'Delivery Fee (₱)' : 'Base Fare (₱)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.base_fare ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, base_fare: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                  placeholder="e.g. 40"
                />
              </div>

              {/* Rate Per KM (not for orders) */}
              {form.service_type !== 'order' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rate Per Kilometer (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.rate_per_km ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, rate_per_km: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                    placeholder="e.g. 10"
                  />
                </div>
              )}

              {/* Minimum Fare */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Minimum Fare (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minimum_fare ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, minimum_fare: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                  placeholder="0 = no minimum"
                />
                <p className="text-xs text-gray-400 mt-1">Set to 0 for no minimum fare requirement</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <input
                  type="text"
                  value={form.description || ''}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-600 focus:border-red-600 outline-none transition-all"
                  placeholder="e.g. Standard motorcycle fare"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Active</p>
                  <p className="text-xs text-gray-500">Enable this rate configuration</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    form.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Fare Preview */}
              {form.base_fare !== undefined && form.base_fare > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Fare Preview</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[11px] text-gray-400">1 km</p>
                      <p className="text-lg font-bold text-gray-900">₱{Math.max((form.base_fare || 0) + (form.rate_per_km || 0) * 1, form.minimum_fare || 0).toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">5 km</p>
                      <p className="text-lg font-bold text-gray-900">₱{Math.max((form.base_fare || 0) + (form.rate_per_km || 0) * 5, form.minimum_fare || 0).toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">10 km</p>
                      <p className="text-lg font-bold text-gray-900">₱{Math.max((form.base_fare || 0) + (form.rate_per_km || 0) * 10, form.minimum_fare || 0).toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 rounded-b-2xl flex items-center gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingRate ? 'Update Rate' : 'Create Rate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
