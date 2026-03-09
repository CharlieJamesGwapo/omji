import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storeService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

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

const CATEGORY_STYLES: Record<string, { gradient: string; icon: string; emoji: string }> = {
  restaurant: { gradient: COLORS.primary, icon: 'fast-food', emoji: '' },
  grocery: { gradient: COLORS.success, icon: 'cart', emoji: '' },
  pharmacy: { gradient: COLORS.accent, icon: 'medical', emoji: '' },
  retail: { gradient: COLORS.pasabay, icon: 'bag', emoji: '' },
};

// Simulate store open/closed based on current hour (9am-9pm open)
const isStoreOpen = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 22;
};

export default function StoresScreen({ navigation }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const searchBorderAnim = useRef(new Animated.Value(0)).current;

  const categories = [
    { id: 'all', name: 'All', icon: 'grid-outline', activeIcon: 'grid' },
    { id: 'restaurant', name: 'Food', icon: 'fast-food-outline', activeIcon: 'fast-food' },
    { id: 'grocery', name: 'Grocery', icon: 'cart-outline', activeIcon: 'cart' },
    { id: 'pharmacy', name: 'Pharmacy', icon: 'medical-outline', activeIcon: 'medical' },
    { id: 'retail', name: 'Retail', icon: 'bag-outline', activeIcon: 'bag' },
  ];

  const handleSearchFocus = () => {
    setSearchFocused(true);
    Animated.timing(searchBorderAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleSearchBlur = () => {
    setSearchFocused(false);
    Animated.timing(searchBorderAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const searchBorderColor = searchBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.gray200, COLORS.accent],
  });

  const fetchStores = useCallback(async () => {
    try {
      setFetchError(false);
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const response = await storeService.getStores(category);
      const data = response.data?.data;
      setStores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching stores:', error);
      setFetchError(true);
      setStores([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStores();
  };

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
  const storeOpen = isStoreOpen();

  const getCategoryColor = (categoryId: string): string => {
    return CATEGORY_STYLES[categoryId]?.gradient || COLORS.gray500;
  };

  const renderStarRating = (ratingValue: number) => {
    const stars = [];
    const rounded = Math.round(ratingValue * 2) / 2;
    for (let i = 1; i <= 5; i++) {
      if (i <= rounded) {
        stars.push(
          <Ionicons key={`star-${i}`} name="star" size={moderateScale(12)} color={COLORS.warningDark} />
        );
      } else if (i - 0.5 === rounded) {
        stars.push(
          <Ionicons key={`star-${i}`} name="star-half" size={moderateScale(12)} color={COLORS.warningDark} />
        );
      } else {
        stars.push(
          <Ionicons key={`star-${i}`} name="star-outline" size={moderateScale(12)} color={COLORS.gray300} />
        );
      }
    }
    return stars;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stores</Text>
          <Text style={styles.headerSubtitle}>Find your favorites nearby</Text>
        </View>
        <TouchableOpacity
          style={styles.favoritesButton}
          onPress={() => navigation.navigate('Favorites')}
          activeOpacity={0.7}
        >
          <Ionicons name="heart" size={moderateScale(18)} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar with animation */}
      <View style={styles.searchSection}>
        <Animated.View style={[
          styles.searchBar,
          { borderColor: searchBorderColor },
          searchFocused && styles.searchBarFocused,
        ]}>
          <View style={styles.searchIconContainer}>
            <Ionicons
              name="search"
              size={moderateScale(18)}
              color={searchFocused ? COLORS.accent : COLORS.gray400}
            />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores, food, items..."
            placeholderTextColor={COLORS.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.searchClearButton}
              onPress={() => setSearchQuery('')}
            >
              <Ionicons name="close-circle" size={moderateScale(18)} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {/* Category Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesSection}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => {
          const isActive = selectedCategory === category.id;
          const chipColor = category.id === 'all' ? COLORS.gray900 : getCategoryColor(category.id);

          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryChip,
                isActive && [styles.categoryChipActive, { backgroundColor: chipColor }],
              ]}
              onPress={() => setSelectedCategory(category.id)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.categoryIconContainer,
                isActive
                  ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                  : { backgroundColor: COLORS.gray200 },
              ]}>
                <Ionicons
                  name={(isActive ? category.activeIcon : category.icon) as any}
                  size={moderateScale(16)}
                  color={isActive ? COLORS.white : COLORS.gray600}
                />
              </View>
              <Text
                style={[
                  styles.categoryText,
                  isActive && styles.categoryTextActive,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Featured Stores */}
        {selectedCategory === 'all' && searchQuery === '' && featuredStores.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Featured Stores</Text>
                <Text style={styles.sectionSubtitle}>Verified and highly rated</Text>
              </View>
              <View style={styles.featuredCountBadge}>
                <Ionicons name="shield-checkmark" size={moderateScale(12)} color={COLORS.success} />
                <Text style={styles.featuredCountText}>{featuredStores.length}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredContainer}
            >
              {featuredStores.map((store) => {
                const catStyle = CATEGORY_STYLES[store.category];
                return (
                  <TouchableOpacity
                    key={`featured-${store.id}`}
                    style={styles.featuredCard}
                    onPress={() => navigation.navigate('StoreDetail', { store })}
                    activeOpacity={0.8}
                  >
                    {/* Featured Image placeholder */}
                    <View style={[
                      styles.featuredImageContainer,
                      { backgroundColor: catStyle?.gradient ? `${catStyle.gradient}12` : COLORS.accentBg },
                    ]}>
                      <View style={[styles.featuredImageIcon, { backgroundColor: catStyle?.gradient || COLORS.accent }]}>
                        <Ionicons
                          name={(catStyle?.icon || 'storefront') as any}
                          size={moderateScale(28)}
                          color={COLORS.white}
                        />
                      </View>
                      {/* Open/Closed badge */}
                      <View style={[
                        styles.openBadgeFeatured,
                        { backgroundColor: storeOpen ? COLORS.success : COLORS.error },
                      ]}>
                        <View style={[styles.openDot, { backgroundColor: COLORS.white }]} />
                        <Text style={styles.openBadgeFeaturedText}>
                          {storeOpen ? 'Open' : 'Closed'}
                        </Text>
                      </View>
                      {/* Rating badge */}
                      <View style={styles.featuredRatingBadge}>
                        <Ionicons name="star" size={moderateScale(12)} color={COLORS.warningDark} />
                        <Text style={styles.featuredRatingText}>
                          {Number(store.rating || 0).toFixed(1)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.featuredContent}>
                      <Text style={styles.featuredName} numberOfLines={1}>{store.name}</Text>
                      <View style={styles.featuredMeta}>
                        <Ionicons name="location" size={moderateScale(12)} color={COLORS.gray400} />
                        <Text style={styles.featuredMetaText} numberOfLines={1}>
                          {store.address || store.category}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* All Stores */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                {selectedCategory === 'all' ? 'All Stores' : categories.find(c => c.id === selectedCategory)?.name || 'Stores'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {filteredStores.length} store{filteredStores.length !== 1 ? 's' : ''} available
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              {[1, 2, 3].map((i) => (
                <View key={`skeleton-${i}`} style={[styles.storeCard, { opacity: 0.5 }]}>
                  <View style={[styles.storeImagePlaceholder, { backgroundColor: COLORS.gray100 }]} />
                  <View style={styles.storeContent}>
                    <View style={{ backgroundColor: COLORS.gray200, height: verticalScale(16), width: '60%', borderRadius: moderateScale(4), marginBottom: verticalScale(8) }} />
                    <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(12), width: '40%', borderRadius: moderateScale(4), marginBottom: verticalScale(8) }} />
                    <View style={{ backgroundColor: COLORS.gray100, height: verticalScale(12), width: '80%', borderRadius: moderateScale(4) }} />
                  </View>
                </View>
              ))}
            </View>
          ) : filteredStores.map((store) => {
            const catStyle = CATEGORY_STYLES[store.category];
            return (
              <TouchableOpacity
                key={store.id}
                style={styles.storeCard}
                onPress={() => navigation.navigate('StoreDetail', { store })}
                activeOpacity={0.7}
              >
                {/* Store Image Area */}
                <View style={styles.storeImageSection}>
                  <View style={[
                    styles.storeImagePlaceholder,
                    { backgroundColor: catStyle ? `${catStyle.gradient}08` : COLORS.gray50 },
                  ]}>
                    {/* Decorative pattern */}
                    <View style={styles.imagePlaceholderPattern}>
                      <View style={[styles.patternCircle, styles.patternCircle1, { backgroundColor: catStyle ? `${catStyle.gradient}10` : COLORS.gray100 }]} />
                      <View style={[styles.patternCircle, styles.patternCircle2, { backgroundColor: catStyle ? `${catStyle.gradient}08` : COLORS.gray100 }]} />
                    </View>
                    <View style={[styles.storeIconCircle, { backgroundColor: catStyle?.gradient || COLORS.accent }]}>
                      <Ionicons
                        name={(catStyle?.icon || 'storefront') as any}
                        size={moderateScale(32)}
                        color={COLORS.white}
                      />
                    </View>
                  </View>
                  {/* Open/Closed badge */}
                  <View style={[
                    styles.openBadge,
                    storeOpen ? styles.openBadgeOpen : styles.openBadgeClosed,
                  ]}>
                    <View style={[
                      styles.openDot,
                      { backgroundColor: storeOpen ? COLORS.success : COLORS.error },
                    ]} />
                    <Text style={[
                      styles.openBadgeText,
                      { color: storeOpen ? COLORS.successDark : COLORS.errorDark },
                    ]}>
                      {storeOpen ? 'Open Now' : 'Closed'}
                    </Text>
                  </View>
                </View>

                {/* Store Content */}
                <View style={styles.storeContent}>
                  <View style={styles.storeHeader}>
                    <View style={styles.storeNameRow}>
                      <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
                      {store.is_verified && (
                        <View style={styles.verifiedBadge}>
                          <Ionicons name="shield-checkmark" size={moderateScale(14)} color={COLORS.accent} />
                        </View>
                      )}
                    </View>
                    <View style={styles.ratingSection}>
                      <View style={styles.starsRow}>
                        {renderStarRating(Number(store.rating || 0))}
                      </View>
                      <Text style={styles.ratingNumber}>{Number(store.rating || 0).toFixed(1)}</Text>
                    </View>
                  </View>

                  {/* Tags */}
                  <View style={styles.storeTags}>
                    <View style={[styles.categoryTag, { backgroundColor: catStyle ? `${catStyle.gradient}12` : COLORS.gray100 }]}>
                      <Ionicons
                        name={(catStyle?.icon || 'pricetag') as any}
                        size={moderateScale(12)}
                        color={catStyle?.gradient || COLORS.gray600}
                      />
                      <Text style={[styles.categoryTagText, { color: catStyle?.gradient || COLORS.gray600 }]}>
                        {store.category}
                      </Text>
                    </View>
                    {store.is_verified && (
                      <View style={[styles.categoryTag, { backgroundColor: COLORS.successBg }]}>
                        <Ionicons name="checkmark-circle" size={moderateScale(12)} color={COLORS.successDark} />
                        <Text style={[styles.categoryTagText, { color: COLORS.successDark }]}>Verified</Text>
                      </View>
                    )}
                  </View>

                  {/* Footer info */}
                  <View style={styles.storeFooter}>
                    <View style={styles.storeInfoItem}>
                      <Ionicons name="location" size={moderateScale(14)} color={COLORS.gray400} />
                      <Text style={styles.storeInfoText} numberOfLines={1}>{store.address || 'Balingasag'}</Text>
                    </View>
                    {!!store.phone && (
                      <View style={styles.storeInfoItem}>
                        <Ionicons name="call" size={moderateScale(14)} color={COLORS.gray400} />
                        <Text style={styles.storeInfoText}>{store.phone}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {!loading && fetchError && filteredStores.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="cloud-offline-outline" size={moderateScale(40)} color={COLORS.error} />
              </View>
              <Text style={styles.emptyText}>Could not load stores</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh or check your connection</Text>
              <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.7}>
                <Ionicons name="refresh" size={moderateScale(16)} color={COLORS.white} />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !fetchError && filteredStores.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="storefront-outline" size={moderateScale(40)} color={COLORS.gray300} />
              </View>
              <Text style={styles.emptyText}>No stores found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your search or category filter</Text>
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
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.title,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: fontScale(13),
    color: COLORS.gray400,
    marginTop: verticalScale(2),
  },
  favoritesButton: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Search
  searchSection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(8),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: moderateScale(14),
    paddingHorizontal: moderateScale(14),
    borderWidth: moderateScale(1.5),
    borderColor: COLORS.gray200,
  },
  searchBarFocused: {
    backgroundColor: COLORS.white,
    ...SHADOWS.md,
  },
  searchIconContainer: {
    marginRight: moderateScale(10),
  },
  searchInput: {
    flex: 1,
    paddingVertical: verticalScale(13),
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray800,
  },
  searchClearButton: {
    padding: moderateScale(4),
  },
  // Categories
  categoriesSection: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 0,
    ...SHADOWS.sm,
  },
  categoriesContent: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    gap: moderateScale(8),
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(14),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(24),
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    gap: moderateScale(6),
  },
  categoryChipActive: {
    borderWidth: 0,
  },
  categoryIconContainer: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: COLORS.gray600,
  },
  categoryTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: verticalScale(100),
  },
  // Sections
  section: {
    marginTop: verticalScale(20),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginBottom: verticalScale(14),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: fontScale(12),
    color: COLORS.gray400,
    marginTop: verticalScale(2),
  },
  featuredCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(20),
    gap: moderateScale(4),
  },
  featuredCountText: {
    fontSize: fontScale(12),
    fontWeight: '700',
    color: COLORS.successDark,
  },
  // Featured Cards
  featuredContainer: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  featuredCard: {
    width: moderateScale(200),
    marginRight: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  featuredImageContainer: {
    width: '100%',
    height: verticalScale(120),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  featuredImageIcon: {
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  openBadgeFeatured: {
    position: 'absolute',
    top: verticalScale(8),
    left: moderateScale(8),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(10),
    gap: moderateScale(4),
  },
  openBadgeFeaturedText: {
    fontSize: fontScale(10),
    fontWeight: '700',
    color: COLORS.white,
  },
  featuredRatingBadge: {
    position: 'absolute',
    top: verticalScale(8),
    right: moderateScale(8),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    paddingHorizontal: moderateScale(8),
    paddingVertical: verticalScale(3),
    gap: moderateScale(3),
    ...SHADOWS.sm,
  },
  featuredRatingText: {
    fontSize: fontScale(12),
    fontWeight: '800',
    color: COLORS.gray900,
  },
  featuredContent: {
    padding: moderateScale(12),
  },
  featuredName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: moderateScale(4),
  },
  featuredMetaText: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    flex: 1,
  },
  // Store Cards
  loadingContainer: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  storeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginBottom: verticalScale(14),
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  storeImageSection: {
    position: 'relative',
  },
  storeImagePlaceholder: {
    width: '100%',
    height: verticalScale(140),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePlaceholderPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  patternCircle: {
    position: 'absolute',
    borderRadius: moderateScale(999),
  },
  patternCircle1: {
    width: moderateScale(180),
    height: moderateScale(180),
    top: -moderateScale(40),
    right: -moderateScale(40),
  },
  patternCircle2: {
    width: moderateScale(120),
    height: moderateScale(120),
    bottom: -moderateScale(30),
    left: -moderateScale(20),
  },
  storeIconCircle: {
    width: moderateScale(64),
    height: moderateScale(64),
    borderRadius: moderateScale(32),
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  openBadge: {
    position: 'absolute',
    top: verticalScale(10),
    right: moderateScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(14),
    gap: moderateScale(5),
  },
  openBadgeOpen: {
    backgroundColor: COLORS.successBg,
  },
  openBadgeClosed: {
    backgroundColor: COLORS.errorBg,
  },
  openDot: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
  },
  openBadgeText: {
    fontSize: fontScale(11),
    fontWeight: '700',
  },
  storeContent: {
    padding: moderateScale(16),
  },
  storeHeader: {
    marginBottom: verticalScale(8),
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
    marginBottom: verticalScale(6),
  },
  storeName: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray900,
    flex: 1,
  },
  verifiedBadge: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  starsRow: {
    flexDirection: 'row',
    gap: moderateScale(2),
  },
  ratingNumber: {
    fontSize: fontScale(13),
    fontWeight: '700',
    color: COLORS.warningDark,
  },
  storeTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: verticalScale(12),
    gap: moderateScale(6),
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(14),
    gap: moderateScale(4),
  },
  categoryTagText: {
    fontSize: fontScale(11),
    fontWeight: '600',
  },
  storeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    paddingTop: verticalScale(10),
  },
  storeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
  },
  storeInfoText: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    maxWidth: moderateScale(130),
  },
  // Empty states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(60),
  },
  emptyIconContainer: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(16),
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray400,
    marginTop: verticalScale(8),
    textAlign: 'center',
    paddingHorizontal: moderateScale(40),
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(20),
    gap: moderateScale(6),
    marginTop: verticalScale(16),
    ...SHADOWS.colored(COLORS.accent),
  },
  retryButtonText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.white,
  },
});
