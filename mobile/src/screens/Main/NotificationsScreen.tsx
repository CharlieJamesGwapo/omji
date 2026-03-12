import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { notificationService } from '../../services/api';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';
import Toast, { ToastType } from '../../components/Toast';

interface Notification {
  id: number;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
}

interface NotificationGroup {
  title: string;
  data: Notification[];
}

export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await notificationService.getNotifications();
      const data = response.data?.data;
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Error fetching notifications:', error);
      showToast('Could not load notifications. Pull down to retry.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchNotifications();
    } finally {
      setRefreshing(false);
    }
  }, [fetchNotifications]);

  const handleMarkRead = async (id: number) => {
    const prev = [...notifications];
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await notificationService.markAsRead(id);
    } catch {
      setNotifications(prev);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    const prev = [...notifications];
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    try {
      await Promise.allSettled(unreadIds.map(id => notificationService.markAsRead(id)));
    } catch {
      setNotifications(prev);
    }
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const getNotificationConfig = (type: string) => {
    switch (type) {
      case 'ride':
      case 'ride_request': return { icon: 'navigate-circle', color: COLORS.success, bg: COLORS.successBg, borderColor: COLORS.success };
      case 'delivery':
      case 'delivery_request': return { icon: 'cube', color: COLORS.accent, bg: COLORS.accentBg, borderColor: COLORS.accent };
      case 'order':
      case 'order_update': return { icon: 'storefront', color: COLORS.primary, bg: COLORS.primaryBg, borderColor: COLORS.primary };
      case 'promo': return { icon: 'pricetag', color: COLORS.warning, bg: COLORS.warningBg, borderColor: COLORS.warning };
      case 'wallet': return { icon: 'wallet', color: COLORS.info, bg: COLORS.infoBg, borderColor: COLORS.info };
      default: return { icon: 'notifications', color: COLORS.gray500, bg: COLORS.gray100, borderColor: COLORS.gray400 };
    }
  };

  const getDateGroup = (dateStr: string): string => {
    if (!dateStr) return 'Earlier';
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const notifDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (notifDate.getTime() === today.getTime()) return 'Today';
    if (notifDate.getTime() === yesterday.getTime()) return 'Yesterday';
    return 'Earlier';
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, Notification[]> = { 'Today': [], 'Yesterday': [], 'Earlier': [] };
    notifications.forEach(n => {
      const group = getDateGroup(n.created_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    });
    const result: NotificationGroup[] = [];
    if (groups['Today'].length > 0) result.push({ title: 'Today', data: groups['Today'] });
    if (groups['Yesterday'].length > 0) result.push({ title: 'Yesterday', data: groups['Yesterday'] });
    if (groups['Earlier'].length > 0) result.push({ title: 'Earlier', data: groups['Earlier'] });
    return result;
  }, [notifications]);

  const renderNotification = (item: Notification) => {
    const config = getNotificationConfig(item.type);
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.notificationCard,
          !item.read && { borderLeftWidth: moderateScale(3), borderLeftColor: config.borderColor },
        ]}
        onPress={() => handleMarkRead(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon as any} size={moderateScale(22)} color={config.color} />
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, !item.read && styles.unreadTitle]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.read && (
              <View style={[styles.unreadDot, { backgroundColor: config.color }]} />
            )}
          </View>
          <Text style={[styles.message, !item.read && styles.unreadMessage]} numberOfLines={2}>{item.body}</Text>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={moderateScale(12)} color={COLORS.gray400} />
            <Text style={styles.time}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupedList = () => {
    if (groupedNotifications.length === 0) return null;
    return groupedNotifications.map(group => (
      <View key={group.title}>
        <View style={styles.groupHeader}>
          <View style={styles.groupHeaderLine} />
          <Text style={styles.groupHeaderText}>{group.title}</Text>
          <View style={styles.groupHeaderLine} />
        </View>
        {group.data.map(item => renderNotification(item))}
      </View>
    ));
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadCountBadge}>
              <Text style={styles.unreadCountText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Ionicons name="checkmark-done" size={moderateScale(18)} color={COLORS.accent} />
            <Text style={styles.markAllText}>Read all</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={moderateScale(22)} color={COLORS.gray800} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={[1]}
        renderItem={() => (
          <View>
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="notifications-off-outline" size={moderateScale(56)} color={COLORS.gray300} />
                </View>
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySubtext}>
                  When you receive notifications about your rides, deliveries, or orders, they will appear here.
                </Text>
                <TouchableOpacity style={styles.emptyButton} onPress={onRefresh}>
                  <Ionicons name="refresh-outline" size={moderateScale(18)} color={COLORS.accent} />
                  <Text style={styles.emptyButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              renderGroupedList()
            )}
          </View>
        )}
        keyExtractor={() => 'notifications'}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.accent]} tintColor={COLORS.accent} />
        }
      />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(16),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerBackBtn: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: moderateScale(12),
    gap: moderateScale(8),
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  unreadCountBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: moderateScale(10),
    minWidth: moderateScale(22),
    height: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(6),
  },
  unreadCountText: {
    fontSize: fontScale(11),
    fontWeight: 'bold',
    color: COLORS.white,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: RESPONSIVE.borderRadius.small,
    gap: moderateScale(4),
  },
  markAllText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.accent,
  },
  listContent: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: verticalScale(100),
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(16),
    marginBottom: verticalScale(12),
  },
  groupHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.gray200,
  },
  groupHeaderText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
    color: COLORS.gray500,
    paddingHorizontal: moderateScale(12),
    textTransform: 'uppercase',
    letterSpacing: moderateScale(0.8),
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  iconContainer: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(12),
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(4),
  },
  title: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '500',
    color: COLORS.gray700,
  },
  unreadTitle: {
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  unreadDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    marginLeft: moderateScale(8),
  },
  message: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    lineHeight: fontScale(20),
    marginBottom: verticalScale(6),
  },
  unreadMessage: {
    color: COLORS.gray600,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
  },
  time: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray400,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(80),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  emptyIconWrap: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(20),
  },
  emptyTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(22),
    marginBottom: verticalScale(24),
    maxWidth: moderateScale(280),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(10),
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(8),
  },
  emptyButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
