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
import { orderService } from '../../services/api';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';

export default function CartScreen({ route, navigation }: any) {
  const { store, cartItems: initialCartItems } = route.params || {};

  const [cartItems, setCartItems] = useState(initialCartItems || []);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkingOut, setCheckingOut] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const deliveryAddress = 'Current Location';

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
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

  const subtotal = cartItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
  const deliveryFee = store?.deliveryFee || 30;
  const serviceFee = 10;
  const total = subtotal + deliveryFee + serviceFee;

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty!');
      return;
    }

    Alert.alert(
      'Confirm Order',
      `Total: ₱${total}\nPayment: ${paymentMethod.toUpperCase()}\n\nProceed with order?`,
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
                tax: serviceFee,
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
        <TouchableOpacity onPress={() => setCartItems([])}>
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
              {!!(store.deliveryTime) && (
                <Text style={styles.storeTime}>{store.deliveryTime}</Text>
              )}
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
                <Text style={styles.itemPrice}>₱{item.price * item.quantity}</Text>
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
                  <Text style={styles.summaryValue}>₱{subtotal}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>₱{deliveryFee}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Service Fee</Text>
                  <Text style={styles.summaryValue}>₱{serviceFee}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>₱{total}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Checkout Button */}
      {cartItems.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₱{total}</Text>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  clearText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  storeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  storeTime: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginHorizontal: 12,
  },
  removeButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paymentOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  paymentOptionActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  paymentTextActive: {
    color: '#ffffff',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  summaryTotalValue: {
    fontSize: 20,
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
    padding: 20,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  checkoutButton: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
});
