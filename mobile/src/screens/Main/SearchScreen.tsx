import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import { storeService } from '../../services/api';

type SearchResult = {
  id: string;
  type: 'store';
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  data: any;
};

const STORE_CATEGORY_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  restaurant: { icon: 'fast-food', color: COLORS.primary, bg: COLORS.primaryBg },
  grocery: { icon: 'cart', color: COLORS.success, bg: COLORS.successBg },
  pharmacy: { icon: 'medical', color: COLORS.accent, bg: COLORS.accentBg },
  retail: { icon: 'bag', color: '#8B5CF6', bg: '#F5F3FF' },
};

const DEFAULT_CATEGORY = { icon: 'storefront', color: COLORS.store, bg: COLORS.storeBg };

export default function SearchScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);

  // Auto-focus the input on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch stores once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await storeService.getStores();
        const stores = res?.data?.data;
        if (!cancelled && Array.isArray(stores)) {
          setAllStores(stores);
        }
      } catch {
        // Silent fail - stores will just show empty results
      } finally {
        if (!cancelled) setStoresLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const performSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    const term = searchTerm.toLowerCase().trim();

    // Filter stores by name or category
    const matchingStores: SearchResult[] = allStores
      .filter((store: any) => {
        const name = (store.name || '').toLowerCase();
        const category = (store.category || '').toLowerCase();
        return name.includes(term) || category.includes(term);
      })
      .map((store: any) => {
        const catConfig = STORE_CATEGORY_ICONS[store.category] || DEFAULT_CATEGORY;
        const rating = store.rating ? `${Number(store.rating).toFixed(1)} rating` : '';
        const category = store.category
          ? store.category.charAt(0).toUpperCase() + store.category.slice(1)
          : '';
        const subtitle = [category, rating].filter(Boolean).join(' · ');

        return {
          id: `store-${store.id}`,
          type: 'store' as const,
          title: store.name,
          subtitle,
          icon: catConfig.icon,
          iconColor: catConfig.color,
          iconBg: catConfig.bg,
          data: store,
        };
      });

    setResults(matchingStores);
    setLoading(false);
  }, [allStores]);

  const onChangeText = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(text);
    }, 300);
  }, [performSearch]);

  const onClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  }, []);

  const onCancel = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const onPressResult = useCallback((item: SearchResult) => {
    if (item.type === 'store') {
      navigation.navigate('StoreDetail', { store: item.data });
    }
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => onPressResult(item)}
      activeOpacity={0.6}
    >
      <View style={[styles.resultIcon, { backgroundColor: item.iconBg }]}>
        <Ionicons name={item.icon as any} size={moderateScale(20)} color={item.iconColor} />
      </View>
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.gray300} />
    </TouchableOpacity>
  ), [onPressResult]);

  const keyExtractor = useCallback((item: SearchResult) => item.id, []);

  const renderEmpty = () => {
    if (loading || !storesLoaded) return null;

    if (!hasSearched) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={moderateScale(48)} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>Search for stores, rides, or orders</Text>
          <Text style={styles.emptySubtitle}>Find what you need across all OMJI services</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="sad-outline" size={moderateScale(48)} color={COLORS.gray300} />
        <Text style={styles.emptyTitle}>No results found for '{query}'</Text>
        <Text style={styles.emptySubtitle}>Try a different search term</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={moderateScale(18)} color={COLORS.gray400} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search stores, services..."
            placeholderTextColor={COLORS.gray400}
            value={query}
            onChangeText={onChangeText}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={moderateScale(18)} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Loading Indicator */}
      {(loading || !storesLoaded) && hasSearched && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={results.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(12),
    paddingHorizontal: moderateScale(12),
    height: moderateScale(42),
  },
  searchIcon: {
    marginRight: moderateScale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: fontScale(15),
    color: COLORS.gray900,
    paddingVertical: 0,
  },
  cancelButton: {
    marginLeft: moderateScale(12),
    paddingVertical: verticalScale(4),
  },
  cancelText: {
    fontSize: fontScale(15),
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: verticalScale(16),
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: verticalScale(8),
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(12),
    backgroundColor: COLORS.white,
    marginHorizontal: moderateScale(12),
    marginVertical: verticalScale(3),
    borderRadius: moderateScale(12),
    ...SHADOWS.sm,
  },
  resultIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(12),
  },
  resultText: {
    flex: 1,
    marginRight: moderateScale(8),
  },
  resultTitle: {
    fontSize: fontScale(15),
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: verticalScale(2),
  },
  resultSubtitle: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: moderateScale(32),
  },
  emptyTitle: {
    fontSize: fontScale(16),
    fontWeight: '600',
    color: COLORS.gray600,
    marginTop: verticalScale(16),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontScale(13),
    color: COLORS.gray400,
    marginTop: verticalScale(6),
    textAlign: 'center',
  },
});
