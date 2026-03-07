import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RESPONSIVE, verticalScale, moderateScale, isIOS } from '../utils/responsive';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
}

const TOAST_CONFIG: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string; textColor: string }> = {
  success: { bg: '#ECFDF5', border: '#A7F3D0', icon: 'checkmark-circle', iconColor: '#10B981', textColor: '#065F46' },
  error: { bg: '#FEF2F2', border: '#FECACA', icon: 'alert-circle', iconColor: '#EF4444', textColor: '#991B1B' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', icon: 'warning', iconColor: '#F59E0B', textColor: '#92400E' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', icon: 'information-circle', iconColor: '#3B82F6', textColor: '#1E40AF' },
};

export default function Toast({ visible, message, type = 'info', duration = 3500, onDismiss }: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        dismiss();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      translateY.setValue(-100);
      opacity.setValue(0);
    }
  }, [visible, duration]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  if (!visible) return null;

  const config = TOAST_CONFIG[type];

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: config.bg, borderColor: config.border, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={config.icon as any} size={22} color={config.iconColor} />
      <Text style={[styles.message, { color: config.textColor }]} numberOfLines={2}>{message}</Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={18} color={config.textColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: isIOS ? verticalScale(50) : verticalScale(35),
    left: RESPONSIVE.paddingHorizontal,
    right: RESPONSIVE.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  message: {
    flex: 1,
    marginHorizontal: moderateScale(10),
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '500',
    lineHeight: verticalScale(20),
  },
});
