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
import { storeService } from '../../services/api';

export default function StoreDetailScreen({ route, navigation }: any) {
  const { store } = route.params || {};
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartItems, setCartItems] = useState<Record<number, { item: any; quantity: number }>>({});
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchMenu();
  }, []);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await storeService.getStoreMenu(store?.id);
      const data = response.data;
      const items = Array.isArray(data) ? data : data?.menu || data?.items || [];
      setMenuItems(items);
    } catch (err: any) {
      setError('Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const categories = ['All', ...Array.from(new Set(menuItems.map((p: any) => p.category).filter(Boolean)))];

  const filteredProducts = selectedCategory === 'All'
    ? menuItems
    : menuItems.filter((p: any) => p.category === selectedCategory);

  const handleAddToCart = (product: any) => {
    setCartItems(prev => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          item: product,
          quantity: (existing?.quantity || 0) + 1,
        },
      };
    });
  };

  const cartCount = Object.values(cartItems).reduce((sum, ci) => sum + ci.quantity, 0);

  const handleViewCart = () => {
    if (cartCount === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty. Add some items first!');
      return;
    }
    const items = Object.values(cartItems).map(ci => ({
      id: ci.item.id,
      name: ci.item.name,
      price: ci.item.price,
      quantity: ci.quantity,
      image: ci.item.image || '',
    }));
    navigation.navigate('Cart', { store, cartItems: items });
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.storeHeader}>
          <View style={[styles.headerImage, { backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="storefront" size={64} color="#3B82F6" />
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.favoriteButton}>
            <Ionicons name="heart-outline" size={24} color="#1F2937" />
          </TouchableOpacity>
        </View>

        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{store?.name || 'Store'}</Text>
          <View style={styles.storeMetrics}>
            <View style={styles.metricItem}>
              <Ionicons name="star" size={16} color="#FBBF24" />
              <Text style={styles.metricText}>{store?.rating?.toFixed(1) || 'N/A'}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.metricText}>{store?.deliveryTime || '20-30 min'}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.metricText}>₱{store?.deliveryFee || 0}</Text>
            </View>
          </View>
          {!!(store?.category) && (
            <View style={styles.storeTags}>
              <View style={styles.tagChip}>
                <Text style={styles.tagText}>{store.category}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Category Filter */}
        {categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContent}
          >
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryChip,
                  selectedCategory === category && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === category && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Products */}
        <View style={styles.productsSection}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#EF4444" />
              <Text style={styles.loadingText}>Loading menu...</Text>
            </View>
          )}

          {!loading && !!error && (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchMenu}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No menu items available</Text>
            </View>
          )}

          {filteredProducts.map((product: any) => {
            const inCart = cartItems[product.id]?.quantity || 0;
            return (
              <View key={product.id} style={styles.productCard}>
                {product.image ? (
                  <Image source={{ uri: product.image }} style={styles.productImage} />
                ) : (
                  <View style={[styles.productImage, { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="fast-food-outline" size={32} color="#D1D5DB" />
                  </View>
                )}
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  {!!(product.description) && (
                    <Text style={styles.productDescription} numberOfLines={2}>
                      {product.description}
                    </Text>
                  )}
                  <View style={styles.productFooter}>
                    <Text style={styles.productPrice}>₱{product.price}</Text>
                    <View style={styles.addToCartRow}>
                      {inCart > 0 && (
                        <Text style={styles.inCartText}>{inCart} in cart</Text>
                      )}
                      <TouchableOpacity
                        style={[styles.addButton, !product.available && styles.addButtonDisabled]}
                        onPress={() => handleAddToCart(product)}
                        disabled={product.available === false}
                      >
                        <Ionicons name="add" size={20} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Cart Button */}
      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartButton} onPress={handleViewCart}>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Ionicons name="cart" size={24} color="#ffffff" />
          <Text style={styles.cartButtonText}>View Cart</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  storeHeader: {
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  storeInfo: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  storeName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  storeMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
  },
  metricDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 12,
  },
  storeTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginTop: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#6B7280',
  },
  categoryScroll: {
    backgroundColor: '#ffffff',
  },
  categoryContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#EF4444',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  productsSection: {
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
  },
  productInfo: {
    flex: 1,
    padding: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  addToCartRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inCartText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginRight: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  cartButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    left: 20,
    backgroundColor: '#FBBF24',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  cartButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
