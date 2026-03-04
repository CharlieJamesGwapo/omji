import { Dimensions, Platform, PixelRatio } from 'react-native';

// Get device dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 11 Pro)
const baseWidth = 375;
const baseHeight = 812;

/**
 * Scale size based on device width
 * @param size - Base size to scale
 * @returns Scaled size
 */
export const scale = (size: number): number => {
  return (SCREEN_WIDTH / baseWidth) * size;
};

/**
 * Scale size based on device height
 * @param size - Base size to scale
 * @returns Scaled size
 */
export const verticalScale = (size: number): number => {
  return (SCREEN_HEIGHT / baseHeight) * size;
};

/**
 * Moderate scale - balances between width and height scaling
 * @param size - Base size to scale
 * @param factor - Scaling factor (0-1), default 0.5
 * @returns Moderately scaled size
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
  return size + (scale(size) - size) * factor;
};

/**
 * Font scale based on device width with accessibility support
 * @param size - Base font size
 * @returns Scaled font size
 */
export const fontScale = (size: number): number => {
  return moderateScale(size, 0.3);
};

/**
 * Check if device is a tablet
 * @returns True if tablet, false otherwise
 */
export const isTablet = (): boolean => {
  const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  return (
    (Platform.OS === 'ios' && aspectRatio < 1.6) ||
    (Platform.OS === 'android' && SCREEN_WIDTH >= 600)
  );
};

/**
 * Check if device is small (width < 375)
 * @returns True if small device, false otherwise
 */
export const isSmallDevice = (): boolean => {
  return SCREEN_WIDTH < 375;
};

/**
 * Check if device is large (width > 768)
 * @returns True if large device, false otherwise
 */
export const isLargeDevice = (): boolean => {
  return SCREEN_WIDTH > 768;
};

/**
 * Get responsive padding
 * @param base - Base padding value
 * @returns Responsive padding
 */
export const getResponsivePadding = (base: number): number => {
  if (isTablet()) {
    return base * 1.5;
  }
  if (isSmallDevice()) {
    return base * 0.8;
  }
  return base;
};

/**
 * Get responsive column count for grid layouts
 * @param baseColumns - Base number of columns
 * @returns Number of columns based on device size
 */
export const getResponsiveColumns = (baseColumns: number): number => {
  if (isTablet()) {
    return baseColumns * 2;
  }
  if (isSmallDevice()) {
    return Math.max(1, baseColumns - 1);
  }
  return baseColumns;
};

/**
 * Normalize pixel ratio for different devices
 * @param size - Size to normalize
 * @returns Normalized size
 */
export const normalize = (size: number): number => {
  const pixelRatio = PixelRatio.get();

  if (pixelRatio >= 3) {
    return size * 0.95;
  }
  if (pixelRatio < 2) {
    return size * 1.05;
  }
  return size;
};

// Export device dimensions
export const deviceWidth = SCREEN_WIDTH;
export const deviceHeight = SCREEN_HEIGHT;

// Export platform checks
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

// Common breakpoints
export const BREAKPOINTS = {
  SMALL: 375,
  MEDIUM: 768,
  LARGE: 1024,
};

/**
 * Get card width for grid layouts
 * @param columns - Number of columns
 * @param padding - Horizontal padding
 * @param gap - Gap between items
 * @returns Card width
 */
export const getCardWidth = (
  columns: number,
  padding: number = 20,
  gap: number = 16
): number => {
  const totalPadding = padding * 2;
  const totalGaps = gap * (columns - 1);
  return (SCREEN_WIDTH - totalPadding - totalGaps) / columns;
};

// Common responsive values
export const RESPONSIVE = {
  // Spacing
  paddingHorizontal: getResponsivePadding(20),
  paddingVertical: getResponsivePadding(16),
  marginHorizontal: getResponsivePadding(20),
  marginVertical: getResponsivePadding(16),

  // Font sizes
  fontSize: {
    small: fontScale(12),
    medium: fontScale(14),
    regular: fontScale(16),
    large: fontScale(18),
    xlarge: fontScale(20),
    xxlarge: fontScale(24),
    title: fontScale(28),
    heading: fontScale(32),
  },

  // Icon sizes
  iconSize: {
    small: moderateScale(16),
    medium: moderateScale(24),
    large: moderateScale(32),
    xlarge: moderateScale(40),
  },

  // Border radius
  borderRadius: {
    small: moderateScale(8),
    medium: moderateScale(12),
    large: moderateScale(16),
    xlarge: moderateScale(20),
  },

  // Common heights
  height: {
    button: moderateScale(48),
    input: moderateScale(56),
    header: moderateScale(60),
    tabBar: moderateScale(60),
    card: moderateScale(120),
  },
};

export default {
  scale,
  verticalScale,
  moderateScale,
  fontScale,
  isTablet,
  isSmallDevice,
  isLargeDevice,
  getResponsivePadding,
  getResponsiveColumns,
  normalize,
  getCardWidth,
  deviceWidth,
  deviceHeight,
  isIOS,
  isAndroid,
  BREAKPOINTS,
  RESPONSIVE,
};
