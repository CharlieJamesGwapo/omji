import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storeService } from '../../services/api';

const { width } = Dimensions.get('window');

interface StoreItem {
  id: number;
  name: string;
  category: string;
  rating: number;
  address: string;
  phone: string;
  description: string;
  is_verified: boolean;
}

export default function StoresScreen({ navigation }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    { id: 'all', name: 'All', icon: 'grid-outline' },
    { id: 'restaurant', name: 'Food', icon: 'fast-food-outline' },
    { id: 'grocery', name: 'Grocery', icon: 'cart-outline' },
    { id: 'pharmacy', name: 'Pharmacy', icon: 'medical-outline' },
    { id: 'retail', name: 'Retail', icon: 'bag-outline' },
  ];

  const fetchStores = useCallback(async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const response = await storeService.getStores(category);
      const data = response.data.data;
      setStores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching stores:', error);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    setLoading(true);
    fetchStores();
  }, [fetchStores]);

  const filteredStores = (stores || []).filter((store) => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (store.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const featuredStores = (stores || []).filter(store => store.is_verified);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stores</Text>
        <TouchableOpacity>
          <Ionicons name="heart-outline" size={24} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores or items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesSection}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Ionicons
              name={category.icon as any}
              size={18}
              color={selectedCategory === category.id ? '#ffffff' : '#6B7280'}
            />
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextActive,
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Featured Stores */}
        {selectedCategory === 'all' && searchQuery === '' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredContainer}
            >
              {featuredStores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={styles.featuredCard}
                  onPress={() => navigation.navigate('StoreDetail', { store })}
                >
                  <View style={styles.featuredImageContainer}>
                    <View style={[styles.featuredImage, { backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="storefront" size={40} color="#3B82F6" />
                    </View>
                    <View style={styles.featuredBadge}>
                      <Ionicons name="star" size={12} color="#FBBF24" />
                      <Text style={styles.featuredBadgeText}>{store.rating?.toFixed(1) || '0'}</Text>
                    </View>
                  </View>
                  <Text style={styles.featuredName}>{store.name}</Text>
                  <View style={styles.featuredInfo}>
                    <Ionicons name="location-outline" size={14} color="#6B7280" />
                    <Text style={styles.featuredInfoText} numberOfLines={1}>{store.address || store.category}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* All Stores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'all' ? 'All Stores' : categories.find(c => c.id === selectedCategory)?.name}
            {' '}({filteredStores.length})
          </Text>
          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : filteredStores.map((store) => (
            <TouchableOpacity
              key={store.id}
              style={styles.storeCard}
              onPress={() => navigation.navigate('StoreDetail', { store })}
            >
              <View style={[styles.storeImage, { backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="storefront" size={32} color="#3B82F6" />
              </View>
              <View style={styles.storeContent}>
                <View style={styles.storeHeader}>
                  <Text style={styles.storeName}>{store.name}</Text>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.ratingText}>{store.rating?.toFixed(1) || '0'}</Text>
                  </View>
                </View>
                <View style={styles.storeTags}>
                  <Text style={styles.tag}>{store.category}</Text>
                  {store.is_verified && <Text style={[styles.tag, { backgroundColor: '#DCFCE7', color: '#166534' }]}>Verified</Text>}
                </View>
                <View style={styles.storeFooter}>
                  <View style={styles.storeInfo}>
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <Text style={styles.storeInfoText} numberOfLines={1}>{store.address || 'Balingasag'}</Text>
                  </View>
                  {store.phone && (
                    <View style={styles.storeInfo}>
                      <Ionicons name="call-outline" size={16} color="#6B7280" />
                      <Text style={styles.storeInfoText}>{store.phone}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {filteredStores.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="storefront-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>No stores found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#1F2937',
  },
  categoriesSection: {
    backgroundColor: '#ffffff',
  },
  categoriesContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    marginLeft: 6,
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  featuredContainer: {
    paddingHorizontal: 20,
  },
  featuredCard: {
    width: 200,
    marginRight: 16,
  },
  featuredImageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  featuredImage: {
    width: 200,
    height: 120,
    resizeMode: 'cover',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  featuredBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 4,
  },
  featuredName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
  },
  featuredInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  featuredInfoText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  featuredDivider: {
    color: '#D1D5DB',
    marginHorizontal: 6,
  },
  storeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  storeImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  storeContent: {
    padding: 16,
  },
  storeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
    marginLeft: 4,
  },
  storeTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  tag: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 8,
  },
  storeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeInfoText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
