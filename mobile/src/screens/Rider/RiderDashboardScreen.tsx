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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { driverService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';
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
  const { logout, refreshUser } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [earnings, setEarnings] = useState<any>({ today_earnings: 0, total_earnings: 0, completed_rides: 0 });
  const [requests, setRequests] = useState<DriverRequest[]>([]);
  const [activeJobs, setActiveJobs] = useState<DriverRequest[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const [onlineMinutes, setOnlineMinutes] = useState(0);
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));
  const previousRequestCount = useRef(0);
  const wasVerifiedRef = useRef<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const radarAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

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

  // Pulsing animation for online status
  useEffect(() => {
    if (isOnline) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOnline, pulseAnim]);

  // Radar sweep animation for waiting state
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

  // Glow animation for toggle card
  useEffect(() => {
    if (isOnline) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
        ])
      );
      glow.start();
      return () => glow.stop();
    } else {
      glowAnim.setValue(0.3);
    }
  }, [isOnline, glowAnim]);

  // Fade in animation on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;

  const fetchDriverProfile = useCallback(async () => {
    try {
      const profileRes = await driverService.getProfile();
      const profileData = profileRes.data?.data;
      if (profileData) {
        const newVerified = profileData.is_verified === true;
        setIsVerified(newVerified);

        // Auto-transition: detect approval (false → true)
        if (wasVerifiedRef.current === false && newVerified) {
          // Refresh user from backend to sync role to 'driver'
          await refreshUserRef.current();
          setToast({ visible: true, message: 'Your account has been approved! Welcome aboard!', type: 'success' });
          Vibration.vibrate([0, 200, 100, 200]);
        }
        wasVerifiedRef.current = newVerified;
      }
    } catch (error: any) {
      // 401 is handled by the auth interceptor (auto-logout); don't log as error
      if (error.response?.status !== 401) {
        console.log('Driver profile fetch failed:', error.response?.status || error.message);
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
        const newRequests = Array.isArray(data) ? data : [];
        if (newRequests.length > previousRequestCount.current) {
          Vibration.vibrate(500);
        }
        previousRequestCount.current = newRequests.length;
        setRequests(newRequests);
        const activeData = requestsRes.value?.data?.active;
        setActiveJobs(Array.isArray(activeData) ? activeData : []);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.log('Driver data fetch failed:', error.response?.status || error.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDriverProfile();
    fetchData();
  }, [fetchDriverProfile, fetchData]);

  // Poll for new requests when online AND screen is focused
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
    // Start immediately (focus listener fires on mount but guard against double-start)
    startPolling();
    return () => {
      stopPolling();
      unsubFocus();
      unsubBlur();
    };
  }, [isOnline, fetchData, navigation]);

  // Poll for verification status when pending (every 15s for responsive approval detection)
  useEffect(() => {
    if (isVerified !== false) return;
    const interval = setInterval(fetchDriverProfile, 15000);
    return () => clearInterval(interval);
  }, [isVerified, fetchDriverProfile]);

  const handleToggleOnline = async () => {
    if (!isVerified) {
      showToast('Your account is pending admin approval. You cannot go online yet.', 'warning');
      return;
    }
    if (!isOnline) {
      Alert.alert(
        'Go Online',
        'You will start receiving ride requests. Make sure you are ready!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Online',
            onPress: async () => {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Location Required', 'Please enable location access in settings to go online.');
                  return;
                }
                const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
                const loc = await Promise.race([locationPromise, timeoutPromise]);
                if (!loc || !('coords' in loc)) {
                  Alert.alert('Location Error', 'Could not get your current location. Please try again.');
                  return;
                }
                const lat = loc.coords.latitude;
                const lng = loc.coords.longitude;
                await driverService.setAvailability({ available: true, latitude: lat, longitude: lng });
                setIsOnline(true);
                setOnlineSince(new Date());
                showToast('You are now online! Waiting for requests...', 'success');
                fetchData();
              } catch (error: any) {
                const msg = error.response?.data?.error || 'Failed to go online';
                showToast(msg, 'error');
              }
            },
          },
        ]
      );
    } else {
      try {
        await driverService.setAvailability({ available: false });
        setIsOnline(false);
        setOnlineSince(null);
        showToast('You are now offline.', 'info');
      } catch (error: any) {
        const msg = error.response?.data?.error || 'Failed to go offline. Please try again.';
        showToast(msg, 'error');
      }
    }
  };

  const handleAcceptJob = (request: DriverRequest) => {
    const fareAmount = request.estimated_fare || request.delivery_fee || 0;
    const pickupAddr = request.pickup_location || request.pickup || 'Pickup';
    const dropoffAddr = request.dropoff_location || request.dropoff || 'Dropoff';
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';

    let details = `Accept ${jobLabel.toLowerCase()} for ₱${fareAmount.toFixed(0)}?\n\nPickup: ${pickupAddr}\nDropoff: ${dropoffAddr}`;
    if (isDelivery && request.item_description) {
      details += `\nItem: ${request.item_description}`;
    }
    if (request.passenger_name) {
      details += `\nCustomer: ${request.passenger_name}`;
    }

    Alert.alert(
      `Accept ${jobLabel}`,
      details,
      [
        { text: 'Decline', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await driverService.acceptRequest(request.id);
              await fetchData();
              showToast(`${jobLabel} accepted! Heading to pickup.`, 'success');
              navigation.navigate('Tracking', {
                type: isDelivery ? 'delivery' : 'ride',
                rideId: request.id,
                pickup: pickupAddr,
                dropoff: dropoffAddr,
                fare: fareAmount,
              });
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to accept request';
              // Remove from local list if request is no longer available
              if (error.response?.status === 400 || error.response?.status === 404 || error.response?.status === 409) {
                setRequests(prev => prev.filter(r => r.id !== request.id));
                Alert.alert('Request Unavailable', 'This request has already been taken by another rider or is no longer available.');
              } else {
                showToast(msg, 'error');
              }
              fetchData();
            }
          },
        },
      ]
    );
  };

  const handleDeclineJob = (request: DriverRequest) => {
    const isDelivery = request.type === 'delivery';
    const jobLabel = isDelivery ? 'Delivery' : 'Ride';
    Alert.alert(
      `Decline ${jobLabel}`,
      `Are you sure you want to decline this ${jobLabel.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              if (request.status === 'pending') {
                // Pending requests: just dismiss from local list (not accepted yet)
                setRequests(prev => prev.filter(r => r.id !== request.id));
              } else {
                // Accepted requests: call API to reject and return to pending
                await driverService.rejectRequest(request.id);
                fetchData();
              }
              showToast(`${jobLabel} declined.`, 'info');
            } catch (error: any) {
              const msg = error.response?.data?.error || 'Failed to decline request';
              showToast(msg, 'error');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getJobIcon = (request: DriverRequest) => {
    if (request.type === 'delivery') return 'cube';
    if (request.type === 'rideshare') return 'people';
    switch (request.vehicle_type) {
      case 'motorcycle': return 'navigate-circle';
      case 'car': return 'car';
      default: return 'navigate-circle';
    }
  };

  const getJobColor = (request: DriverRequest) => {
    if (request.type === 'delivery') return COLORS.accent;
    if (request.type === 'rideshare') return COLORS.pasabay;
    return COLORS.success;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Accepted - Head to pickup';
      case 'driver_arrived': return 'At pickup location';
      case 'picked_up': return 'Item picked up';
      case 'in_progress': return 'In progress';
      default: return status;
    }
  };

  const getTimeAgo = (createdAt?: string) => {
    if (!createdAt) return null;
    try {
      const created = new Date(createdAt);
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin === 1) return '1 min ago';
      if (diffMin < 60) return `${diffMin} min ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ago`;
    } catch {
      return null;
    }
  };

  const getTimeAgoBadgeColor = (createdAt?: string) => {
    if (!createdAt) return { bg: COLORS.gray100, text: COLORS.gray500 };
    try {
      const created = new Date(createdAt);
      const now = new Date();
      const diffMin = Math.floor((now.getTime() - created.getTime()) / 60000);
      if (diffMin < 2) return { bg: COLORS.successBg, text: COLORS.successDark };
      if (diffMin < 5) return { bg: COLORS.warningBg, text: COLORS.warningDark };
      return { bg: COLORS.errorBg, text: COLORS.errorDark };
    } catch {
      return { bg: COLORS.gray100, text: COLORS.gray500 };
    }
  };

  // Acceptance rate from backend, fallback to 100% for new drivers
  const acceptanceRate = earnings.acceptance_rate ?? (earnings.completed_rides > 0 ? 95 : 100);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.success} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  // Show Pending Approval screen if driver is not verified
  if (isVerified === false) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { backgroundColor: COLORS.warningDark }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerStatusText}>PENDING APPROVAL</Text>
              <Text style={styles.headerTitle}>Rider Dashboard</Text>
            </View>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => navigation.navigate('RiderProfile')}
            >
              <Ionicons name="person-circle" size={moderateScale(36)} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
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
              <Ionicons name="hourglass" size={moderateScale(48)} color={COLORS.warning} />
            </View>
            <Text style={styles.pendingTitle}>
              Awaiting Admin Approval
            </Text>
            <Text style={styles.pendingDescription}>
              Your rider application has been submitted and is under review. An admin will verify your documents and approve your account.
            </Text>

            <View style={styles.pendingStepsCard}>
              <Text style={styles.pendingStepsHeader}>
                What happens next?
              </Text>
              {[
                { icon: 'document-text-outline', text: 'Admin reviews your documents' },
                { icon: 'shield-checkmark-outline', text: 'Your account gets verified' },
                { icon: 'flash-outline', text: 'You can go online and start earning' },
              ].map((step, index) => (
                <View key={index} style={styles.pendingStepRow}>
                  <View style={styles.pendingStepIcon}>
                    <Ionicons name={step.icon as any} size={moderateScale(14)} color={COLORS.warningDark} />
                  </View>
                  <Text style={styles.pendingStepText}>
                    {step.text}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.checkStatusButton}
              onPress={async () => {
                setRefreshing(true);
                try {
                  const profileRes = await driverService.getProfile();
                  const profileData = profileRes.data?.data;
                  if (profileData?.is_verified) {
                    setIsVerified(true);
                    wasVerifiedRef.current = true;
                    await refreshUserRef.current();
                    showToast('Your account has been approved! Welcome aboard!', 'success');
                    Vibration.vibrate([0, 200, 100, 200]);
                  } else {
                    showToast('Still pending approval. Please check back later.', 'info');
                  }
                } catch {
                  showToast('Could not check status. Try again.', 'error');
                }
                setRefreshing(false);
              }}
            >
              <Ionicons name="refresh" size={moderateScale(18)} color={COLORS.gray600} style={{ marginRight: moderateScale(8) }} />
              <Text style={styles.checkStatusText}>
                Check Status
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.continueAsUserButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
          >
            <Text style={styles.continueAsUserText}>
              Continue as User
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
      </View>
    );
  }

  const radarScale = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 2.5],
  });
  const radarOpacity = radarAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.6, 0.2, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, isOnline ? styles.headerOnline : styles.headerOffline]}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.headerStatusRow}>
              <Animated.View
                style={[
                  styles.headerDot,
                  isOnline ? styles.headerDotOnline : styles.headerDotOffline,
                  isOnline && { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text style={styles.headerStatusText}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
            <Text style={styles.headerTitle}>Rider Dashboard</Text>
            {isOnline && onlineMinutes > 0 && (
              <View style={styles.onlineTimerRow}>
                <Ionicons name="time-outline" size={fontScale(13)} color="rgba(255,255,255,0.8)" />
                <Text style={styles.onlineTimerText}>
                  Online for {onlineMinutes < 60 ? `${onlineMinutes} min` : `${Math.floor(onlineMinutes / 60)}h ${onlineMinutes % 60}m`}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('RiderProfile')}
          >
            <Ionicons name="person-circle" size={moderateScale(36)} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Online/Offline Toggle Card */}
        <View style={[
          styles.toggleCard,
          isOnline && styles.toggleCardOnline,
        ]}>
          <View style={styles.toggleTouchArea}>
            <TouchableOpacity
              style={styles.toggleLeft}
              onPress={handleToggleOnline}
              activeOpacity={0.7}
            >
              <View style={[
                styles.toggleIconContainer,
                isOnline ? styles.toggleIconOnline : styles.toggleIconOffline,
              ]}>
                <Ionicons
                  name={isOnline ? 'flash' : 'flash-outline'}
                  size={moderateScale(24)}
                  color={isOnline ? COLORS.white : COLORS.gray500}
                />
              </View>
              <View style={styles.toggleTextArea}>
                <Text style={[styles.toggleTitle, isOnline && styles.toggleTitleOnline]}>
                  {isOnline ? 'You are Online' : 'You are Offline'}
                </Text>
                <Text style={styles.toggleSubtitle}>
                  {isOnline
                    ? 'Receiving ride & delivery requests'
                    : 'Tap to start accepting requests'}
                </Text>
              </View>
            </TouchableOpacity>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: COLORS.gray300, true: COLORS.successLight }}
              thumbColor={isOnline ? COLORS.success : COLORS.gray100}
              style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
            />
          </View>
        </View>

        {/* Active Jobs Banner */}
        {activeJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Jobs</Text>
              <View style={styles.activeCountBadge}>
                <Ionicons name="pulse" size={fontScale(12)} color={COLORS.white} />
                <Text style={styles.activeCountText}>{activeJobs.length}</Text>
              </View>
            </View>
            {activeJobs.map((job) => (
              <TouchableOpacity
                key={`active-${job.type}-${job.id}`}
                style={styles.activeJobCard}
                onPress={() => {
                  if (job.type === 'rideshare') {
                    Alert.alert('Ride Share', `Route: ${job.pickup || 'Pickup'} → ${job.dropoff || 'Dropoff'}\nSeats: ${job.available_seats || 0}/${job.total_seats || 0}\nFare: ₱${(job.base_fare || 0).toFixed(0)}\nPassengers: ${job.passengers?.join(', ') || 'None yet'}`);
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
                <View style={[styles.activeJobAccent, { backgroundColor: getJobColor(job) }]} />
                <View style={[styles.activeJobIcon, { backgroundColor: `${getJobColor(job)}15` }]}>
                  <Ionicons name={getJobIcon(job) as any} size={moderateScale(22)} color={getJobColor(job)} />
                </View>
                <View style={styles.activeJobInfo}>
                  <Text style={styles.activeJobTitle}>
                    {job.type === 'delivery' ? 'Delivery' : job.type === 'rideshare' ? 'Ride Share' : 'Ride'} #{job.id}
                  </Text>
                  <Text style={styles.activeJobStatus}>{getStatusLabel(job.status)}</Text>
                  <Text style={styles.activeJobRoute} numberOfLines={1}>
                    {job.pickup_location || job.pickup || 'Pickup'} → {job.dropoff_location || job.dropoff || 'Dropoff'}
                  </Text>
                </View>
                <View style={styles.activeJobRight}>
                  <Text style={[styles.activeJobFare, { color: getJobColor(job) }]}>
                    ₱{(job.estimated_fare || job.delivery_fee || job.base_fare || 0).toFixed(0)}
                  </Text>
                  <View style={styles.activeJobChevron}>
                    <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.gray400} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.successBg }]}>
                <Ionicons name="cash" size={moderateScale(22)} color={COLORS.success} />
              </View>
              <Text style={styles.statValue}>₱{(earnings.today_earnings || 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.accentBg }]}>
                <Ionicons name="wallet" size={moderateScale(22)} color={COLORS.accent} />
              </View>
              <Text style={styles.statValue}>₱{(earnings.total_earnings || 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.warningBg }]}>
                <Ionicons name="bicycle" size={moderateScale(22)} color={COLORS.warning} />
              </View>
              <Text style={styles.statValue}>{earnings.completed_rides || 0}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.warningBg }]}>
                <Ionicons name="star" size={moderateScale(22)} color={COLORS.warningLight} />
              </View>
              <Text style={styles.statValue}>{Number(earnings.rating || 5.0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>

          {/* Acceptance Rate Bar */}
          <View style={styles.acceptanceCard}>
            <View style={styles.acceptanceHeader}>
              <View style={styles.acceptanceLeft}>
                <Ionicons name="checkmark-circle" size={moderateScale(18)} color={COLORS.success} />
                <Text style={styles.acceptanceLabel}>Acceptance Rate</Text>
              </View>
              <Text style={styles.acceptanceValue}>{acceptanceRate}%</Text>
            </View>
            <View style={styles.acceptanceBarBg}>
              <View
                style={[
                  styles.acceptanceBarFill,
                  {
                    width: `${acceptanceRate}%`,
                    backgroundColor: acceptanceRate >= 90 ? COLORS.success : acceptanceRate >= 70 ? COLORS.warning : COLORS.error,
                  },
                ]}
              />
            </View>
            <Text style={styles.acceptanceHint}>
              {acceptanceRate >= 90 ? 'Excellent! Keep it up.' : 'Try to accept more requests for better earnings.'}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('RiderEarnings')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.successBg }]}>
              <Ionicons name="wallet-outline" size={moderateScale(22)} color={COLORS.success} />
            </View>
            <Text style={styles.quickActionText}>Earnings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('RiderProfile')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.accentBg }]}>
              <Ionicons name="person-outline" size={moderateScale(22)} color={COLORS.accent} />
            </View>
            <Text style={styles.quickActionText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => Alert.alert('Rider Help', 'Need assistance?\n\nEmail: driver-support@omji.app\nPhone: +63 912 345 6789\n\nCommon Issues:\n\u2022 Can\'t go online? Check GPS and internet\n\u2022 Ride not showing? Pull down to refresh\n\u2022 Payment issues? Contact support\n\nHours: 24/7 driver support')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="help-circle-outline" size={moderateScale(22)} color={COLORS.gray600} />
            </View>
            <Text style={styles.quickActionText}>Help</Text>
          </TouchableOpacity>
        </View>

        {/* Available Jobs */}
        {isOnline && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Requests</Text>
              <View style={[
                styles.availableBadge,
                requests.length > 0 && styles.availableBadgeActive,
              ]}>
                <Text style={[
                  styles.availableBadgeText,
                  requests.length > 0 && styles.availableBadgeTextActive,
                ]}>
                  {requests.length}
                </Text>
              </View>
            </View>

            {requests.length > 0 ? (
              requests.map((request) => {
                const timeAgo = getTimeAgo(request.created_at);
                const timeColors = getTimeAgoBadgeColor(request.created_at);
                return (
                  <View key={`${request.type || 'ride'}-${request.id}`} style={styles.jobCard}>
                    {/* Time ago badge */}
                    {timeAgo && (
                      <View style={[styles.timeAgoBadge, { backgroundColor: timeColors.bg }]}>
                        <Ionicons name="time-outline" size={fontScale(11)} color={timeColors.text} />
                        <Text style={[styles.timeAgoText, { color: timeColors.text }]}>{timeAgo}</Text>
                      </View>
                    )}

                    <View style={styles.jobHeader}>
                      <View
                        style={[
                          styles.jobIcon,
                          { backgroundColor: `${getJobColor(request)}12` },
                        ]}
                      >
                        <Ionicons
                          name={getJobIcon(request) as any}
                          size={moderateScale(24)}
                          color={getJobColor(request)}
                        />
                      </View>
                      <View style={styles.jobHeaderInfo}>
                        <Text style={styles.jobService}>
                          {request.type === 'delivery' ? 'Delivery' : request.vehicle_type === 'motorcycle' ? 'Motorcycle Ride' : request.vehicle_type === 'car' ? 'Car Ride' : 'Ride'}
                        </Text>
                        <View style={styles.jobMetrics}>
                          <View style={styles.jobMetricChip}>
                            <Ionicons name="navigate-outline" size={fontScale(11)} color={COLORS.gray500} />
                            <Text style={styles.jobMetric}>
                              {(request.distance_km || request.distance || 0).toFixed(1)} km
                            </Text>
                          </View>
                          {!!request.payment_method && (
                            <View style={[styles.jobMetricChip, { marginLeft: moderateScale(6) }]}>
                              <Ionicons name="card-outline" size={fontScale(11)} color={COLORS.gray500} />
                              <Text style={styles.jobMetric}>{request.payment_method.toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.jobFareContainer}>
                        <Text style={[styles.jobFare, { color: getJobColor(request) }]}>
                          ₱{(request.estimated_fare || request.delivery_fee || 0).toFixed(0)}
                        </Text>
                        <Text style={styles.jobFareLabel}>Est. fare</Text>
                      </View>
                    </View>

                    <View style={styles.jobBody}>
                      <View style={styles.locationRow}>
                        <View style={styles.locationDotContainer}>
                          <View style={styles.locationDot} />
                        </View>
                        <Text style={styles.locationText} numberOfLines={1}>
                          {request.pickup_location || request.pickup || 'Pickup'}
                        </Text>
                      </View>
                      <View style={styles.locationConnectorContainer}>
                        <View style={styles.locationConnector} />
                      </View>
                      <View style={styles.locationRow}>
                        <View style={styles.locationDotContainer}>
                          <View style={[styles.locationDot, styles.locationDotDropoff]} />
                        </View>
                        <Text style={styles.locationText} numberOfLines={1}>
                          {request.dropoff_location || request.dropoff || 'Dropoff'}
                        </Text>
                      </View>
                    </View>

                    {!!(request.passenger_name || request.user?.name || request.User?.name) && (
                      <View style={styles.infoChip}>
                        <View style={[styles.infoChipIcon, { backgroundColor: COLORS.gray100 }]}>
                          <Ionicons name="person" size={fontScale(14)} color={COLORS.gray600} />
                        </View>
                        <Text style={styles.infoChipText}>
                          {request.passenger_name || request.user?.name || request.User?.name}
                        </Text>
                      </View>
                    )}

                    {!!(request.type === 'delivery' && request.item_description) && (
                      <View style={styles.infoChip}>
                        <View style={[styles.infoChipIcon, { backgroundColor: COLORS.accentBg }]}>
                          <Ionicons name="cube-outline" size={fontScale(14)} color={COLORS.accent} />
                        </View>
                        <Text style={[styles.infoChipText, { color: COLORS.accent }]} numberOfLines={1}>
                          {request.item_description}
                        </Text>
                      </View>
                    )}

                    {!!request.passenger_phone && (
                      <View style={styles.infoChip}>
                        <View style={[styles.infoChipIcon, { backgroundColor: COLORS.successBg }]}>
                          <Ionicons name="call-outline" size={fontScale(14)} color={COLORS.success} />
                        </View>
                        <Text style={[styles.infoChipText, { color: COLORS.success }]}>
                          {request.passenger_phone}
                        </Text>
                      </View>
                    )}

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.declineButton}
                        onPress={() => handleDeclineJob(request)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={moderateScale(18)} color={COLORS.error} />
                        <Text style={styles.declineButtonText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptButton, { backgroundColor: getJobColor(request) }]}
                        onPress={() => handleAcceptJob(request)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptButtonText}>
                          Accept {request.type === 'delivery' ? 'Delivery' : 'Ride'}
                        </Text>
                        <Ionicons name="arrow-forward" size={moderateScale(18)} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyJobs}>
                <View style={styles.radarContainer}>
                  <Animated.View
                    style={[
                      styles.radarRing,
                      {
                        transform: [{ scale: radarScale }],
                        opacity: radarOpacity,
                      },
                    ]}
                  />
                  <View style={styles.radarCenter}>
                    <Ionicons name="radio-outline" size={moderateScale(32)} color={COLORS.success} />
                  </View>
                </View>
                <Text style={styles.emptyJobsTitle}>Scanning for requests...</Text>
                <Text style={styles.emptyJobsText}>
                  We'll notify you when a new ride or delivery request comes in
                </Text>
                <View style={styles.emptyJobsTips}>
                  <View style={styles.tipRow}>
                    <Ionicons name="checkmark-circle" size={fontScale(14)} color={COLORS.success} />
                    <Text style={styles.tipText}>GPS is active</Text>
                  </View>
                  <View style={styles.tipRow}>
                    <Ionicons name="checkmark-circle" size={fontScale(14)} color={COLORS.success} />
                    <Text style={styles.tipText}>Notifications enabled</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Offline Message */}
        {!isOnline && (
          <View style={styles.offlineCard}>
            <View style={styles.offlineIconGrid}>
              <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.successBg }]}>
                <Ionicons name="car-outline" size={moderateScale(24)} color={COLORS.success} />
              </View>
              <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.accentBg, marginTop: verticalScale(-8) }]}>
                <Ionicons name="cube-outline" size={moderateScale(24)} color={COLORS.accent} />
              </View>
              <View style={[styles.offlineIconBubble, { backgroundColor: COLORS.pasabayBg }]}>
                <Ionicons name="people-outline" size={moderateScale(24)} color={COLORS.pasabay} />
              </View>
            </View>
            <Text style={styles.offlineTitle}>Ready to earn?</Text>
            <Text style={styles.offlineText}>
              Go online to start receiving ride requests, deliveries, and ride share bookings
            </Text>
            <TouchableOpacity
              style={styles.goOnlineButton}
              onPress={handleToggleOnline}
              activeOpacity={0.8}
            >
              <View style={styles.goOnlineGradient}>
                <Ionicons name="flash" size={moderateScale(20)} color={COLORS.white} />
                <Text style={styles.goOnlineButtonText}>Go Online</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>

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
    paddingBottom: verticalScale(18),
  },
  headerOnline: {
    backgroundColor: COLORS.successDark,
  },
  headerOffline: {
    backgroundColor: COLORS.gray700,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(4),
  },
  headerDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    marginRight: moderateScale(6),
  },
  headerDotOnline: {
    backgroundColor: COLORS.successLight,
  },
  headerDotOffline: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  headerStatusText: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  onlineTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  onlineTimerText: {
    fontSize: fontScale(12),
    color: 'rgba(255,255,255,0.8)',
    marginLeft: moderateScale(4),
  },
  profileButton: {
    padding: moderateScale(4),
  },
  scrollContent: {
    paddingTop: verticalScale(4),
  },
  // Toggle Card
  toggleCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(16),
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
    justifyContent: 'space-between',
    padding: moderateScale(16),
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleIconContainer: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(14),
  },
  toggleIconOnline: {
    backgroundColor: COLORS.success,
  },
  toggleIconOffline: {
    backgroundColor: COLORS.gray200,
  },
  toggleTextArea: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  toggleTitleOnline: {
    color: COLORS.successDark,
  },
  toggleSubtitle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  // Section
  section: {
    marginTop: verticalScale(20),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: moderateScale(-5),
    marginTop: verticalScale(4),
  },
  statCard: {
    width: '46%',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    margin: moderateScale(5),
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  statValue: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  statLabel: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  // Acceptance Rate Card
  acceptanceCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginTop: verticalScale(10),
    ...SHADOWS.sm,
  },
  acceptanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  acceptanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  acceptanceLabel: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray700,
    marginLeft: moderateScale(6),
  },
  acceptanceValue: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  acceptanceBarBg: {
    height: moderateScale(6),
    backgroundColor: COLORS.gray200,
    borderRadius: moderateScale(3),
    overflow: 'hidden',
  },
  acceptanceBarFill: {
    height: '100%',
    borderRadius: moderateScale(3),
  },
  acceptanceHint: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    marginTop: verticalScale(6),
  },
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(20),
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(14),
    alignItems: 'center',
    marginHorizontal: moderateScale(4),
    ...SHADOWS.sm,
  },
  quickActionIcon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(6),
  },
  quickActionText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  // Available Badge
  availableBadge: {
    backgroundColor: COLORS.gray200,
    borderRadius: moderateScale(12),
    minWidth: moderateScale(24),
    height: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
    paddingHorizontal: moderateScale(8),
  },
  availableBadgeActive: {
    backgroundColor: COLORS.success,
  },
  availableBadgeText: {
    fontSize: fontScale(11),
    fontWeight: 'bold',
    color: COLORS.gray600,
  },
  availableBadgeTextActive: {
    color: COLORS.white,
  },
  // Active count badge
  activeCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning,
    borderRadius: moderateScale(12),
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(3),
    marginLeft: moderateScale(8),
  },
  activeCountText: {
    fontSize: fontScale(11),
    fontWeight: 'bold',
    color: COLORS.white,
    marginLeft: moderateScale(3),
  },
  // Job Card
  jobCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
    ...SHADOWS.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  timeAgoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: moderateScale(8),
    paddingVertical: moderateScale(3),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(10),
  },
  timeAgoText: {
    fontSize: fontScale(11),
    fontWeight: '600',
    marginLeft: moderateScale(3),
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  jobIcon: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  jobService: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(4),
  },
  jobMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobMetricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: moderateScale(7),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(6),
  },
  jobMetric: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    fontWeight: '500',
    marginLeft: moderateScale(3),
  },
  jobFareContainer: {
    alignItems: 'flex-end',
  },
  jobFare: {
    fontSize: fontScale(22),
    fontWeight: 'bold',
    color: COLORS.success,
  },
  jobFareLabel: {
    fontSize: fontScale(10),
    color: COLORS.gray400,
    marginTop: verticalScale(1),
  },
  jobBody: {
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(10),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDotContainer: {
    width: moderateScale(20),
    alignItems: 'center',
  },
  locationDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
    backgroundColor: COLORS.success,
  },
  locationDotDropoff: {
    backgroundColor: COLORS.error,
  },
  locationConnectorContainer: {
    width: moderateScale(20),
    alignItems: 'center',
    height: verticalScale(16),
  },
  locationConnector: {
    width: moderateScale(2),
    height: verticalScale(14),
    backgroundColor: COLORS.gray300,
  },
  locationText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray700,
    marginLeft: moderateScale(8),
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  infoChipIcon: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: moderateScale(8),
  },
  infoChipText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray700,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginTop: verticalScale(4),
  },
  declineButton: {
    flexDirection: 'row',
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(13),
    paddingHorizontal: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorLight,
  },
  declineButtonText: {
    color: COLORS.error,
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    marginLeft: moderateScale(4),
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(13),
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.colored(COLORS.success),
  },
  acceptButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    marginRight: moderateScale(6),
  },
  // Empty state
  emptyJobs: {
    alignItems: 'center',
    padding: moderateScale(32),
    paddingTop: moderateScale(40),
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    ...SHADOWS.sm,
  },
  radarContainer: {
    width: moderateScale(100),
    height: moderateScale(100),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(16),
  },
  radarRing: {
    position: 'absolute',
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  radarCenter: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    backgroundColor: COLORS.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyJobsTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: verticalScale(6),
  },
  emptyJobsText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(20),
    paddingHorizontal: moderateScale(16),
    marginBottom: verticalScale(16),
  },
  emptyJobsTips: {
    flexDirection: 'row',
    gap: moderateScale(16),
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginLeft: moderateScale(4),
  },
  // Offline card
  offlineCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: RESPONSIVE.marginHorizontal,
    marginTop: verticalScale(32),
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(32),
    ...SHADOWS.md,
  },
  offlineIconGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(20),
    gap: moderateScale(8),
  },
  offlineIconBubble: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(8),
  },
  offlineText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(20),
    marginBottom: verticalScale(24),
    paddingHorizontal: moderateScale(8),
  },
  goOnlineButton: {
    borderRadius: RESPONSIVE.borderRadius.medium,
    overflow: 'hidden',
    ...SHADOWS.colored(COLORS.success),
  },
  goOnlineGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(36),
    paddingVertical: moderateScale(14),
    backgroundColor: COLORS.success,
    borderRadius: RESPONSIVE.borderRadius.medium,
  },
  goOnlineButtonText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginLeft: moderateScale(8),
  },
  // Active Job Card
  activeJobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(8),
    ...SHADOWS.md,
    overflow: 'hidden',
  },
  activeJobAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: moderateScale(4),
    borderTopLeftRadius: RESPONSIVE.borderRadius.medium,
    borderBottomLeftRadius: RESPONSIVE.borderRadius.medium,
  },
  activeJobIcon: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(4),
  },
  activeJobInfo: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  activeJobTitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  activeJobStatus: {
    fontSize: fontScale(12),
    color: COLORS.warning,
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  activeJobRoute: {
    fontSize: fontScale(12),
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
    marginBottom: verticalScale(4),
  },
  activeJobChevron: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pending approval screen
  pendingScrollContent: {
    flexGrow: 1,
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(24),
  },
  pendingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(24),
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  pendingIconCircle: {
    width: moderateScale(100),
    height: moderateScale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.warningBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  pendingTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
    textAlign: 'center',
  },
  pendingDescription: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(22),
    marginBottom: verticalScale(24),
    paddingHorizontal: moderateScale(8),
  },
  pendingStepsCard: {
    backgroundColor: COLORS.warningBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    width: '100%',
    marginBottom: verticalScale(20),
  },
  pendingStepsHeader: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
    color: COLORS.warningDark,
    marginBottom: verticalScale(10),
  },
  pendingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  pendingStepIcon: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(12),
  },
  pendingStepText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray700,
    flex: 1,
  },
  checkStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(24),
    width: '100%',
  },
  checkStatusText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  continueAsUserButton: {
    marginTop: verticalScale(20),
    alignItems: 'center',
    paddingVertical: moderateScale(14),
  },
  continueAsUserText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.accent,
    fontWeight: '600',
  },
});
