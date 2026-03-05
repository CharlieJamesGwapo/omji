import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function StoreDetailScreen({ route, navigation }: any) {
  const { store } = route.params || {};
  const [cartCount, setCartCount] = useState(0);

  const products = [
    {
      id: '1',
      name: 'Chickenjoy with Rice',
      description: 'World-famous crispy fried chicken with rice',
      price: 89,
      image: 'https://via.placeholder.com/150?text=Chickenjoy',
      category: 'Meals',
      available: true,
    },
    {
      id: '2',
      name: 'Jolly Spaghetti',
      description: 'Sweet-style spaghetti with hotdog slices',
      price: 65,
      image: 'https://via.placeholder.com/150?text=Spaghetti',
      category: 'Meals',
      available: true,
    },
    {
      id: '3',
      name: 'Burger Steak',
      description: 'Burger patties with mushroom gravy and rice',
      price: 75,
      image: 'https://via.placeholder.com/150?text=Burger+Steak',
      category: 'Meals',
      available: true,
    },
    {
      id: '4',
      name: 'Palabok',
      description: 'Filipino-style noodles with special sauce',
      price: 55,
      image: 'https://via.placeholder.com/150?text=Palabok',
      category: 'Meals',
      available: true,
    },
    {
      id: '5',
      name: 'Peach Mango Pie',
      description: 'Hot and crispy fruit pie',
      price: 35,
      image: 'https://via.placeholder.com/150?text=Pie',
      category: 'Desserts',
      available: true,
    },
    {
      id: '6',
      name: 'Sundae',
      description: 'Soft serve ice cream with chocolate or ube',
      price: 25,
      image: 'https://via.placeholder.com/150?text=Sundae',
      category: 'Desserts',
      available: true,
    },
  ];

  const categories = ['All', ...new Set(products.map(p => p.category))];
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter(p => p.category === selectedCategory);

  const handleAddToCart = (product: any) => {
    setCartCount(cartCount + 1);
    Alert.alert('Added to Cart', `${product.name} has been added to your cart`);
  };

  const handleViewCart = () => {
    if (cartCount === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty. Add some items first!');
      return;
    }
    navigation.navigate('Cart', { store });
  };

  return (
    <View style={styles.container}>
      {/* Store Header */}
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
              <Text style={styles.metricText}>{store.rating?.toFixed(1) || 'N/A'}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.metricText}>{store.deliveryTime || '20-30 min'}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.metricText}>₱{store.deliveryFee || 0}</Text>
            </View>
          </View>
          {(store.tags || [store.category]).length > 0 && (
            <View style={styles.storeTags}>
              {(store.tags || [store.category].filter(Boolean)).map((tag: string, index: number) => (
                <View key={index} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Category Filter */}
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

        {/* Products */}
        <View style={styles.productsSection}>
          {filteredProducts.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <Image source={{ uri: product.image }} style={styles.productImage} />
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productDescription} numberOfLines={2}>
                  {product.description}
                </Text>
                <View style={styles.productFooter}>
                  <Text style={styles.productPrice}>₱{product.price}</Text>
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => handleAddToCart(product)}
                  >
                    <Ionicons name="add" size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
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
