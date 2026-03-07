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
import { orderService, walletService } from '../../services/api';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import { RESPONSIVE, verticalScale, moderateScale, fontScale, isIOS } from '../../utils/responsive';

export default function CartScreen({ route, navigation }: any) {
  const { store, cartItems: initialCartItems } = route.params || {};

  const [cartItems, setCartItems] = useState(initialCartItems || []);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkingOut, setCheckingOut] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('Current Location');

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
  const deliveryFee = 30;
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + deliveryFee + tax;

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
              await orderService.createOrder({
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
              Alert.alert('Success', 'Your order has been placed!', [
                {
                  text: 'OK',
                  onPress: () => navigation.navigate('Orders'),
                },
              ]);
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cart</Text>
        <TouchableOpacity onPress={() => {
          if (cartItems.length === 0) return;
          Alert.alert('Clear Cart', 'Remove all items from your cart?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => setCartItems([]) },
          ]);
        }}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Store Info */}
        {!!store && (
          <View style={styles.storeCard}>
            <Ionicons name="storefront" size={24} color="#EF4444" />
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
            </View>
          </View>
        )}

        {/* Cart Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items ({cartItems.length})</Text>
          {cartItems.map((item: any) => (
            <View key={item.id} style={styles.cartItem}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              ) : (
                <View style={[styles.itemImage, { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="fast-food-outline" size={24} color="#D1D5DB" />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>₱{((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(0)}</Text>
              </View>
              <View style={styles.quantityControl}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, -1)}
                >
                  <Ionicons name="remove" size={18} color="#EF4444" />
                </TouchableOpacity>
                <Text style={styles.quantity}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.id, 1)}
                >
                  <Ionicons name="add" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeItem(item.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}

          {cartItems.length === 0 && (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>Your cart is empty</Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.browseButtonText}>Back to Store</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {cartItems.length > 0 && (
          <>
            {/* Payment Method */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Method</Text>
              <PaymentMethodSelector
                selected={paymentMethod}
                onSelect={setPaymentMethod}
                accentColor="#EF4444"
              />
            </View>

            {/* Order Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Order Summary</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>₱{subtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>₱{deliveryFee}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax (5%)</Text>
                  <Text style={styles.summaryValue}>₱{tax.toFixed(0)}</Text>
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

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>

      {/* Checkout Button */}
      {cartItems.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₱{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.checkoutButton, checkingOut && styles.checkoutButtonDisabled]}
            onPress={handleCheckout}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.checkoutButtonText}>Place Order</Text>
                <Ionicons name="arrow-forward" size={20} color="#ffffff" />
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
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: moderateScale(16),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  clearText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#EF4444',
    fontWeight: '600',
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
    padding: moderateScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  storeInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  storeName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  storeTime: {
    fontSize: fontScale(13),
    color: '#6B7280',
    marginTop: 2,
  },
  section: {
    marginTop: verticalScale(24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemImage: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: RESPONSIVE.borderRadius.small,
    resizeMode: 'cover',
  },
  itemInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  itemName: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: verticalScale(4),
  },
  itemPrice: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(4),
  },
  quantityButton: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginHorizontal: moderateScale(12),
  },
  removeButton: {
    padding: moderateScale(8),
    marginLeft: moderateScale(8),
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: verticalScale(16),
    marginBottom: verticalScale(24),
  },
  browseButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: moderateScale(24),
    paddingVertical: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  browseButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paymentOption: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.small,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: moderateScale(8),
    marginBottom: verticalScale(8),
    backgroundColor: '#ffffff',
  },
  paymentOptionActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  paymentText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
  },
  paymentTextActive: {
    color: '#ffffff',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    padding: moderateScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: verticalScale(12),
  },
  summaryLabel: {
    fontSize: fontScale(15),
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: fontScale(15),
    color: '#1F2937',
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: verticalScale(8),
  },
  summaryTotalLabel: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  summaryTotalValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: RESPONSIVE.paddingHorizontal,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  totalLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  checkoutButton: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginRight: moderateScale(8),
  },
});
