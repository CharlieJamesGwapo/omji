import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Vibration,
  Animated,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { driverService } from '../../services/api';
import { getWebSocketUrl } from '../../utils/websocket';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';
import RiderRequestModal from '../../components/RiderRequestModal';
import PaymentVerificationCard from '../../components/PaymentVerificationCard';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface DriverRequest {
  id: number;
  type?: string;
  pickup_location?: string;
  pickup?: string;
  dropoff_location?: string;
  dropoff?: string;
  distance?: number;
  distance_km?: number;
  estimated_fare?: number;
  delivery_fee?: number;
  vehicle_type?: string;
  status: string;
  passenger_name?: string;
  passenger_phone?: string;
  item_description?: string;
  payment_method?: string;
  user?: { name: string };
  User?: { name: string };
  created_at?: string;
  // Rideshare fields
  available_seats?: number;
  total_seats?: number;
  base_fare?: number;
  passengers?: string[];
}

export default function RiderDashboardScreen({ navigation }: any) {
  const { user, logout, refreshUser, updateUser } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acceptingJobId, setAcceptingJobId] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [earnings, setEarnings] = useState<any>({ today_earnings: 0, total_earnings: 0, completed_rides: 0 });
  const [requests, setRequests] = useState<DriverRequest[]>([]);
  const [activeJobs, setActiveJobs] = useState<DriverRequest[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const dismissedRequestIds = useRef<Set<number>>(new Set());
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const [onlineMinutes, setOnlineMinutes] = useState(0);
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const previousRequestCount = useRef(0);
  const wasVerifiedRef = useRef<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const radarAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [rideRequest, setRideRequest] = useState<any>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const driverWsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECTS = 5;
  const driverProfileId = useRef<number | null>(null);
  const [driverProfileIdState, setDriverProfileIdState] = useState<number | null>(null);

  // Online timer
  useEffect(() => {
    if (isOnline && onlineSince) {
      const timer = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - onlineSince.getTime()) / 60000);
        setOnlineMinutes(diff);
      }, 10000);
      return () => clearInterval(timer);
    } else {
      setOnlineMinutes(0);
    }
  }, [isOnline, onlineSince]);

  // Pulsing animation for online dot
  useEffect(() => {
    if (isOnline) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOnline, pulseAnim]);

  // Radar sweep animation for scanning
  useEffect(() => {
    if (isOnline && requests.length === 0) {
      const radar = Animated.loop(
        Animated.timing(radarAnim, { toValue: 1, duration: 2500, useNativeDriver: true })
      );
      radar.start();
      return () => radar.stop();
    } else {
      radarAnim.setValue(0);
    }
  }, [isOnline, requests.length, radarAnim]);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;

  const fetchDriverProfile = useCallback(async () => {
    try {
      const profileRes = await driverService.getProfile();
      const profileData = profileRes.data?.data;
      if (profileData) {
        if (profileData.id) {
          driverProfileId.current = profileData.id;
          setDriverProfileIdState(profileData.id);
        }
        const newVerified = profileData.is_verified === true;
        setIsVerified(newVerified);
        if (wasVerifiedRef.current === false && newVerified) {
          await refreshUserRef.current();
          setToast({ visible: true, message: 'Your account has been approved! Welcome aboard!', type: 'success' });
          Vibration.vibrate([0, 200, 100, 200]);
        }
        wasVerifiedRef.current = newVerified;
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        // Profile fetch failed - will retry on next poll
      }
      setIsVerified(false);
      wasVerifiedRef.current = false;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [earningsRes, requestsRes] = await Promise.allSettled([
        driverService.getEarnings(),
        driverService.getRequests(),
      ]);
      if (earningsRes.status === 'fulfilled') {
        setEarnings(earningsRes.value?.data?.data || {});
      }
      if (requestsRes.status === 'fulfilled') {
        const data = requestsRes.value?.data?.data;
        const allRequests = Array.isArray(data) ? data : [];
        const newRequests = allRequests.filter(
          (r: DriverRequest) => !(r.status === 'pending' && dismissedRequestIds.current.has(r.id))
        );
        if (newRequests.length > previousRequestCount.current) {
          Vibration.vibrate(500);
        }
        previousRequestCount.current = newRequests.length;
        setRequests(newRequests);
        const activeData = requestsRes.value?.data?.active || requestsRes.value?.data?.data?.active;
        setActiveJobs(Array.isArray(activeData) ? activeData : []);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        // Data fetch failed - will retry on next poll
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDriverProfile();
    fetchData();
  }, [fetchDriverProfile, fetchData]);

  // Poll for requests when online
  useEffect(() => {
    if (!isOnline) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) clearInterval(interval);
      fetchData();
      interval = setInterval(fetchData, 10000);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const unsubFocus = navigation.addListener('focus', startPolling);
    const unsubBlur = navigation.addListener('blur', stopPolling);
    startPolling();
    return () => {
      stopPolling();
      unsubFocus();
      unsubBlur();
    };
  }, [isOnline, fetchData, navigation]);

  // WebSocket for receiving targeted ride requests
  useEffect(() => {
    if (!isOnline || !driverProfileIdState) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      ws = new WebSocket(getWebSocketUrl(`/ws/driver/${driverProfileIdState}`, token));
      driverWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ride_request') {
            setRideRequest(data);
            setShowRequestModal(true);
          } else if (data.type === 'ride_expired') {
            setShowRequestModal(false);
            setRideRequest(null);
          }
        } catch (e) {
          console.warn('RiderDashboard WS: Failed to parse message', e);
        }
      };
      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };
      ws.onerror = (e: any) => {
        console.warn('RiderDashboard WS error:', e?.message || 'unknown');
      };
      ws.onclose = () => {
        if (reconnectAttemptsRef.current < MAX_RECONNECTS) {
          const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          reconnectTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      if (driverWsRef.current) driverWsRef.current = null;
    };
  }, [isOnline, driverProfileIdState]);

  // Poll for verification status when pending
  useEffect(() => {
    if (isVerified !== false) return;
    const interval = setInterval(fetchDriverProfile, 15000);
    return () => clearInterval(interval);
  }, [isVerified, fetchDriverProfile]);

  // Continuously update location while online (every 30s)
  useEffect(() => {
    if (!isOnline) return;
    const updateLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc?.coords) {
          await driverService.setAvailability({
            available: true,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch {}
    };
    // Update driver location every 60s to balance accuracy with battery life
    const interval = setInterval(updateLocation, 60000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const handleToggleOnline = async () => {
    if (!isVerified) {
      showToast('Your account is pending admin approval.', 'warning');
      return;
    }
    setTogglingOnline(true);
    if (!isOnline) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Required', 'Please enable location access in settings to go online.');
          setTogglingOnline(false);
          return;
        }

        // Try getting current position with timeout
        let latitude = 0;
        let longitude = 0;

        try {
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
          ]);
          if (loc && 'coords' in loc) {
            latitude = loc.coords.latitude;
            longitude = loc.coords.longitude;
          }
        } catch {}

        // Fallback to last known position
        if (latitude === 0 && longitude === 0) {
          try {
            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown && 'coords' in lastKnown) {
              latitude = lastKnown.coords.latitude;
              longitude = lastKnown.coords.longitude;
            }
          } catch {}
        }

        if (latitude === 0 && longitude === 0) {
          showToast('Could not detect your location. Please enable GPS and try again.', 'error');
          setTogglingOnline(false);
          return;
        }

        await driverService.setAvailability({
          available: true,
          latitude,
          longitude,
        });
        setIsOnline(true);
        setOnlineSince(new Date());
        showToast('You are now online!', 'success');
        fetchData();
      } catch (error: any) {
        showToast(error.response?.data?.error || 'Failed to go online', 'error');
      } finally {
        setTogglingOnline(false);
      }
    } else {
      try {
        await driverService.setAvailability({ available: false });
        setIsOnline(false);
        setOnlineSince(null);
        dismissedRequestIds.current.clear();
        showToast('You are now offline.', 'info');
      } catch (error: any) {
        showToast(error.response?.data?.error || 'Failed to go offline', 'error');
      } finally {
        setTogglingOnline(false);
      }
    }
  };

  const handleAcceptJob = (request: DriverRequest) => {
    if (acceptingJobId !== null) return; // Prevent double-tap
    const fareAmount = request.estimated_fare ?? request.delivery_fee ?? 0;
    const pickupAddr = request.pickup_location ?? request.pickup ?? 'Pickup';
    const dropoffAddr = request.dropoff_location ?? request.dropoff ?? 'Dropoff';
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';

    let details = `₱${fareAmount.toFixed(0)} fare\n\nPickup: ${pickupAddr}\nDropoff: ${dropoffAddr}`;
    if (isDelivery && request.item_description) details += `\nItem: ${request.item_description}`;
    if (request.passenger_name) details += `\nCustomer: ${request.passenger_name}`;

    Alert.alert(`Accept ${jobLabel}?`, details, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setAcceptingJobId(request.id);
          try {
            await driverService.acceptRequest(request.id);
            showToast(`${jobLabel} accepted!`, 'success');
            fetchData();
            navigation.navigate('Tracking', {
              type: isDelivery ? 'delivery' : 'ride',
              rideId: request.id,
              pickup: pickupAddr,
              dropoff: dropoffAddr,
              fare: fareAmount,
            });
          } catch (error: any) {
            if (error.response?.status === 400 || error.response?.status === 404 || error.response?.status === 409) {
              setRequests(prev => prev.filter(r => r.id !== request.id));
              Alert.alert('Unavailable', 'This request has been taken by another rider.');
            } else {
              showToast(error.response?.data?.error || 'Failed to accept', 'error');
            }
            fetchData();
          } finally {
            setAcceptingJobId(null);
          }
        },
      },
    ]);
  };

  const handleDeclineJob = (request: DriverRequest) => {
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';
    Alert.alert(`Decline ${jobLabel}?`, 'This request will be hidden from your list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            dismissedRequestIds.current.add(request.id);
            setRequests(prev => prev.filter(r => r.id !== request.id));
            try {
              await driverService.rejectRequest(request.id);
            } catch {
              // Request may already be taken - dismissal still valid locally
            }
            showToast(`${jobLabel} declined.`, 'info');
          } catch (error: any) {
            showToast(error.response?.data?.error || 'Failed to decline', 'error');
          }
        },
      },
    ]);
  };

  const handleAcceptRideRequest = async (rideId: number, requestData?: any) => {
    setShowRequestModal(false);
    try {
      await driverService.acceptRequest(rideId);
      showToast('Ride accepted!', 'success');
      fetchData();
      navigation.navigate('Tracking', {
        type: 'ride',
        rideId,
        pickup: requestData?.pickup_location ?? rideRequest?.pickup_location ?? '',
        dropoff: requestData?.dropoff_location ?? rideRequest?.dropoff_location ?? '',
        fare: requestData?.estimated_fare ?? rideRequest?.estimated_fare ?? 0,
      });
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to accept ride', 'error');
      fetchData();
    }
    setRideRequest(null);
  };

  const handleDeclineRideRequest = async (rideId: number) => {
    setShowRequestModal(false);
    try {
      await driverService.declineRideRequest(rideId);
    } catch {}
    setRideRequest(null);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getJobIcon = (request: DriverRequest) => {
    if (request.type === 'delivery') return 'cube';
    if (request.type === 'rideshare') return 'people';
    if (request.vehicle_type === 'car') return 'car';
    return 'navigate-circle';
  };

  const getJobColor = (request: DriverRequest) => {
    if (request.type === 'delivery') return COLORS.accent;
    if (request.type === 'rideshare') return COLORS.pasabay;
    return COLORS.success;
  };

  const getJobLabel = (request: DriverRequest) => {
    if (request.type === 'delivery') return 'Delivery';
    if (request.type === 'rideshare') return 'Ride Share';
    if (request.vehicle_type === 'car') return 'Car Ride';
    return 'Motorcycle Ride';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Head to pickup';
      case 'driver_arrived': return 'At pickup';
      case 'picked_up': return 'Item picked up';
      case 'in_progress': return 'In progress';
      default: return status;
    }
  };

  const getTimeAgo = (createdAt?: string) => {
    if (!createdAt) return null;
    try {
      const diffMin = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      return `${Math.floor(diffMin / 60)}h ago`;
    } catch { return null; }
  };

  const getTimeBadgeStyle = (createdAt?: string) => {
    if (!createdAt) return { bg: COLORS.gray100, text: COLORS.gray500 };
    try {
      const diffMin = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
      if (diffMin < 2) return { bg: COLORS.successBg, text: COLORS.successDark };
      if (diffMin < 5) return { bg: COLORS.warningBg, text: COLORS.warningDark };
      return { bg: COLORS.errorBg, text: COLORS.errorDark };
    } catch { return { bg: COLORS.gray100, text: COLORS.gray500 }; }
  };

  const acceptanceRate = earnings.acceptance_rate ?? (earnings.completed_rides > 0 ? Math.round((earnings.completed_rides / Math.max(earnings.completed_rides + (earnings.cancelled_rides ?? 0), 1)) * 100) : 100);
  const riderName = user?.name?.split(' ')[0] || 'Rider';

  // Performance analytics helpers
  const getAcceptanceColor = (rate: number) => {
    if (rate >= 80) return COLORS.success;
    if (rate >= 60) return COLORS.warning;
    return COLORS.error;
  };

  const onlineHours = onlineMinutes / 60;

  const todayRides = earnings.today_rides ?? earnings.completed_rides_today ?? 0;
  const todayEarnings = earnings.today_earnings ?? 0;

  const thisWeekRides = earnings.this_week_rides ?? earnings.weekly_rides ?? todayRides;
  const lastWeekRides = earnings.last_week_rides ?? earnings.previous_week_rides ?? 0;
  const weeklyMax = Math.max(thisWeekRides, lastWeekRides, 1);

  // Peak hours logic
  const peakRanges = [
    { start: 7, end: 9, label: '7-9 AM' },
    { start: 11, end: 13, label: '11 AM-1 PM' },
    { start: 17, end: 20, label: '5-8 PM' },
  ];
  const currentHour = new Date().getHours();
  const isPeakNow = peakRanges.some(r => currentHour >= r.start && currentHour < r.end);
  const getNextPeak = (): string => {
    for (const range of peakRanges) {
      if (currentHour < range.start) {
        const h = range.start > 12 ? range.start - 12 : range.start;
        const suffix = range.start >= 12 ? 'PM' : 'AM';
        return `${h}:00 ${suffix}`;
      }
    }
    return '7:00 AM';
  };
  const avatarUri = user?.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'R')}&background=10B981&color=fff&size=100`;

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.success} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  // Pending Approval Screen
  if (isVerified === false) {
    return (
      <View style={styles.container}>
        <View style={styles.pendingHeader}>
          <View style={styles.pendingHeaderContent}>
            <Text style={styles.pendingHeaderStatus}>PENDING APPROVAL</Text>
            <Text style={styles.pendingHeaderTitle}>Hi, {riderName}</Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.pendingScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => {
              setRefreshing(true);
              await fetchDriverProfile();
              setRefreshing(false);
            }} />
          }
        >
          <View style={styles.pendingCard}>
            <View style={styles.pendingIconCircle}>
              <Ionicons name="hourglass" size={moderateScale(44)} color={COLORS.warning} />
            </View>
            <Text style={styles.pendingTitle}>Awaiting Approval</Text>
            <Text style={styles.pendingDescription}>
              Your application is under review. An admin will verify your documents shortly.
            </Text>

            <View style={styles.pendingSteps}>
              {[
                { icon: 'document-text-outline', label: 'Documents submitted', done: true },
                { icon: 'shield-checkmark-outline', label: 'Admin verification', done: false },
                { icon: 'flash-outline', label: 'Start earning', done: false },
              ].map((step, i) => (
                <View key={i} style={styles.pendingStepRow}>
                  <View style={[styles.pendingStepDot, step.done && styles.pendingStepDotDone]}>
                    <Ionicons
                      name={step.done ? 'checkmark' : (step.icon as any)}
                      size={moderateScale(14)}
                      color={step.done ? COLORS.white : COLORS.warningDark}
                    />
                  </View>
                  {i < 2 && <View style={[styles.pendingStepLine, step.done && styles.pendingStepLineDone]} />}
                  <Text style={[styles.pendingStepLabel, step.done && styles.pendingStepLabelDone]}>
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.checkStatusBtn}
              onPress={async () => {
                setRefreshing(true);
                try {
                  const profileRes = await driverService.getProfile();
                  if (profileRes.data?.data?.is_verified) {
                    setIsVerified(true);
                    wasVerifiedRef.current = true;
                    await refreshUserRef.current();
                    showToast('Account approved! Welcome aboard!', 'success');
                    Vibration.vibrate([0, 200, 100, 200]);
                  } else {
                    showToast('Still pending. Check back later.', 'info');
                  }
                } catch { showToast('Could not check status.', 'error'); }
                setRefreshing(false);
              }}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="refresh" size={moderateScale(18)} color={COLORS.white} />
                  <Text style={styles.checkStatusBtnText}>Check Status</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Removed: No mode switching — riders stay as riders */}
        </ScrollView>
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
      </View>
    );
  }

  const radarScale = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.5] });
  const radarOpacity = radarAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0.2, 0] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, isOnline ? styles.headerOnline : styles.headerOffline]}>
        <View style={styles.headerRow}>
          <View style={styles.headerUserInfo}>
            <Image source={{ uri: avatarUri }} style={styles.headerAvatar} />
            <View style={styles.headerTextArea}>
              <Text style={styles.headerGreeting}>
                {isOnline ? 'You are online' : `Hi, ${riderName}`}
              </Text>
              {isOnline && onlineMinutes > 0 ? (
                <Text style={styles.headerSubtext}>
                  Online for {onlineMinutes < 60 ? `${onlineMinutes} min` : `${Math.floor(onlineMinutes / 60)}h ${onlineMinutes % 60}m`}
                </Text>
              ) : !isOnline ? (
                <Text style={styles.headerSubtext}>Ready to earn today?</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            {isOnline && (
              <Animated.View style={[styles.onlinePulse, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Online/Offline Toggle */}
        <View style={[styles.toggleCard, isOnline && styles.toggleCardOnline]}>
          <TouchableOpacity
            style={styles.toggleTouchArea}
            onPress={handleToggleOnline}
            activeOpacity={0.7}
          >
            <View style={[styles.toggleIcon, isOnline ? styles.toggleIconOn : styles.toggleIconOff]}>
              <Ionicons
                name={isOnline ? 'flash' : 'flash-outline'}
                size={moderateScale(22)}
                color={isOnline ? COLORS.white : COLORS.gray500}
              />
            </View>
            <View style={styles.toggleTextArea}>
              <Text style={[styles.toggleTitle, isOnline && styles.toggleTitleOn]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              <Text style={styles.toggleSubtitle}>
                {isOnline ? 'Receiving requests' : 'Tap to go online'}
              </Text>
            </View>
            {togglingOnline ? (
              <ActivityIndicator size="small" color={isOnline ? COLORS.success : COLORS.gray500} />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={handleToggleOnline}
                trackColor={{ false: COLORS.gray300, true: COLORS.successLight }}
                thumbColor={isOnline ? COLORS.success : COLORS.gray100}
                style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
                accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
                accessibilityRole="switch"
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Active Jobs - Priority section */}
        {activeJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Active Jobs</Text>
              <View style={styles.activeBadge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.activeBadgeText}>LIVE · {activeJobs.length} active</Text>
              </View>
            </View>
            {activeJobs.map((job) => (
              <React.Fragment key={`active-${job.type}-${job.id}`}>
                <TouchableOpacity
                  style={styles.activeJobCard}
                  onPress={() => {
                    if (job.type === 'rideshare') {
                      Alert.alert('Ride Share', `Route: ${job.pickup || 'Pickup'} → ${job.dropoff || 'Dropoff'}\nSeats: ${job.available_seats || 0}/${job.total_seats || 0}\nFare: ₱${(job.base_fare || 0).toFixed(0)}`);
                    } else {
                      navigation.navigate('Tracking', {
                        type: job.type === 'delivery' ? 'delivery' : 'ride',
                        rideId: job.id,
                        pickup: job.pickup_location || job.pickup || 'Pickup',
                        dropoff: job.dropoff_location || job.dropoff || 'Dropoff',
                        fare: job.estimated_fare || job.delivery_fee || 0,
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.activeJobStripe, { backgroundColor: getJobColor(job) }]} />
                  <View style={[styles.activeJobIconWrap, { backgroundColor: `${getJobColor(job)}15` }]}>
                    <Ionicons name={getJobIcon(job) as any} size={moderateScale(20)} color={getJobColor(job)} />
                  </View>
                  <View style={styles.activeJobInfo}>
                    <Text style={styles.activeJobTitle}>{getJobLabel(job)} #{job.id}</Text>
                    <Text style={[styles.activeJobStatus, { color: getJobColor(job) }]}>{getStatusLabel(job.status)}</Text>
                    <Text style={styles.activeJobRoute} numberOfLines={1}>
                      {job.pickup_location || job.pickup || 'Pickup'} → {job.dropoff_location || job.dropoff || 'Dropoff'}
                    </Text>
                  </View>
                  <View style={styles.activeJobRight}>
                    <Text style={[styles.activeJobFare, { color: getJobColor(job) }]}>
                      ₱{(job.estimated_fare || job.delivery_fee || job.base_fare || 0).toFixed(0)}
                    </Text>
                    <View style={styles.activeJobChevron}>
                      <Ionicons name="chevron-forward" size={moderateScale(14)} color={COLORS.gray400} />
                    </View>
                  </View>
                </TouchableOpacity>
                <PaymentVerificationCard
                  serviceType={job.type === 'delivery' ? 'delivery' : 'ride'}
                  serviceId={job.id}
                  paymentMethod={job.payment_method || 'cash'}
                  onVerified={() => showToast('Payment verified!', 'success')}
                />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Earnings Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Earnings</Text>
          <View style={styles.earningsRow}>
            <View style={[styles.earningsCard, styles.earningsCardMain]}>
              <View style={[styles.earningsIconWrap, { backgroundColor: COLORS.successBg }]}>
                <Ionicons name="cash" size={moderateScale(20)} color={COLORS.success} />
              </View>
              <Text style={styles.earningsAmount}>₱{(earnings.today_earnings || 0).toLocaleString()}</Text>
              <Text style={styles.earningsLabel}>Today</Text>
            </View>
            <View style={styles.earningsCard}>
              <View style={[styles.earningsIconWrap, { backgroundColor: COLORS.accentBg }]}>
                <Ionicons name="trending-up" size={moderateScale(20)} color={COLORS.accent} />
              </View>
              <Text style={styles.earningsAmount}>₱{(earnings.total_earnings || 0).toLocaleString()}</Text>
              <Text style={styles.earningsLabel}>Total</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Ionicons name="bicycle" size={moderateScale(16)} color={COLORS.warning} />
              <Text style={styles.statChipValue}>{earnings.completed_rides ?? 0}</Text>
              <Text style={styles.statChipLabel}>Rides</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Ionicons name="star" size={moderateScale(16)} color={COLORS.warning} />
              <Text style={styles.statChipValue}>{(earnings.total_ratings ?? 0) > 0 ? Number(earnings.rating ?? 0).toFixed(1) : 'New'}</Text>
              <Text style={styles.statChipLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: moderateScale(2) }}>
                <Ionicons name="checkmark-circle" size={moderateScale(16)} color={COLORS.success} />
                {acceptanceRate >= 90 && (
                  <Ionicons name="checkmark" size={moderateScale(10)} color={COLORS.success} />
                )}
              </View>
              <Text style={styles.statChipValue}>{acceptanceRate}%</Text>
              <Text style={styles.statChipLabel}>Accept</Text>
            </View>
          </View>
        </View>

        {/* Performance Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance</Text>

          {/* Row 1 - Key Stats */}
          <View style={styles.perfRow}>
            <View style={styles.perfStatCard}>
              <View style={[styles.perfStatDot, { backgroundColor: getAcceptanceColor(acceptanceRate) }]} />
              <Text style={[styles.perfStatValue, { color: getAcceptanceColor(acceptanceRate) }]}>
                {acceptanceRate}%
              </Text>
              <Text style={styles.perfStatLabel}>Acceptance</Text>
            </View>
            <View style={styles.perfStatDivider} />
            <View style={styles.perfStatCard}>
              <Ionicons name="star" size={moderateScale(14)} color={COLORS.warning} />
              <Text style={styles.perfStatValue}>
                {(earnings.total_ratings || 0) > 0 ? `${Number(earnings.rating || 0).toFixed(1)}/5.0` : 'New'}
              </Text>
              <Text style={styles.perfStatLabel}>Rating</Text>
            </View>
            <View style={styles.perfStatDivider} />
            <View style={styles.perfStatCard}>
              <Ionicons name="checkmark-done" size={moderateScale(14)} color={COLORS.success} />
              <Text style={styles.perfStatValue}>{earnings.completed_rides || 0}</Text>
              <Text style={styles.perfStatLabel}>Completed</Text>
            </View>
          </View>

          {/* Row 2 - Today's Performance */}
          <View style={styles.perfTodayCard}>
            <View style={styles.perfTodayHeader}>
              <Ionicons name="today-outline" size={moderateScale(16)} color={COLORS.successDark} />
              <Text style={styles.perfTodayTitle}>Today's Performance</Text>
            </View>
            <View style={styles.perfTodayRow}>
              <View style={styles.perfTodayItem}>
                <Text style={styles.perfTodayValue}>{todayRides}</Text>
                <Text style={styles.perfTodayLabel}>Rides</Text>
              </View>
              <View style={styles.perfTodayDivider} />
              <View style={styles.perfTodayItem}>
                <Text style={styles.perfTodayValue}>
                  ₱{todayEarnings.toLocaleString()}
                </Text>
                <Text style={styles.perfTodayLabel}>Earnings</Text>
              </View>
              <View style={styles.perfTodayDivider} />
              <View style={styles.perfTodayItem}>
                <Text style={styles.perfTodayValue}>
                  {onlineHours >= 1 ? `${onlineHours.toFixed(1)}h` : `${onlineMinutes}m`}
                </Text>
                <Text style={styles.perfTodayLabel}>Online</Text>
              </View>
            </View>
          </View>

          {/* Row 3 - Weekly Comparison */}
          <View style={styles.perfWeeklyCard}>
            <Text style={styles.perfWeeklyTitle}>Weekly Comparison</Text>
            <View style={styles.perfBarRow}>
              <Text style={styles.perfBarLabel}>This week</Text>
              <View style={styles.perfBarTrack}>
                <View
                  style={[
                    styles.perfBarFill,
                    { width: `${Math.round((thisWeekRides / weeklyMax) * 100)}%`, backgroundColor: COLORS.success },
                  ]}
                />
              </View>
              <Text style={styles.perfBarValue}>{thisWeekRides}</Text>
            </View>
            <View style={styles.perfBarRow}>
              <Text style={styles.perfBarLabel}>Last week</Text>
              <View style={styles.perfBarTrack}>
                <View
                  style={[
                    styles.perfBarFill,
                    { width: `${Math.round((lastWeekRides / weeklyMax) * 100)}%`, backgroundColor: COLORS.gray400 },
                  ]}
                />
              </View>
              <Text style={styles.perfBarValue}>{lastWeekRides}</Text>
            </View>
          </View>

          {/* Peak Hours */}
          <View style={styles.perfPeakCard}>
            <View style={styles.perfPeakHeader}>
              <View style={[styles.perfPeakDot, { backgroundColor: isPeakNow ? COLORS.success : COLORS.gray400 }]} />
              <Text style={styles.perfPeakStatus}>
                {isPeakNow ? "It's peak time!" : `Next peak: ${getNextPeak()}`}
              </Text>
            </View>
            <View style={styles.perfPeakTimes}>
              <Ionicons name="time-outline" size={moderateScale(14)} color={COLORS.gray500} />
              <Text style={styles.perfPeakTimesText}>Peak hours: 7-9 AM, 11 AM-1 PM, 5-8 PM</Text>
            </View>
          </View>
        </View>

        {/* Available Requests (when online) */}
        {isOnline && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Available Requests</Text>
              <View style={[styles.requestCountBadge, requests.length > 0 && styles.requestCountBadgeActive]}>
                <Text style={[styles.requestCountText, requests.length > 0 && styles.requestCountTextActive]}>
                  {requests.length}
                </Text>
              </View>
            </View>

            {requests.length > 0 ? (
              requests.map((request) => {
                const timeAgo = getTimeAgo(request.created_at);
                const timeBadge = getTimeBadgeStyle(request.created_at);
                const fare = request.estimated_fare ?? request.delivery_fee ?? 0;
                const customerName = request.passenger_name ?? request.user?.name ?? request.User?.name;
                const customerPhone = request.passenger_phone;

                return (
                  <View key={`${request.type || 'ride'}-${request.id}`} style={[styles.requestCard, { borderLeftWidth: moderateScale(3), borderLeftColor: getJobColor(request) }]}>
                    {/* Header row */}
                    <View style={styles.requestHeader}>
                      <View style={[styles.requestTypeIcon, { backgroundColor: `${getJobColor(request)}12` }]}>
                        <Ionicons name={getJobIcon(request) as any} size={moderateScale(22)} color={getJobColor(request)} />
                      </View>
                      <View style={styles.requestHeaderInfo}>
                        <Text style={styles.requestType}>{getJobLabel(request)}</Text>
                        <View style={styles.requestMeta}>
                          <Text style={styles.requestDistance}>
                            {(request.distance_km ?? request.distance ?? 0).toFixed(1)} km
                          </Text>
                          {timeAgo && (
                            <View style={[styles.requestTimeBadge, { backgroundColor: timeBadge.bg }]}>
                              <Text style={[styles.requestTimeText, { color: timeBadge.text }]}>{timeAgo}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={[styles.requestFare, { color: getJobColor(request) }]}>
                        ₱{fare.toFixed(0)}
                      </Text>
                    </View>

                    {/* Route */}
                    <View style={styles.routeBox}>
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                        <Text style={styles.routeText} numberOfLines={1}>
                          {request.pickup_location || request.pickup || 'Pickup'}
                        </Text>
                      </View>
                      <View style={styles.routeLineWrap}>
                        <View style={styles.routeLine} />
                      </View>
                      <View style={styles.routeRow}>
                        <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
                        <Text style={styles.routeText} numberOfLines={1}>
                          {request.dropoff_location || request.dropoff || 'Dropoff'}
                        </Text>
                      </View>
                    </View>

                    {/* Customer & item info */}
                    <View style={styles.requestDetails}>
                      {!!customerName && (
                        <View style={styles.detailChip}>
                          <Ionicons name="person" size={fontScale(13)} color={COLORS.gray500} />
                          <Text style={styles.detailChipText}>{customerName}</Text>
                        </View>
                      )}
                      {!!customerPhone && (
                        <TouchableOpacity
                          style={styles.detailChip}
                          onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="call" size={fontScale(13)} color={COLORS.success} />
                          <Text style={[styles.detailChipText, { color: COLORS.success }]}>{customerPhone}</Text>
                        </TouchableOpacity>
                      )}
                      {request.type === 'delivery' && !!request.item_description && (
                        <View style={styles.detailChip}>
                          <Ionicons name="cube-outline" size={fontScale(13)} color={COLORS.accent} />
                          <Text style={[styles.detailChipText, { color: COLORS.accent }]} numberOfLines={1}>
                            {request.item_description}
                          </Text>
                        </View>
                      )}
                      {!!request.payment_method && (
                        <View style={styles.detailChip}>
                          <Ionicons name="card-outline" size={fontScale(13)} color={COLORS.gray500} />
                          <Text style={styles.detailChipText}>{request.payment_method.toUpperCase()}</Text>
                        </View>
                      )}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => handleDeclineJob(request)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Decline ${request.type === 'delivery' ? 'delivery' : 'ride'} request`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close" size={moderateScale(18)} color={COLORS.error} />
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: getJobColor(request) }]}
                        onPress={() => handleAcceptJob(request)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Accept ${request.type === 'delivery' ? 'delivery' : 'ride'} request`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.acceptBtnText}>
                          Accept {request.type === 'delivery' ? 'Delivery' : 'Ride'}
                        </Text>
                        <Ionicons name="arrow-forward" size={moderateScale(16)} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.scanningCard}>
                <View style={styles.radarContainer}>
                  <Animated.View
                    style={[styles.radarRing, { transform: [{ scale: radarScale }], opacity: radarOpacity }]}
                  />
                  <View style={styles.radarCenter}>
                    <Ionicons name="radio-outline" size={moderateScale(28)} color={COLORS.success} />
                  </View>
                </View>
                <Text style={styles.scanningTitle}>Scanning for requests...</Text>
                <Text style={styles.scanningText}>
                  New ride and delivery requests will appear here
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Offline CTA */}
        {!isOnline && (
          <View style={styles.section}>
            <View style={styles.offlineCard}>
              <View style={styles.offlineIcons}>
                <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.successBg }]}>
                  <Ionicons name="car-outline" size={moderateScale(22)} color={COLORS.success} />
                </View>
                <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.accentBg, marginTop: verticalScale(-6) }]}>
                  <Ionicons name="cube-outline" size={moderateScale(22)} color={COLORS.accent} />
                </View>
                <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.pasabayBg }]}>
                  <Ionicons name="people-outline" size={moderateScale(22)} color={COLORS.pasabay} />
                </View>
              </View>
              <Text style={styles.offlineTitle}>Start Earning</Text>
              <Text style={styles.offlineText}>
                Go online to receive rides, deliveries, and ride share requests
              </Text>
              <TouchableOpacity style={styles.goOnlineBtn} onPress={handleToggleOnline} activeOpacity={0.8} accessibilityLabel="Go online to receive requests" accessibilityRole="button">
                <Ionicons name="flash" size={moderateScale(18)} color={COLORS.white} />
                <Text style={styles.goOnlineBtnText}>Go Online</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Removed: No mode switching — riders stay as riders */}

        <View style={{ height: verticalScale(20) }} />
      </ScrollView>

      <RiderRequestModal
        visible={showRequestModal}
        request={rideRequest}
        onAccept={handleAcceptRideRequest}
        onDecline={handleDeclineRideRequest}
      />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  loadingText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  // Header
  header: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(52) : verticalScale(38),
    paddingBottom: verticalScale(16),
  },
  headerOnline: {
    backgroundColor: COLORS.successDark,
  },
  headerOffline: {
    backgroundColor: COLORS.gray700,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerTextArea: {
    marginLeft: moderateScale(12),
    flex: 1,
  },
  headerGreeting: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerSubtext: {
    fontSize: fontScale(13),
    color: 'rgba(255,255,255,0.75)',
    marginTop: verticalScale(2),
  },
  headerActions: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(28),
    height: moderateScale(28),
  },
  onlinePulse: {
    position: 'absolute',
    width: moderateScale(16),
    height: moderateScale(16),
    borderRadius: moderateScale(8),
    backgroundColor: '#34D399',
    opacity: 0.4,
  },
  statusDot: {
    width: moderateScale(12),
    height: moderateScale(12),
    borderRadius: moderateScale(6),
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  statusDotOnline: {
    backgroundColor: '#34D399',
  },
  statusDotOffline: {
    backgroundColor: COLORS.gray400,
  },
  scrollContent: {
    paddingTop: verticalScale(4),
  },
  // Toggle Card
  toggleCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(12),
    borderRadius: RESPONSIVE.borderRadius.large,
    ...SHADOWS.md,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
  },
  toggleCardOnline: {
    borderColor: COLORS.successLight,
    backgroundColor: COLORS.successBg,
  },
  toggleTouchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(14),
  },
  toggleIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconOn: {
    backgroundColor: COLORS.success,
  },
  toggleIconOff: {
    backgroundColor: COLORS.gray200,
  },
  toggleTextArea: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  toggleTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  toggleTitleOn: {
    color: COLORS.successDark,
  },
  toggleSubtitle: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(1),
  },
  // Section
  section: {
    marginTop: verticalScale(16),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(10),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(10),
  },
  // Earnings
  earningsRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginBottom: verticalScale(10),
  },
  earningsCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    alignItems: 'center',
    ...SHADOWS.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  earningsCardMain: {
    borderWidth: 1.5,
    borderColor: COLORS.successLight,
    backgroundColor: '#F0FDF4',
  },
  earningsIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  earningsAmount: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  earningsLabel: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
  },
  statChipValue: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginTop: verticalScale(4),
  },
  statChipLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    marginTop: verticalScale(1),
  },
  statDivider: {
    width: 1,
    height: moderateScale(30),
    backgroundColor: COLORS.gray200,
  },
  // Active Jobs
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorBg,
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(12),
    gap: moderateScale(4),
  },
  activeBadgeDot: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    backgroundColor: COLORS.error,
  },
  livePulseDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  activeBadgeText: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: COLORS.errorDark,
  },
  activeJobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(8),
    ...SHADOWS.md,
    overflow: 'hidden',
  },
  activeJobStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: moderateScale(4),
  },
  activeJobIconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(4),
  },
  activeJobInfo: {
    flex: 1,
    marginLeft: moderateScale(10),
  },
  activeJobTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  activeJobStatus: {
    fontSize: fontScale(12),
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  activeJobRoute: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  activeJobRight: {
    alignItems: 'flex-end',
    marginLeft: moderateScale(8),
  },
  activeJobFare: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
  },
  activeJobChevron: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(11),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(4),
  },
  // Request count badge
  requestCountBadge: {
    backgroundColor: COLORS.gray200,
    borderRadius: moderateScale(12),
    minWidth: moderateScale(24),
    height: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(8),
  },
  requestCountBadgeActive: {
    backgroundColor: COLORS.success,
  },
  requestCountText: {
    fontSize: fontScale(11),
    fontWeight: 'bold',
    color: COLORS.gray600,
  },
  requestCountTextActive: {
    color: COLORS.white,
  },
  // Request Card
  requestCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    ...SHADOWS.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  requestTypeIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(10),
  },
  requestType: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  requestMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(3),
    gap: moderateScale(6),
  },
  requestDistance: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    fontWeight: '500',
  },
  requestTimeBadge: {
    paddingHorizontal: moderateScale(6),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(8),
  },
  requestTimeText: {
    fontSize: fontScale(10),
    fontWeight: '600',
  },
  requestFare: {
    fontSize: fontScale(24),
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  // Route box
  routeBox: {
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(10),
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
  },
  routeLineWrap: {
    paddingLeft: moderateScale(3),
    height: verticalScale(14),
    justifyContent: 'center',
  },
  routeLine: {
    width: moderateScale(2),
    height: verticalScale(12),
    backgroundColor: COLORS.gray300,
  },
  routeText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray700,
    marginLeft: moderateScale(8),
  },
  // Request details
  requestDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: moderateScale(8),
    marginBottom: verticalScale(10),
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(8),
    gap: moderateScale(4),
  },
  detailChipText: {
    fontSize: fontScale(12),
    color: COLORS.gray600,
    fontWeight: '500',
  },
  // Action buttons
  requestActions: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  declineBtn: {
    flexDirection: 'row',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(12),
    paddingHorizontal: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorLight,
    gap: moderateScale(4),
  },
  declineBtnText: {
    color: COLORS.error,
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    gap: moderateScale(6),
    ...SHADOWS.colored(COLORS.success),
  },
  acceptBtnText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
  },
  // Scanning empty state
  scanningCard: {
    alignItems: 'center',
    padding: moderateScale(28),
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    ...SHADOWS.sm,
  },
  radarContainer: {
    width: moderateScale(80),
    height: moderateScale(80),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  radarRing: {
    position: 'absolute',
    width: moderateScale(50),
    height: moderateScale(50),
    borderRadius: moderateScale(25),
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  radarCenter: {
    width: moderateScale(50),
    height: moderateScale(50),
    borderRadius: moderateScale(25),
    backgroundColor: COLORS.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(4),
  },
  scanningText: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    textAlign: 'center',
  },
  // Offline
  offlineCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(28),
    ...SHADOWS.md,
  },
  offlineIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
    gap: moderateScale(8),
  },
  offlineIconBubble: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(6),
  },
  offlineText: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(19),
    marginBottom: verticalScale(20),
    paddingHorizontal: moderateScale(8),
  },
  goOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: moderateScale(32),
    paddingVertical: moderateScale(13),
    borderRadius: RESPONSIVE.borderRadius.medium,
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.success),
  },
  goOnlineBtnText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
  },
  // Pending Approval
  pendingHeader: {
    backgroundColor: COLORS.warningDark,
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(52) : verticalScale(38),
    paddingBottom: verticalScale(18),
  },
  pendingHeaderContent: {},
  pendingHeaderStatus: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
    marginBottom: verticalScale(4),
  },
  pendingHeaderTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  pendingScrollContent: {
    flexGrow: 1,
    padding: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(20),
  },
  pendingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  pendingIconCircle: {
    width: moderateScale(88),
    height: moderateScale(88),
    borderRadius: moderateScale(44),
    backgroundColor: COLORS.warningBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  pendingTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  pendingDescription: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(22),
    marginBottom: verticalScale(20),
  },
  pendingSteps: {
    width: '100%',
    marginBottom: verticalScale(20),
  },
  pendingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(4),
  },
  pendingStepDot: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: COLORS.warningBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingStepDotDone: {
    backgroundColor: COLORS.success,
  },
  pendingStepLine: {
    position: 'absolute',
    left: moderateScale(13),
    top: moderateScale(28),
    width: moderateScale(2),
    height: verticalScale(16),
    backgroundColor: COLORS.gray200,
  },
  pendingStepLineDone: {
    backgroundColor: COLORS.success,
  },
  pendingStepLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray600,
    marginLeft: moderateScale(12),
    fontWeight: '500',
  },
  pendingStepLabelDone: {
    color: COLORS.success,
    fontWeight: '600',
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(13),
    paddingHorizontal: moderateScale(24),
    width: '100%',
    gap: moderateScale(8),
  },
  checkStatusBtnText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Performance Analytics
  perfRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    alignItems: 'center',
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  perfStatCard: {
    flex: 1,
    alignItems: 'center',
    gap: verticalScale(4),
  },
  perfStatDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
  },
  perfStatValue: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  perfStatLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
  },
  perfStatDivider: {
    width: 1,
    height: moderateScale(36),
    backgroundColor: COLORS.gray200,
  },
  perfTodayCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  perfTodayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
    marginBottom: verticalScale(10),
  },
  perfTodayTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.successDark,
  },
  perfTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perfTodayItem: {
    flex: 1,
    alignItems: 'center',
  },
  perfTodayValue: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  perfTodayLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
  },
  perfTodayDivider: {
    width: 1,
    height: moderateScale(28),
    backgroundColor: COLORS.gray200,
  },
  perfWeeklyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(10),
    ...SHADOWS.sm,
  },
  perfWeeklyTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(10),
  },
  perfBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  perfBarLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    width: moderateScale(70),
  },
  perfBarTrack: {
    flex: 1,
    height: moderateScale(8),
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(4),
    marginHorizontal: moderateScale(8),
    overflow: 'hidden',
  },
  perfBarFill: {
    height: '100%',
    borderRadius: moderateScale(4),
    minWidth: moderateScale(4),
  },
  perfBarValue: {
    fontSize: fontScale(12),
    fontWeight: '700',
    color: COLORS.gray700,
    width: moderateScale(28),
    textAlign: 'right',
  },
  perfPeakCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    ...SHADOWS.sm,
  },
  perfPeakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
    marginBottom: verticalScale(6),
  },
  perfPeakDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
  },
  perfPeakStatus: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  perfPeakTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(6),
  },
  perfPeakTimesText: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
  },
});
