import { useState, useEffect, useRef } from 'react';
import { promoService } from '../services/api';
import { ToastType } from '../components/Toast';

interface UsePromoCodeOptions {
  baseFare: number;
  serviceType: 'rides' | 'deliveries';
  showToast: (message: string, type: ToastType) => void;
  /** Dependencies that should reset the promo when changed (e.g. location coords, vehicle type) */
  resetDeps: any[];
}

interface UsePromoCodeResult {
  promoCode: string;
  setPromoCode: (code: string) => void;
  promoDiscount: number;
  promoApplied: boolean;
  applyingPromo: boolean;
  handleApplyPromo: () => Promise<void>;
  handleRemovePromo: () => void;
}

export function usePromoCode({
  baseFare,
  serviceType,
  showToast,
  resetDeps,
}: UsePromoCodeOptions): UsePromoCodeResult {
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const isFirstRender = useRef(true);

  // Reset promo when fare basis changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (promoApplied) {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(false);
    }
  }, resetDeps);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    if (baseFare <= 0) {
      showToast('Select locations first to apply promo.', 'warning');
      return;
    }
    setApplyingPromo(true);
    try {
      const res = await promoService.applyPromo(promoCode.trim(), baseFare, serviceType);
      const discount = res.data?.data?.discount || 0;
      if (discount > 0) {
        setPromoDiscount(discount);
        setPromoApplied(true);
        showToast(`Promo applied! ₱${discount.toFixed(0)} off`, 'success');
      } else {
        showToast('Promo code is not valid.', 'warning');
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Invalid promo code';
      showToast(msg, 'error');
    } finally {
      setApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setPromoDiscount(0);
    setPromoApplied(false);
  };

  return {
    promoCode,
    setPromoCode,
    promoDiscount,
    promoApplied,
    applyingPromo,
    handleApplyPromo,
    handleRemovePromo,
  };
}
