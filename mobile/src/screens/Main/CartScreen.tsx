import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { orderService, walletService, ratesService } from '../../services/api';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';

export default function CartScreen({ route, navigation }: any) {
  const { store, cartItems: initialCartItems } = route.params || {};

  const [cartItems, setCartItems] = useState(initialCartItems || []);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkingOut, setCheckingOut] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('Current Location');
  const [deliveryFee, setDeliveryFee] = useState(30);

  useEffect(() => {
    (async () => {
      try {
        const res = await ratesService.getRates();
        const rates = res.data?.data;
        if (Array.isArray(rates)) {
          const orderRate = rates.find((r: any) => r.service_type === 'order' && r.is_active);
          if (orderRate?.base_fare) {
            setDeliveryFee(orderRate.base_fare);
          }
        }
      } catch (e) {
        // Keep fallback delivery fee
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'We need your location to deliver your order. Please enable location access in Settings.',
            [{ text: 'OK' }]
          );
          return;
        }
        const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const loc = await Promise.race([locationPromise, timeoutPromise]);
        if (!loc || !('coords' in loc)) return;
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const result = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (result?.[0]) {
          const addr = result[0];
          const parts = [addr.streetNumber, addr.street, addr.subregion, addr.city].filter(Boolean);
          setDeliveryAddress(parts.length > 0 ? parts.join(', ') : 'Current Location');
        }
      } catch (e) {
        console.log('Location error:', e);
      }
    })();
  }, []);

  const updateQuantity = (id: number, delta: number) => {
    setCartItems((items: any[]) =>
      items.map((item: any) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      ).filter((item: any) => item.quantity > 0)
    );
  };

  const removeItem = (id: number) => {
    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setCartItems((items: any[]) => items.filter((item: any) => item.id !== id)),
        },
      ]
    );
  };

  const subtotal = cartItems.reduce((sum: number, item: any) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + deliveryFee + tax;
  const itemCount = cartItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty!');
      return;
    }

    if (!userLocation?.latitude) {
      Alert.alert('Location Required', 'Could not determine your delivery location. Please enable location services and try again.');
      return;
    }

    // Check wallet balance if paying with wallet
    if (paymentMethod === 'wallet') {
      try {
        const walletRes = await walletService.getBalance();
        const balance = walletRes.data?.data?.balance ?? walletRes.data?.balance ?? 0;
        if (balance < total) {
          Alert.alert('Insufficient Balance', `Your wallet balance (₱${balance.toFixed(0)}) is less than the total (₱${total.toFixed(0)}). Please top up or choose another payment method.`);
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not verify wallet balance. Please try again.');
        return;
      }
    }

    Alert.alert(
      'Confirm Order',
      `Total: ₱${total.toFixed(2)}\nPayment: ${paymentMethod.toUpperCase()}\n\nProceed with order?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Place Order',
          onPress: async () => {
            setCheckingOut(true);
            try {
              const orderResponse = await orderService.createOrder({
                store_id: store?.id,
                items: cartItems.map((item: any) => ({
                  item_id: item.id,
                  quantity: item.quantity,
                  price: item.price,
                })),
                subtotal,
                delivery_fee: deliveryFee,
                tax,
                total_amount: total,
                payment_method: paymentMethod,
                delivery_location: deliveryAddress,
                delivery_latitude: userLocation?.latitude || 0,
                delivery_longitude: userLocation?.longitude || 0,
              });
              if (paymentMethod === 'gcash' || paymentMethod === 'maya') {
                navigation.navigate('Payment', {
                  type: paymentMethod,
                  amount: total,
                  serviceType: 'order',
                });
              } else {
                Alert.alert('Success', 'Your order has been placed!', [
                  {
                    text: 'OK',
                    onPress: () => navigation.navigate('Orders'),
                  },
                ]);
              }
            } catch (error: any) {
              Alert.alert(
                'Order Failed',
                error.response?.data?.error || 'Failed to place order. Please try again.'
              );
            } finally {
              setCheckingOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Cart</Text>
          {cartItems.length > 0 && (
            <Text style={styles.headerSubtitle}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => {
          if (cartItems.length === 0) return;
          Alert.alert('Clear Cart', 'Remove all items from your cart?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => setCartItems([]) },
          ]);
        }}>
          <Text style={[styles.clearText, cartItems.length === 0 && { opacity: 0.3 }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Store Info */}
        {!!store && (
          <View style={styles.storeCard}>
            <View style={styles.storeIconWrap}>
              <Ionicons name="storefront" size={moderateScale(22)} color={COLORS.primary} />
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeCategory}>{store.category || 'Restaurant'}</Text>
            </View>
            <View style={styles.storeDeliveryBadge}>
              <Ionicons name="bicycle-outline" size={moderateScale(14)} color={COLORS.success} />
              <Text style={styles.storeDeliveryText}>25-45 min</Text>
            </View>
          </View>
        )}

        {/* Delivery Info Section */}
        {cartItems.length > 0 && (
          <View style={styles.deliverySection}>
            <View style={styles.deliverySectionHeader}>
              <Ionicons name="location" size={moderateScale(18)} color={COLORS.primary} />
              <Text style={styles.deliverySectionTitle}>Delivery Address</Text>
            </View>
            <View style={styles.deliveryAddressCard}>
              <View style={styles.deliveryAddressIcon}>
                <Ionicons name="navigate" size={moderateScale(18)} color={COLORS.accent} />
              </View>
              <View style={styles.deliveryAddressInfo}>
                <Text style={styles.deliveryAddressLabel}>Deliver to</Text>
                <Text style={styles.deliveryAddressText} numberOfLines={2}>{deliveryAddress}</Text>
              </View>
              <View style={styles.deliveryTimeBadge}>
                <Ionicons name="time-outline" size={moderateScale(14)} color={COLORS.success} />
                <Text style={styles.deliveryTimeText}>30-45m</Text>
              </View>
            </View>
          </View>
        )}

        {/* Cart Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items ({cartItems.length})</Text>
          {cartItems.map((item: any) => (
            <View key={item.id} style={styles.cartItem}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              ) : (
                <View style={styles.itemImagePlaceholder}>
                  <Ionicons name="fast-food-outline" size={moderateScale(24)} color={COLORS.gray300} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemUnitPrice}>₱{(Number(item.price) || 0).toFixed(0)} each</Text>
                <Text style={styles.itemPrice}>₱{((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(0)}</Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeItem(item.id)}
                >
                  <Ionicons name="trash-outline" size={moderateScale(16)} color={COLORS.error} />
                </TouchableOpacity>
                <View style={styles.quantityControl}>
                  <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item.id, -1)}
                  >
                    <Ionicons name="remove" size={moderateScale(16)} color={COLORS.primary} />
                  </TouchableOpacity>
                  <View style={styles.quantityDisplay}>
                    <Text style={styles.quantity}>{item.quantity}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.quantityButton, styles.quantityButtonAdd]}
                    onPress={() => updateQuantity(item.id, 1)}
                  >
                    <Ionicons name="add" size={moderateScale(16)} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {cartItems.length === 0 && (
            <View style={styles.emptyCart}>
              <View style={styles.emptyCartIconWrap}>
                <Ionicons name="cart-outline" size={moderateScale(56)} color={COLORS.gray300} />
              </View>
              <Text style={styles.emptyTitle}>Your cart is empty</Text>
              <Text style={styles.emptySubtext}>Browse the menu to add items to your cart</Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="storefront-outline" size={moderateScale(18)} color={COLORS.white} />
                <Text style={styles.browseButtonText}>Back to Store</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {cartItems.length > 0 && (
          <>
            {/* Payment Method */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="card-outline" size={moderateScale(18)} color={COLORS.gray800} />
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Payment Method</Text>
              </View>
              <PaymentMethodSelector
                selected={paymentMethod}
                onSelect={setPaymentMethod}
                accentColor={COLORS.primary}
              />
            </View>

            {/* Order Summary */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="receipt-outline" size={moderateScale(18)} color={COLORS.gray800} />
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Order Summary</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</Text>
                  <Text style={styles.summaryValue}>₱{subtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryLabelRow}>
                    <Ionicons name="bicycle-outline" size={moderateScale(14)} color={COLORS.gray500} />
                    <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  </View>
                  <Text style={styles.summaryValue}>₱{deliveryFee.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryLabelRow}>
                    <Ionicons name="document-text-outline" size={moderateScale(14)} color={COLORS.gray500} />
                    <Text style={styles.summaryLabel}>Tax (5%)</Text>
                  </View>
                  <Text style={styles.summaryValue}>₱{tax.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>₱{total.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: verticalScale(120) }} />
      </ScrollView>

      {/* Checkout Footer */}
      {cartItems.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View>
              <Text style={styles.footerLabel}>Total Amount</Text>
              <Text style={styles.footerTotal}>₱{total.toFixed(2)}</Text>
            </View>
            <View style={styles.footerPaymentBadge}>
              <Ionicons
                name={paymentMethod === 'wallet' ? 'wallet' : paymentMethod === 'gcash' ? 'phone-portrait' : 'cash'}
                size={moderateScale(14)}
                color={COLORS.accent}
              />
              <Text style={styles.footerPaymentText}>{paymentMethod === 'gcash' ? 'GCash' : paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.checkoutButton, checkingOut && styles.checkoutButtonDisabled]}
            onPress={handleCheckout}
            disabled={checkingOut}
            activeOpacity={0.8}
          >
            {checkingOut ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="bag-check" size={moderateScale(20)} color={COLORS.white} />
                <Text style={styles.checkoutButtonText}>Place Order - ₱{total.toFixed(2)}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: moderateScale(16),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerBackBtn: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  headerSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginTop: verticalScale(1),
  },
  clearText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.primary,
    fontWeight: '600',
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    padding: moderateScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    ...SHADOWS.md,
  },
  storeIconWrap: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  storeName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  storeCategory: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  storeDeliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(6),
    borderRadius: RESPONSIVE.borderRadius.small,
    gap: moderateScale(4),
  },
  storeDeliveryText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.success,
  },
  // Delivery Info Section
  deliverySection: {
    marginTop: verticalScale(16),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  deliverySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
    gap: moderateScale(6),
  },
  deliverySectionTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  deliveryAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderStyle: 'dashed',
  },
  deliveryAddressIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryAddressInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  deliveryAddressLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(2),
  },
  deliveryAddressText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray800,
  },
  deliveryTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    backgroundColor: COLORS.successBg,
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(4),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  deliveryTimeText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.success,
  },
  section: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
    marginBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  itemImage: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: RESPONSIVE.borderRadius.medium,
    resizeMode: 'cover',
  },
  itemImagePlaceholder: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
    justifyContent: 'center',
  },
  itemName: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: verticalScale(4),
  },
  itemUnitPrice: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(4),
  },
  itemPrice: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  itemActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.small,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  quantityButton: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: RESPONSIVE.borderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonAdd: {
    backgroundColor: COLORS.primary,
    borderTopRightRadius: moderateScale(7),
    borderBottomRightRadius: moderateScale(7),
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  quantityDisplay: {
    paddingHorizontal: moderateScale(12),
  },
  quantity: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  removeButton: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyCartIconWrap: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(20),
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginBottom: verticalScale(24),
    textAlign: 'center',
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: moderateScale(24),
    paddingVertical: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.primary),
  },
  browseButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    padding: moderateScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    ...SHADOWS.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  summaryLabel: {
    fontSize: fontScale(15),
    color: COLORS.gray500,
  },
  summaryValue: {
    fontSize: fontScale(15),
    color: COLORS.gray800,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.gray200,
    marginVertical: verticalScale(4),
  },
  summaryTotalLabel: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  summaryTotalValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(12),
    paddingBottom: isIOS ? verticalScale(28) : verticalScale(16),
    ...SHADOWS.lg,
  },
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  footerLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    marginBottom: verticalScale(2),
  },
  footerTotal: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  footerPaymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: RESPONSIVE.borderRadius.small,
    gap: moderateScale(6),
  },
  footerPaymentText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.accent,
  },
  checkoutButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.primary),
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
});
