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
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import { storeService, favoritesService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';

export default function StoreDetailScreen({ route, navigation }: any) {
  const { store } = route.params || {};
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartItems, setCartItems] = useState<Record<number, { item: any; quantity: number }>>({});
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (store?.id) fetchMenu();
  }, [store?.id]);

  useEffect(() => {
    if (store?.id) {
      favoritesService.checkFavorite('store', store.id)
        .then(res => setIsFavorite(res.data?.data?.is_favorite || false))
        .catch(() => {});
    }
  }, [store?.id]);

  if (!store?.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <Ionicons name="alert-circle-outline" size={moderateScale(48)} color={COLORS.error} />
        <Text style={{ fontSize: fontScale(16), color: COLORS.gray500, marginTop: verticalScale(12) }}>Store not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: verticalScale(16), paddingHorizontal: moderateScale(24), paddingVertical: verticalScale(12), backgroundColor: COLORS.store, borderRadius: moderateScale(8) }}>
          <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFavorite = async () => {
    const prev = isFavorite;
    setIsFavorite(!prev);
    try {
      if (prev) {
        const res = await favoritesService.getFavorites('store');
        const fav = (res.data?.data || []).find((f: any) => f.item_id === store?.id);
        if (fav) await favoritesService.deleteFavorite(fav.id);
      } else {
        await favoritesService.addFavorite({ type: 'store', item_id: store?.id });
      }
    } catch {
      setIsFavorite(prev);
      Alert.alert('Error', 'Could not update favorite. Please try again.');
    }
  };

  const fetchMenu = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await storeService.getStoreMenu(store?.id);
      const data = response.data?.data || response.data;
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
          <View style={[styles.headerImage, { backgroundColor: COLORS.storeBg, alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), backgroundColor: COLORS.store, alignItems: 'center', justifyContent: 'center', ...SHADOWS.lg }}>
              <Ionicons name="storefront" size={moderateScale(40)} color={COLORS.white} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={moderateScale(24)} color={COLORS.gray800} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={toggleFavorite}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
            accessibilityRole="button"
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={moderateScale(24)} color={isFavorite ? COLORS.error : COLORS.gray800} />
          </TouchableOpacity>
        </View>

        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{store?.name || 'Store'}</Text>
          <View style={styles.storeMetrics}>
            <View style={styles.metricItem}>
              <Ionicons name="star" size={moderateScale(16)} color={COLORS.warningDark} />
              <Text style={styles.metricText}>{store?.rating ? Number(store.rating).toFixed(1) : 'N/A'}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={moderateScale(16)} color={COLORS.gray500} />
              <Text style={styles.metricText}>25-40 min</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="bicycle-outline" size={moderateScale(16)} color={COLORS.gray500} />
              <Text style={styles.metricText}>Delivery</Text>
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
                accessibilityLabel={`Filter by ${category}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategory === category }}
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
              {[1, 2, 3].map((i) => (
                <View key={`menu-skeleton-${i}`} style={[styles.productCard, { opacity: 0.5 }]}>
                  <View style={[styles.productImage, { backgroundColor: COLORS.gray100 }]} />
                  <View style={styles.productInfo}>
                    <View style={{ backgroundColor: COLORS.gray200, height: verticalScale(14), width: '70%', borderRadius: moderateScale(4), marginBottom: verticalScale(6) }} />
                    <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(12), width: '90%', borderRadius: moderateScale(4), marginBottom: verticalScale(8) }} />
                    <View style={{ backgroundColor: COLORS.gray200, height: verticalScale(16), width: '30%', borderRadius: moderateScale(4) }} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {!loading && !!error && (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={moderateScale(48)} color={COLORS.gray300} />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchMenu} accessibilityLabel="Retry loading menu" accessibilityRole="button">
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && filteredProducts.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant-outline" size={moderateScale(48)} color={COLORS.gray300} />
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
                  <View style={[styles.productImage, { backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="fast-food-outline" size={moderateScale(32)} color={COLORS.gray300} />
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
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityLabel={`Add ${product.name} to cart`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="add" size={moderateScale(20)} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>

      {/* Cart Button */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartButton}
          onPress={handleViewCart}
          activeOpacity={0.8}
          accessibilityLabel={`View cart with ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
          accessibilityRole="button"
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Ionicons name="cart" size={moderateScale(24)} color={COLORS.white} />
          <Text style={styles.cartButtonText}>View Cart</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  storeHeader: {
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: verticalScale(200),
    resizeMode: 'cover',
  },
  backButton: {
    position: 'absolute',
    top: isIOS ? verticalScale(50) : verticalScale(35),
    left: RESPONSIVE.paddingHorizontal,
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  favoriteButton: {
    position: 'absolute',
    top: isIOS ? verticalScale(50) : verticalScale(35),
    right: RESPONSIVE.paddingHorizontal,
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  storeInfo: {
    backgroundColor: COLORS.white,
    padding: RESPONSIVE.paddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  storeName: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
  },
  storeMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginLeft: moderateScale(4),
  },
  metricDivider: {
    width: 1,
    height: moderateScale(16),
    backgroundColor: COLORS.gray300,
    marginHorizontal: moderateScale(12),
  },
  storeTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(6),
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(4),
    marginRight: moderateScale(8),
    marginTop: verticalScale(4),
  },
  tagText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  categoryScroll: {
    backgroundColor: COLORS.white,
  },
  categoryContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(16),
  },
  categoryChip: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(8),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    backgroundColor: COLORS.gray100,
    marginRight: moderateScale(8),
  },
  categoryChipActive: {
    backgroundColor: COLORS.store,
  },
  categoryText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  categoryTextActive: {
    color: COLORS.white,
  },
  productsSection: {
    padding: RESPONSIVE.paddingHorizontal,
  },
  loadingContainer: {
    paddingVertical: verticalScale(8),
  },
  loadingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  retryButton: {
    marginTop: verticalScale(16),
    backgroundColor: COLORS.store,
    paddingHorizontal: moderateScale(24),
    paddingVertical: verticalScale(10),
    borderRadius: RESPONSIVE.borderRadius.small,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginBottom: verticalScale(16),
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  productImage: {
    width: moderateScale(100),
    height: moderateScale(100),
    resizeMode: 'cover',
  },
  productInfo: {
    flex: 1,
    padding: moderateScale(12),
  },
  productName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(4),
  },
  productDescription: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    marginBottom: verticalScale(8),
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.store,
  },
  addToCartRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inCartText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.success,
    fontWeight: '600',
    marginRight: moderateScale(8),
  },
  addButton: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.store,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  cartButton: {
    position: 'absolute',
    bottom: verticalScale(20),
    left: RESPONSIVE.paddingHorizontal,
    right: RESPONSIVE.paddingHorizontal,
    flexDirection: 'row',
    backgroundColor: COLORS.store,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.colored(COLORS.store),
  },
  cartBadge: {
    position: 'absolute',
    top: -verticalScale(8),
    left: RESPONSIVE.paddingHorizontal,
    backgroundColor: COLORS.warningDark,
    borderRadius: RESPONSIVE.borderRadius.medium,
    minWidth: moderateScale(24),
    height: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(6),
  },
  cartBadgeText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  cartButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginLeft: moderateScale(8),
  },
});
