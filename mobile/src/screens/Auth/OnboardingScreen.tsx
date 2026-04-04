import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/theme';
import { fontScale, verticalScale, moderateScale, RESPONSIVE } from '../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SlideData {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
}

const slides: SlideData[] = [
  {
    id: '1',
    icon: 'car-sport-outline',
    iconColor: COLORS.pasundo,
    iconBg: COLORS.pasundoBg,
    title: 'Pasundo - Ride Service',
    subtitle: 'Book safe and affordable rides around Balingasag instantly',
  },
  {
    id: '2',
    icon: 'cube-outline',
    iconColor: COLORS.pasugo,
    iconBg: COLORS.pasugoBg,
    title: 'Pasugo - Delivery',
    subtitle: 'Send packages and documents across town with real-time tracking',
  },
  {
    id: '3',
    icon: 'storefront-outline',
    iconColor: COLORS.store,
    iconBg: COLORS.storeBg,
    title: 'Order from Local Stores',
    subtitle: 'Browse menus, order food, and get it delivered to your doorstep',
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem('@oneride_onboarded', 'true');
    } catch {}
    navigation.replace('Login');
  }, [navigation]);

  const handleNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      completeOnboarding();
    }
  }, [currentIndex, completeOnboarding]);

  const renderSlide = ({ item, index }: { item: SlideData; index: number }) => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const iconScale = scrollX.interpolate({
      inputRange,
      outputRange: [0.6, 1, 0.6],
      extrapolate: 'clamp',
    });

    const titleOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    });

    const translateY = scrollX.interpolate({
      inputRange,
      outputRange: [moderateScale(30), 0, moderateScale(30)],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.slide}>
        <Animated.View
          style={[
            styles.iconContainer,
            { backgroundColor: item.iconBg, transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={moderateScale(80)}
            color={item.iconColor}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.textContainer,
            { opacity: titleOpacity, transform: [{ translateY }] },
          ]}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </Animated.View>
      </View>
    );
  };

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {slides.map((_, index) => {
        const inputRange = [
          (index - 1) * SCREEN_WIDTH,
          index * SCREEN_WIDTH,
          (index + 1) * SCREEN_WIDTH,
        ];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [moderateScale(8), moderateScale(24), moderateScale(8)],
          extrapolate: 'clamp',
        });

        const dotOpacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              { width: dotWidth, opacity: dotOpacity },
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={completeOnboarding} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <View style={styles.bottomContainer}>
        {renderDots()}

        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons
            name={currentIndex === slides.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={moderateScale(20)}
            color={COLORS.white}
            style={{ marginLeft: moderateScale(6) }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  skipContainer: {
    alignItems: 'flex-end',
    paddingTop: verticalScale(56),
    paddingHorizontal: moderateScale(20),
  },
  skipButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: moderateScale(16),
  },
  skipText: {
    fontSize: fontScale(16),
    color: COLORS.gray500,
    fontWeight: '500',
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(40),
  },
  iconContainer: {
    width: moderateScale(160),
    height: moderateScale(160),
    borderRadius: moderateScale(80),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(48),
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: fontScale(26),
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
    marginBottom: verticalScale(12),
  },
  subtitle: {
    fontSize: fontScale(16),
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(24),
    paddingHorizontal: moderateScale(12),
  },
  bottomContainer: {
    paddingBottom: verticalScale(48),
    paddingHorizontal: moderateScale(20),
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(32),
  },
  dot: {
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    backgroundColor: COLORS.primary,
    marginHorizontal: moderateScale(4),
  },
  nextButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: verticalScale(14),
    paddingHorizontal: moderateScale(32),
    borderRadius: moderateScale(28),
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nextButtonText: {
    fontSize: fontScale(17),
    fontWeight: '600',
    color: COLORS.white,
  },
});
