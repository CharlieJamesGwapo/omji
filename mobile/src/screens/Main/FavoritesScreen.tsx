import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { favoritesService } from '../../services/api';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface FavoriteItem {
  id: number;
  type: string;
  item_id: number;
  name: string;
  category: string;
  rating: number;
  address: string;
  logo?: string;
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'store', label: 'Stores' },
];

export default function FavoritesScreen({ navigation }: any) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchFavorites = useCallback(async () => {
    try {
      const typeParam = activeFilter === 'all' ? undefined : activeFilter;
      const response = await favoritesService.getFavorites(typeParam);
      const data = response.data?.data;
      setFavorites(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      setFavorites([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchFavorites();
  }, [fetchFavorites]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFavorites();
  }, [fetchFavorites]);

  const handleUnfavorite = (item: FavoriteItem) => {
    Alert.alert(
      'Remove Favorite',
      `Are you sure you want to remove "${item.name || 'this item'}" from your favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await favoritesService.deleteFavorite(item.id);
              setFavorites((prev) => prev.filter((f) => f.id !== item.id));
            } catch (error) {
              console.error('Error removing favorite:', error);
              Alert.alert('Error', 'Failed to remove favorite. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleCardPress = (item: FavoriteItem) => {
    if (item.type === 'store') {
      navigation.navigate('StoreDetail', { store: { id: item.item_id, name: item.name, category: item.category, rating: item.rating, logo: item.logo, address: item.address } });
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalf = (rating || 0) - fullStars >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Ionicons key={i} name="star" size={moderateScale(14)} color="#FBBF24" />,
        );
      } else if (i === fullStars && hasHalf) {
        stars.push(
          <Ionicons key={i} name="star-half" size={moderateScale(14)} color="#FBBF24" />,
        );
      } else {
        stars.push(
          <Ionicons key={i} name="star-outline" size={moderateScale(14)} color="#D1D5DB" />,
        );
      }
    }
    return stars;
  };

  const renderFavoriteCard = ({ item }: { item: FavoriteItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleCardPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardIconContainer}>
        <Ionicons name="storefront" size={moderateScale(32)} color="#3B82F6" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name || 'Unknown Store'}
        </Text>
        <Text style={styles.cardCategory} numberOfLines={1}>
          {item.category || 'Store'}
        </Text>
        <View style={styles.cardRating}>
          {renderStars(item.rating)}
          <Text style={styles.cardRatingText}>
            {item.rating?.toFixed(1) || '0.0'}
          </Text>
        </View>
        <View style={styles.cardAddress}>
          <Ionicons name="location-outline" size={moderateScale(14)} color="#6B7280" />
          <Text style={styles.cardAddressText} numberOfLines={1}>
            {item.address || 'No address'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.heartButton}
        onPress={() => handleUnfavorite(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="heart" size={moderateScale(24)} color="#EF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="heart-outline" size={moderateScale(80)} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No favorites yet</Text>
      <Text style={styles.emptySubtitle}>Browse stores to add favorites</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={moderateScale(24)} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favorites</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              activeFilter === tab.key && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === tab.key && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderFavoriteCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[
            styles.listContent,
            favorites.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#3B82F6']}
              tintColor="#3B82F6"
            />
          }
        />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSpacer: {
    width: moderateScale(40),
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    backgroundColor: '#ffffff',
  },
  filterTab: {
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(20),
    backgroundColor: '#F3F4F6',
    marginRight: moderateScale(10),
  },
  filterTabActive: {
    backgroundColor: '#3B82F6',
  },
  filterTabText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(100),
  },
  listContentEmpty: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  cardIconContainer: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: moderateScale(12),
    marginRight: moderateScale(8),
  },
  cardName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(2),
  },
  cardCategory: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginBottom: verticalScale(4),
    textTransform: 'capitalize',
  },
  cardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(4),
  },
  cardRatingText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: moderateScale(4),
  },
  cardAddress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAddressText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: '#6B7280',
    marginLeft: moderateScale(4),
    flex: 1,
  },
  heartButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: verticalScale(16),
  },
  emptySubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#9CA3AF',
    marginTop: verticalScale(8),
  },
});
