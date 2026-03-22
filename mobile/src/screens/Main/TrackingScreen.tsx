import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Modal,
  TextInput,
  Animated,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { rideService, deliveryService, driverService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';
import { COLORS, SHADOWS, formatStatus } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

const { width, height } = Dimensions.get('window');

const STATUS_CONFIG: Record<string, { label: string; description: string; icon: string; color: string }> = {
  pending: { label: 'Finding Your Rider', description: 'Searching for the nearest available rider near you...', icon: 'search', color: COLORS.warning },
  accepted: { label: 'Rider On the Way', description: 'Your rider has accepted and is heading to your pickup point.', icon: 'checkmark-circle', color: COLORS.accent },
  driver_arrived: { label: 'Rider Has Arrived', description: 'Your rider is waiting at the pickup location. Please proceed.', icon: 'location', color: COLORS.pasabay },
  picked_up: { label: 'Item Picked Up', description: 'Your item has been collected and is being transported.', icon: 'cube', color: COLORS.pasabay },
  in_progress: { label: 'On the Way', description: 'Sit back and relax! You are heading to your destination.', icon: 'navigate', color: COLORS.success },
  completed: { label: 'Trip Completed', description: 'You have arrived! Thank you for riding with OMJI.', icon: 'checkmark-done-circle', color: COLORS.success },
  cancelled: { label: 'Trip Cancelled', description: 'This trip has been cancelled.', icon: 'close-circle', color: COLORS.error },
};

const PAYMENT_LABELS: Record<string, { name: string; icon: string; color: string }> = {
  cash: { name: 'Cash', icon: 'cash-outline', color: COLORS.warning },
  gcash: { name: 'GCash', icon: 'phone-portrait-outline', color: '#0070E0' },
  maya: { name: 'Maya', icon: 'card-outline', color: '#00B251' },
  wallet: { name: 'OMJI Wallet', icon: 'wallet-outline', color: COLORS.pasabay },
};

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

const getTrackingMapHTML = (pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css" />
  <style>
    * { margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #ECEEF1; }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"><\/script>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, keepBuffer: 6, subdomains: 'abcd', updateWhenZooming: false, updateWhenIdle: true
    }).addTo(map);

    var pickup = [${pickupLat}, ${pickupLng}];
    var dropoff = [${dropoffLat}, ${dropoffLng}];

    // Bigger, nicer markers
    var greenIcon = L.divIcon({
      html: '<div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));"><div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#34D399,#10B981);border:3px solid white;"></div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #10B981;margin-top:-2px;"></div></div>',
      iconSize: [22, 29], iconAnchor: [11, 29], className: ''
    });
    var redIcon = L.divIcon({
      html: '<div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3));"><div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#F87171,#EF4444);border:3px solid white;"></div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #EF4444;margin-top:-2px;"></div></div>',
      iconSize: [22, 29], iconAnchor: [11, 29], className: ''
    });

    L.marker(pickup, { icon: greenIcon }).addTo(map);
    L.marker(dropoff, { icon: redIcon }).addTo(map);

    // Fit bounds first with padding
    map.fitBounds([pickup, dropoff], { padding: [50, 50], maxZoom: 16 });

    // Try to get actual road route from OSRM
    var routeLine = null;
    fetch('https://router.project-osrm.org/route/v1/driving/' + pickup[1] + ',' + pickup[0] + ';' + dropoff[1] + ',' + dropoff[0] + '?overview=full&geometries=geojson')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.routes && data.routes[0]) {
          var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
          // Draw route shadow first for depth
          L.polyline(coords, { color: '#1E40AF', weight: 7, opacity: 0.15, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          // Draw main route line
          routeLine = L.polyline(coords, { color: '#3B82F6', weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [50, 50], maxZoom: 16 });
        } else {
          // Fallback to dashed straight line
          L.polyline([pickup, dropoff], { color: '#3B82F6', weight: 3, opacity: 0.7, dashArray: '10,8' }).addTo(map);
        }
      })
      .catch(function() {
        // Fallback to dashed straight line
        L.polyline([pickup, dropoff], { color: '#3B82F6', weight: 3, opacity: 0.7, dashArray: '10,8' }).addTo(map);
      });

    // Driver location handler
    function handleDriverLocation(d) {
      if (!window._driverMarker) {
        var driverIcon = L.divIcon({
          html: '<div style="position:relative;"><div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#60A5FA,#3B82F6);border:3px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.45);"></div><div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(59,130,246,0.3);animation:ping 1.5s ease-in-out infinite;"></div></div><style>@keyframes ping{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.3;transform:scale(1.4);}}</style>',
          iconSize: [24, 24], iconAnchor: [12, 12], className: ''
        });
        window._driverMarker = L.marker([d.lat, d.lng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        window._driverMarker.setLatLng([d.lat, d.lng]);
      }
    }

    function onMsg(e) {
      try {
        var d = JSON.parse(e.data);
        if (d.type === 'driverLocation') handleDriverLocation(d);
      } catch(err) {}
    }
    window.addEventListener('message', onMsg);
    document.addEventListener('message', onMsg);
  <\/script>
</body>
</html>
`;

export default function TrackingScreen({ route, navigation }: any) {
  const { rideId, pickup, dropoff, fare, type = 'ride' } = route.params || {};
  const { user } = useAuth();
  const isDriver = user?.role === 'rider' || user?.role === 'driver';
  const webRef = useRef<any>(null);
  const [status, setStatus] = useState('pending');
  const [rideData, setRideData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Animation refs
  const starAnims = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for pending status
  useEffect(() => {
    if (status === 'pending') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [status, pulseAnim]);

  // Search elapsed timer for pending status with auto-cancel suggestion
  useEffect(() => {
    if (status === 'pending') {
      setSearchElapsed(0);
      const timer = setInterval(() => {
        setSearchElapsed(prev => {
          const next = prev + 1;
          if (next === 300) { // 5 minutes
            Alert.alert(
              'No Riders Found',
              'No riders are available right now. Would you like to keep waiting or cancel?',
              [
                { text: 'Keep Waiting', style: 'cancel' },
                { text: 'Cancel Ride', style: 'destructive', onPress: () => handleCancel() },
              ]
            );
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status]);

  const statusSteps = type === 'delivery'
    ? ['pending', 'accepted', 'driver_arrived', 'picked_up', 'in_progress', 'completed']
    : ['pending', 'accepted', 'driver_arrived', 'in_progress', 'completed'];

  const statusStepLabels: Record<string, string> = {
    pending: 'Requested',
    accepted: 'Accepted',
    driver_arrived: 'Arrived',
    picked_up: 'Picked Up',
    in_progress: 'En Route',
    completed: 'Done',
  };

  const fetchRideDetails = useCallback(async () => {
    if (!rideId) { setLoading(false); return; }
    try {
      const response = type === 'delivery'
        ? await deliveryService.getDeliveryDetails(rideId)
        : await rideService.getRideDetails(rideId);
      const data = response.data?.data;
      setRideData(data);
      setStatus(data?.status || 'pending');
    } catch (error) {
      console.error('Error fetching ride details:', error);
    } finally {
      setLoading(false);
    }
  }, [rideId, type]);

  useEffect(() => {
    fetchRideDetails();
    // Stop polling once ride is completed or cancelled
    if (status === 'completed' || status === 'cancelled') return;
    const interval = setInterval(fetchRideDetails, 5000);
    return () => clearInterval(interval);
  }, [fetchRideDetails, status]);

  const getCurrentStepIndex = () => statusSteps.indexOf(status);
  const currentStepIndex = getCurrentStepIndex();

  const getNextDriverStatus = (): { status: string; label: string; icon: string } | null => {
    if (type === 'delivery') {
      switch (status) {
        case 'accepted': return { status: 'driver_arrived', label: 'Arrived at Pickup', icon: 'location' };
        case 'driver_arrived': return { status: 'picked_up', label: 'Picked Up Item', icon: 'cube' };
        case 'picked_up': return { status: 'in_progress', label: 'Start Delivery', icon: 'navigate' };
        case 'in_progress': return { status: 'completed', label: 'Complete Delivery', icon: 'checkmark-done-circle' };
        default: return null;
      }
    }
    switch (status) {
      case 'accepted': return { status: 'driver_arrived', label: 'Arrived at Pickup', icon: 'location' };
      case 'driver_arrived': return { status: 'in_progress', label: 'Start Ride', icon: 'navigate' };
      case 'in_progress': return { status: 'completed', label: 'Complete Ride', icon: 'checkmark-done-circle' };
      default: return null;
    }
  };

  const handleUpdateStatus = async () => {
    const next = getNextDriverStatus();
    if (!next || !rideId) return;

    const confirmMsg = next.status === 'completed'
      ? `Mark this ${type} as completed? This will finalize the fare.`
      : `Update status to "${next.label}"?`;

    Alert.alert('Update Status', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdatingStatus(true);
          try {
            if (type === 'delivery') {
              await driverService.updateDeliveryStatus(rideId, next.status);
            } else {
              await driverService.updateRideStatus(rideId, next.status);
            }
            setStatus(next.status);
            fetchRideDetails();
          } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to update status';
            showToast(msg, 'error');
          } finally {
            setUpdatingStatus(false);
          }
        },
      },
    ]);
  };

  const handleCancel = async () => {
    if (!rideId) return;
    const itemType = type === 'delivery' ? 'delivery' : 'ride';
    Alert.alert(`Cancel ${itemType === 'delivery' ? 'Delivery' : 'Ride'}`, `Are you sure you want to cancel this ${itemType}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            if (type === 'delivery') {
              await deliveryService.cancelDelivery(rideId);
            } else {
              await rideService.cancelRide(rideId);
            }
            showToast(`Your ${itemType} has been cancelled.`, 'success');
            setTimeout(() => navigation.goBack(), 1000);
          } catch (error: any) {
            const msg = error.response?.data?.error || `Failed to cancel ${itemType}`;
            showToast(msg, 'error');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const handleShareTrip = async () => {
    try {
      const tripType = type === 'delivery' ? 'delivery' : 'ride';
      await Share.share({
        message: `I'm on an OMJI ${tripType}! From: ${pickupLabel} To: ${dropoffLabel}. Track my trip on OMJI app.`,
      });
    } catch {
      Alert.alert('Share Trip', 'Share your live trip details with friends and family for safety. This feature will be fully available soon!');
    }
  };

  const handleStarPress = (star: number) => {
    setRating(star);
    // Bounce animation on the selected star
    Animated.sequence([
      Animated.timing(starAnims[star - 1], { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(starAnims[star - 1], { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  };

  const pickupLabel = rideData?.pickup_location || rideData?.pickup || pickup || 'Pickup';
  const dropoffLabel = rideData?.dropoff_location || rideData?.dropoff || dropoff || 'Dropoff';
  const rideFare = rideData?.final_fare || rideData?.estimated_fare || rideData?.delivery_fee || rideData?.fare || fare || 0;
  const rideDistance = rideData?.distance_km || rideData?.distance || 0;
  const paymentMethod = rideData?.payment_method || 'cash';
  const pickupLat = rideData?.pickup_latitude || rideData?.pickup_lat || 0;
  const pickupLng = rideData?.pickup_longitude || rideData?.pickup_lng || 0;
  const dropoffLat = rideData?.dropoff_latitude || rideData?.dropoff_lat || 0;
  const dropoffLng = rideData?.dropoff_longitude || rideData?.dropoff_lng || 0;
  const driverInfo = rideData?.driver || rideData?.Driver;
  const driverVehicle = rideData?.driver || rideData?.Driver;
  // For driver→passenger chat, we need the passenger info
  const passengerInfo = rideData?.user || rideData?.User;
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const paymentInfo = PAYMENT_LABELS[paymentMethod] || PAYMENT_LABELS.cash;

  // ETA estimation: average speed ~25 km/h for city rides
  const estimatedEtaMinutes = rideDistance > 0 ? Math.round((rideDistance / 25) * 60) : 0;

  // Send driver location to WebView map when ride data updates
  useEffect(() => {
    if (rideData && webRef.current && driverInfo && status !== 'pending') {
      const dLat = driverInfo?.current_latitude || driverInfo?.latitude;
      const dLng = driverInfo?.current_longitude || driverInfo?.longitude;
      if (dLat && dLng) {
        webRef.current.postMessage(JSON.stringify({ type: 'driverLocation', lat: dLat, lng: dLng }));
      }
    }
  }, [rideData?.id, rideData?.driver, status]);

  // Auto-show rating when ride completes (for users only)
  useEffect(() => {
    if (status === 'completed' && !isDriver && !hasRated && driverInfo) {
      const timer = setTimeout(() => setShowRating(true), 800);
      return () => clearTimeout(timer);
    }
  }, [status, isDriver, hasRated, driverInfo]);

  const handleSubmitRating = async () => {
    if (!rideId) return;
    setSubmittingRating(true);
    try {
      if (type === 'delivery') {
        await deliveryService.rateDelivery(rideId, rating);
      } else {
        await rideService.rateRide(rideId, rating, review);
      }
      setHasRated(true);
      setShowRating(false);
      showToast('Thank you! Your rating has been submitted.', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to submit rating';
      showToast(msg, 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading trip details...</Text>
        </View>
      </View>
    );
  }

  // Error state: no valid ride ID or no ride data loaded
  if (!rideId || (!rideData && !loading)) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={moderateScale(48)} color={COLORS.error} />
          <Text style={[styles.loadingText, { color: COLORS.error, marginTop: verticalScale(12) }]}>
            Could not load trip details
          </Text>
          <Text style={[styles.loadingText, { fontSize: fontScale(13), color: COLORS.gray500, marginTop: verticalScale(4) }]}>
            The booking may not have been created. Please go back and try again.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: COLORS.accent, paddingHorizontal: moderateScale(24), paddingVertical: moderateScale(12), borderRadius: moderateScale(8), marginTop: verticalScale(16) }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: COLORS.white, fontWeight: '600', fontSize: fontScale(15) }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Use Balingasag default if coordinates are invalid (0,0)
  const DEFAULT_LAT = 8.4343;
  const DEFAULT_LNG = 124.7762;
  const mapPickupLat = pickupLat !== 0 ? pickupLat : DEFAULT_LAT;
  const mapPickupLng = pickupLng !== 0 ? pickupLng : DEFAULT_LNG;
  const mapDropoffLat = dropoffLat !== 0 ? dropoffLat : DEFAULT_LAT + 0.005;
  const mapDropoffLng = dropoffLng !== 0 ? dropoffLng : DEFAULT_LNG + 0.005;

  return (
    <View style={styles.container}>
      {/* Map */}
      {(mapPickupLat && mapPickupLng && mapDropoffLat && mapDropoffLng) ? (
        <WebView
          ref={webRef}
          source={{ html: getTrackingMapHTML(mapPickupLat, mapPickupLng, mapDropoffLat, mapDropoffLng) }}
          style={styles.map}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          cacheEnabled={true}
          cacheMode={'LOAD_CACHE_ELSE_NETWORK' as any}
        />
      ) : (
        <View style={[styles.map, { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="map-outline" size={48} color="#D1D5DB" />
          <Text style={{ color: '#9CA3AF', marginTop: 8 }}>Map loading...</Text>
        </View>
      )}

      {/* Top Bar Buttons */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarButton} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          {status !== 'completed' && status !== 'cancelled' && (
            <TouchableOpacity style={styles.topBarButton} onPress={handleShareTrip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Share trip" accessibilityRole="button">
              <Ionicons name="share-outline" size={moderateScale(20)} color={COLORS.gray800} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {/* Handle Indicator */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: `${statusInfo.color}12` }]}>
            <Animated.View style={[
              styles.statusIconCircle,
              { backgroundColor: searchElapsed >= 90 && status === 'pending' ? COLORS.error : statusInfo.color },
              status === 'pending' && { transform: [{ scale: pulseAnim }] },
            ]}>
              <Ionicons name={searchElapsed >= 90 && status === 'pending' ? 'alert-circle' : statusInfo.icon as any} size={moderateScale(22)} color={COLORS.white} />
            </Animated.View>
            <View style={styles.statusTextContainer}>
              <Text style={[styles.statusTitle, { color: searchElapsed >= 90 && status === 'pending' ? COLORS.error : statusInfo.color }]}>
                {searchElapsed >= 90 && status === 'pending' ? 'No Riders Available' : statusInfo.label}
              </Text>
              <Text style={styles.statusDescription}>
                {status === 'pending'
                  ? searchElapsed >= 90
                    ? 'No riders are available nearby right now. Please try again later or cancel and retry.'
                    : `Searching for the nearest available rider... (${Math.floor(searchElapsed / 60)}:${(searchElapsed % 60).toString().padStart(2, '0')})`
                  : statusInfo.description}
              </Text>
            </View>
            {status === 'pending' && searchElapsed < 90 && (
              <ActivityIndicator size="small" color={statusInfo.color} />
            )}
          </View>

          {/* ETA Display */}
          {estimatedEtaMinutes > 0 && status !== 'pending' && status !== 'completed' && status !== 'cancelled' && (
            <View style={styles.etaContainer}>
              <View style={styles.etaIconBox}>
                <Ionicons name="time" size={moderateScale(16)} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.etaLabel}>Estimated Arrival</Text>
                <Text style={styles.etaValue}>
                  {estimatedEtaMinutes < 60 ? `${estimatedEtaMinutes} min` : `${Math.floor(estimatedEtaMinutes / 60)}h ${estimatedEtaMinutes % 60}m`}
                </Text>
              </View>
            </View>
          )}

          {/* Vertical Timeline Stepper */}
          {status === 'cancelled' ? (
            <View style={styles.cancelledContainer}>
              <View style={styles.cancelledIconCircle}>
                <Ionicons name="close" size={moderateScale(28)} color={COLORS.white} />
              </View>
              <Text style={styles.cancelledText}>
                This {type === 'delivery' ? 'delivery' : 'ride'} has been cancelled
              </Text>
              <Text style={styles.cancelledSubtext}>No charges were applied to your account.</Text>
            </View>
          ) : (
            <View style={styles.timelineContainer}>
              <Text style={styles.timelineSectionTitle}>Trip Progress</Text>
              {statusSteps.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isUpcoming = index > currentStepIndex;
                const stepConfig = STATUS_CONFIG[step];
                const isLast = index === statusSteps.length - 1;

                return (
                  <View key={step} style={styles.timelineStep}>
                    {/* Dot and Line */}
                    <View style={styles.timelineDotColumn}>
                      <View style={[
                        styles.timelineDot,
                        isCompleted && styles.timelineDotCompleted,
                        isCurrent && [styles.timelineDotCurrent, { borderColor: stepConfig?.color || COLORS.accent }],
                        isUpcoming && styles.timelineDotUpcoming,
                      ]}>
                        {isCompleted && (
                          <Ionicons name="checkmark" size={moderateScale(12)} color={COLORS.white} />
                        )}
                        {isCurrent && (
                          <View style={[styles.timelineDotInner, { backgroundColor: stepConfig?.color || COLORS.accent }]} />
                        )}
                      </View>
                      {!isLast && (
                        <View style={[
                          styles.timelineLineVertical,
                          isCompleted && styles.timelineLineCompleted,
                        ]} />
                      )}
                    </View>
                    {/* Label */}
                    <View style={styles.timelineLabel}>
                      <Text style={[
                        styles.timelineLabelText,
                        isCompleted && styles.timelineLabelCompleted,
                        isCurrent && [styles.timelineLabelCurrent, { color: stepConfig?.color || COLORS.accent }],
                        isUpcoming && styles.timelineLabelUpcoming,
                      ]}>
                        {statusStepLabels[step] || formatStatus(step)}
                      </Text>
                      {isCurrent && (
                        <Text style={styles.timelineLabelDesc}>{stepConfig?.description || ''}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Contact Card - Shows driver info for passengers, passenger info for drivers */}
          {!!(isDriver ? (passengerInfo || rideData?.user_id) : driverInfo) && status !== 'pending' && (
            <View style={styles.driverCard}>
              <View style={styles.driverCardHeader}>
                <Text style={styles.driverCardTitle}>{isDriver ? 'Passenger' : 'Your Rider'}</Text>
              </View>
              <View style={styles.driverInfo}>
                {(isDriver ? passengerInfo?.profile_image : driverInfo?.profile_image) ? (
                  <Image source={{ uri: isDriver ? passengerInfo.profile_image : driverInfo.profile_image }} style={styles.driverPhoto} />
                ) : (
                  <View style={[styles.driverPhoto, styles.driverPhotoPlaceholder]}>
                    <Ionicons name="person" size={moderateScale(24)} color={COLORS.gray400} />
                  </View>
                )}
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>
                    {isDriver ? (passengerInfo?.name || 'Passenger') : (driverInfo?.name || 'Driver')}
                  </Text>
                  {!isDriver && (
                    <View style={styles.driverMeta}>
                      <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Ionicons
                            key={`driver-star-${star}`}
                            name={star <= Math.round(Number(driverInfo?.rating || driverVehicle?.rating || 5)) ? 'star' : 'star-outline'}
                            size={moderateScale(14)}
                            color={star <= Math.round(Number(driverInfo?.rating || driverVehicle?.rating || 5)) ? COLORS.warningDark : COLORS.gray300}
                          />
                        ))}
                        <Text style={styles.driverRatingNum}>
                          {Number(driverInfo?.rating || driverVehicle?.rating || 5.0).toFixed(1)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {!isDriver && !!(driverVehicle?.vehicle_model || driverVehicle?.vehicle_type) && (
                    <View style={styles.vehicleRow}>
                      <Ionicons name="bicycle-outline" size={moderateScale(14)} color={COLORS.gray500} />
                      <Text style={styles.driverVehicle}>
                        {[driverVehicle.vehicle_type, driverVehicle.vehicle_model].filter(Boolean).join(' - ')}
                      </Text>
                    </View>
                  )}
                </View>
                {!isDriver && !!(driverVehicle?.vehicle_plate) && (
                  <View style={styles.plateContainer}>
                    <Text style={styles.plateText}>{driverVehicle.vehicle_plate}</Text>
                  </View>
                )}
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Chat', {
                    rider: isDriver ? (passengerInfo || { id: rideData?.user_id, name: 'Passenger' }) : driverInfo,
                    rideId: type === 'ride' ? rideId : undefined,
                    deliveryId: type === 'delivery' ? rideId : undefined,
                  })}
                  accessibilityLabel={`Message ${isDriver ? 'passenger' : 'rider'}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.actionBtnIcon, { backgroundColor: COLORS.accentBg }]}>
                    <Ionicons name="chatbubble-ellipses" size={moderateScale(18)} color={COLORS.accent} />
                  </View>
                  <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    const contactPhone = isDriver ? passengerInfo?.phone : driverInfo?.phone;
                    if (contactPhone) {
                      Linking.openURL(`tel:${contactPhone}`);
                    } else {
                      Alert.alert('No Phone', 'Phone number is not available. Try chat instead.');
                    }
                  }}
                  accessibilityLabel={`Call ${isDriver ? 'passenger' : 'rider'}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.actionBtnIcon, { backgroundColor: COLORS.successBg }]}>
                    <Ionicons name="call" size={moderateScale(18)} color={COLORS.success} />
                  </View>
                  <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Route Details */}
          <View style={styles.routeCard}>
            <Text style={styles.routeCardTitle}>Route Details</Text>
            <View style={styles.routeContent}>
              <View style={styles.routeTimeline}>
                <View style={[styles.routeDotOuter, { borderColor: COLORS.success, backgroundColor: `${COLORS.success}15` }]}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                </View>
                <View style={styles.routeLineVertical} />
                <View style={[styles.routeDotOuter, { borderColor: COLORS.error, backgroundColor: `${COLORS.error}15` }]}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
                </View>
              </View>
              <View style={styles.routeDetails}>
                <View style={styles.routeStop}>
                  <Text style={[styles.routeLabel, { color: COLORS.success, fontWeight: '700' }]}>PICKUP</Text>
                  <Text style={styles.routeAddress} numberOfLines={3}>{pickupLabel}</Text>
                </View>
                <View style={styles.routeStopDivider} />
                <View style={styles.routeStop}>
                  <Text style={[styles.routeLabel, { color: COLORS.error, fontWeight: '700' }]}>DROP-OFF</Text>
                  <Text style={styles.routeAddress} numberOfLines={3}>{dropoffLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Fare & Payment Summary */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryItem, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
              <View style={[styles.summaryIconCircle, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="speedometer-outline" size={moderateScale(18)} color={COLORS.white} />
              </View>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={[styles.summaryValue, { color: '#1E40AF' }]}>{rideDistance > 0 ? `${Number(rideDistance).toFixed(1)} km` : '--'}</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
              <View style={[styles.summaryIconCircle, { backgroundColor: '#22C55E' }]}>
                <Ionicons name={paymentInfo.icon as any} size={moderateScale(18)} color={COLORS.white} />
              </View>
              <Text style={styles.summaryLabel}>Payment</Text>
              <Text style={[styles.summaryValue, { color: '#166534' }]}>{paymentInfo.name}</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' }]}>
              <View style={[styles.summaryIconCircle, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="cash-outline" size={moderateScale(18)} color={COLORS.white} />
              </View>
              <Text style={styles.summaryLabel}>{status === 'completed' ? 'Total' : 'Estimated'}</Text>
              <Text style={[styles.summaryValue, { color: '#92400E', fontSize: RESPONSIVE.fontSize.large }]}>
                {'\u20B1'}{Number(rideFare || 0).toFixed(0)}
              </Text>
            </View>
          </View>

          {/* Driver Status Update Button */}
          {isDriver && !!getNextDriverStatus() && (
            <TouchableOpacity
              style={styles.driverActionButton}
              onPress={handleUpdateStatus}
              disabled={updatingStatus}
              activeOpacity={0.8}
              accessibilityLabel={`Update status to ${getNextDriverStatus()!.label}`}
              accessibilityRole="button"
            >
              {updatingStatus ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name={getNextDriverStatus()!.icon as any} size={moderateScale(20)} color={COLORS.white} />
                  <Text style={styles.driverActionButtonText}>{getNextDriverStatus()!.label}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Actions */}
          {status !== 'completed' && status !== 'cancelled' && !isDriver && (
            <TouchableOpacity
              style={[
                styles.cancelButton,
                (status === 'in_progress' || status === 'picked_up') && styles.cancelButtonDisabled,
              ]}
              onPress={handleCancel}
              disabled={cancelling || status === 'in_progress' || status === 'picked_up'}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={status === 'in_progress' || status === 'picked_up' ? 'Cannot cancel after pickup' : `Cancel ${type === 'delivery' ? 'delivery' : 'ride'}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: cancelling || status === 'in_progress' || status === 'picked_up' }}
            >
              {cancelling ? (
                <ActivityIndicator color={COLORS.error} />
              ) : status === 'in_progress' || status === 'picked_up' ? (
                <>
                  <Ionicons name="lock-closed-outline" size={moderateScale(18)} color={COLORS.gray400} />
                  <Text style={[styles.cancelButtonText, { color: COLORS.gray400 }]}>
                    Cannot cancel after pickup
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={moderateScale(18)} color={COLORS.error} />
                  <Text style={styles.cancelButtonText}>Cancel {type === 'delivery' ? 'Delivery' : 'Ride'}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'completed' && !isDriver && (
            <View>
              {!hasRated && !!driverInfo && (
                <TouchableOpacity
                  style={styles.rateButton}
                  onPress={() => setShowRating(true)}
                  activeOpacity={0.8}
                  accessibilityLabel="Rate your rider"
                  accessibilityRole="button"
                >
                  <Ionicons name="star" size={moderateScale(20)} color={COLORS.warningDark} />
                  <Text style={styles.rateButtonText}>Rate Your Rider</Text>
                  <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.warningDark} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={moderateScale(20)} color={COLORS.white} />
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === 'completed' && isDriver && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={moderateScale(20)} color={COLORS.white} />
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: isIOS ? verticalScale(32) : verticalScale(40) }} />
        </ScrollView>
      </View>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />

      {/* Rating Modal */}
      <Modal visible={showRating} animationType="slide" transparent>
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingModal}>
            {/* Close button */}
            <TouchableOpacity
              style={styles.ratingCloseBtn}
              onPress={() => { setShowRating(false); setHasRated(true); }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close rating"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={moderateScale(22)} color={COLORS.gray500} />
            </TouchableOpacity>

            {/* Driver avatar in modal */}
            {!!driverInfo && (
              <View style={styles.ratingDriverAvatar}>
                {driverInfo.profile_image ? (
                  <Image source={{ uri: driverInfo.profile_image }} style={styles.ratingDriverImage} />
                ) : (
                  <View style={[styles.ratingDriverImage, styles.ratingDriverImagePlaceholder]}>
                    <Ionicons name="person" size={moderateScale(30)} color={COLORS.gray400} />
                  </View>
                )}
              </View>
            )}

            <Text style={styles.ratingTitle}>How was your trip?</Text>
            {!!driverInfo && (
              <Text style={styles.ratingDriverName}>with {driverInfo.name || 'Driver'}</Text>
            )}

            {/* Star rating with bounce animation */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={`star-${star}`}
                  onPress={() => handleStarPress(star)}
                  style={styles.starButton}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel={`Rate ${star} star${star !== 1 ? 's' : ''}`}
                  accessibilityRole="button"
                >
                  <Animated.View style={{ transform: [{ scale: starAnims[star - 1] }] }}>
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={moderateScale(44)}
                      color={star <= rating ? COLORS.warningDark : COLORS.gray300}
                    />
                  </Animated.View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Rating label with color feedback */}
            <View style={[
              styles.ratingLabelBadge,
              { backgroundColor: rating >= 4 ? COLORS.successBg : rating >= 3 ? COLORS.warningBg : COLORS.errorBg },
            ]}>
              <Text style={[
                styles.ratingLabel,
                { color: rating >= 4 ? COLORS.successDark : rating >= 3 ? COLORS.warningDark : COLORS.errorDark },
              ]}>
                {RATING_LABELS[rating - 1]}
              </Text>
            </View>

            {type !== 'delivery' && (
              <TextInput
                style={styles.reviewInput}
                placeholder="Share your experience (optional)"
                placeholderTextColor={COLORS.gray400}
                value={review}
                onChangeText={setReview}
                multiline
                numberOfLines={3}
              />
            )}

            <TouchableOpacity
              style={styles.submitRatingButton}
              onPress={handleSubmitRating}
              disabled={submittingRating}
              activeOpacity={0.8}
              accessibilityLabel="Submit rating"
              accessibilityRole="button"
            >
              {submittingRating ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="star" size={moderateScale(18)} color={COLORS.white} />
                  <Text style={styles.submitRatingText}>Submit Rating</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipRatingButton}
              onPress={() => { setShowRating(false); setHasRated(true); }}
              accessibilityLabel="Skip rating"
              accessibilityRole="button"
            >
              <Text style={styles.skipRatingText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: verticalScale(12),
  },
  loadingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  map: {
    width,
    height: height * 0.42,
  },
  markerPickup: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.lg,
  },
  markerDropoff: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(14),
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.lg,
  },
  markerRider: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.xl,
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: isIOS ? verticalScale(50) : verticalScale(35),
    left: RESPONSIVE.paddingHorizontal,
    right: RESPONSIVE.paddingHorizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  topBarButton: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  // Bottom sheet
  bottomSheet: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderTopRightRadius: RESPONSIVE.borderRadius.xlarge,
    marginTop: moderateScale(-24),
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    ...SHADOWS.xl,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  handle: {
    width: moderateScale(40),
    height: moderateScale(4),
    borderRadius: moderateScale(2),
    backgroundColor: COLORS.gray300,
  },
  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    marginBottom: verticalScale(12),
  },
  statusIconCircle: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextContainer: {
    flex: 1,
    marginLeft: moderateScale(12),
  },
  statusTitle: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '800',
  },
  statusDescription: {
    fontSize: fontScale(13),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
    lineHeight: fontScale(18),
  },
  // ETA
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(12),
    marginBottom: verticalScale(12),
    gap: moderateScale(12),
  },
  etaIconBox: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaLabel: {
    fontSize: fontScale(11),
    color: COLORS.gray500,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaValue: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '800',
    color: COLORS.accentDark,
  },
  // Cancelled
  cancelledContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(24),
    marginBottom: verticalScale(12),
  },
  cancelledIconCircle: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  cancelledText: {
    fontSize: RESPONSIVE.fontSize.large,
    color: COLORS.error,
    fontWeight: '700',
  },
  cancelledSubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    marginTop: verticalScale(4),
  },
  // Vertical Timeline
  timelineContainer: {
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(12),
  },
  timelineSectionTitle: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: verticalScale(14),
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineDotColumn: {
    alignItems: 'center',
    width: moderateScale(28),
  },
  timelineDot: {
    width: moderateScale(22),
    height: moderateScale(22),
    borderRadius: moderateScale(11),
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotCompleted: {
    backgroundColor: COLORS.success,
  },
  timelineDotCurrent: {
    backgroundColor: COLORS.white,
    borderWidth: moderateScale(3),
  },
  timelineDotUpcoming: {
    backgroundColor: COLORS.gray200,
  },
  timelineDotInner: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
  },
  timelineLineVertical: {
    width: moderateScale(2),
    height: verticalScale(24),
    backgroundColor: COLORS.gray200,
    marginVertical: verticalScale(2),
  },
  timelineLineCompleted: {
    backgroundColor: COLORS.success,
  },
  timelineLabel: {
    flex: 1,
    marginLeft: moderateScale(12),
    paddingBottom: verticalScale(8),
    minHeight: moderateScale(28),
    justifyContent: 'center',
  },
  timelineLabelText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  timelineLabelCompleted: {
    color: COLORS.success,
  },
  timelineLabelCurrent: {
    fontWeight: '700',
    fontSize: RESPONSIVE.fontSize.regular,
  },
  timelineLabelUpcoming: {
    color: COLORS.gray400,
  },
  timelineLabelDesc: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
    marginTop: verticalScale(2),
    lineHeight: fontScale(17),
  },
  // Driver Card
  driverCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOWS.sm,
  },
  driverCardHeader: {
    marginBottom: verticalScale(12),
  },
  driverCardTitle: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(14),
  },
  driverPhoto: {
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    borderWidth: moderateScale(3),
    borderColor: COLORS.accentLight,
  },
  driverPhotoPlaceholder: {
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: COLORS.gray200,
  },
  driverDetails: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  driverName: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(2),
  },
  driverRatingNum: {
    fontSize: fontScale(13),
    fontWeight: '700',
    color: COLORS.warningDark,
    marginLeft: moderateScale(6),
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: moderateScale(6),
  },
  driverVehicle: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
  },
  plateContainer: {
    backgroundColor: COLORS.gray900,
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(6),
  },
  plateText: {
    fontSize: fontScale(12),
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },
  driverActions: {
    flexDirection: 'row',
    gap: moderateScale(10),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.small,
    paddingVertical: moderateScale(12),
    gap: moderateScale(8),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  actionBtnIcon: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
  },
  // Route Card
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.large,
    padding: moderateScale(18),
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: COLORS.gray100,
    ...SHADOWS.md,
  },
  routeCardTitle: {
    fontSize: fontScale(11),
    fontWeight: '700',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: verticalScale(14),
  },
  routeContent: {
    flexDirection: 'row',
  },
  routeTimeline: {
    alignItems: 'center',
    width: moderateScale(24),
    paddingTop: verticalScale(2),
  },
  routeDotOuter: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: moderateScale(2.5),
  },
  routeDot: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
  },
  routeLineVertical: {
    width: 0,
    flex: 1,
    borderLeftWidth: moderateScale(2),
    borderLeftColor: COLORS.gray300,
    borderStyle: 'dashed',
    marginVertical: verticalScale(4),
  },
  routeDetails: {
    flex: 1,
    marginLeft: moderateScale(14),
  },
  routeStop: {
    paddingVertical: verticalScale(2),
  },
  routeStopDivider: {
    height: verticalScale(16),
  },
  routeLabel: {
    fontSize: fontScale(11),
    fontWeight: '600',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray800,
    fontWeight: '500',
    marginTop: verticalScale(3),
    lineHeight: fontScale(21),
  },
  // Summary Cards
  summaryRow: {
    flexDirection: 'row',
    gap: moderateScale(8),
    marginBottom: verticalScale(12),
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: RESPONSIVE.borderRadius.large,
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(8),
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  summaryIconCircle: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  summaryLabel: {
    fontSize: fontScale(10),
    color: COLORS.gray500,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '800',
    color: COLORS.gray900,
    marginTop: verticalScale(2),
  },
  // Action Buttons
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    borderWidth: 1.5,
    borderColor: COLORS.errorLight,
    gap: moderateScale(8),
    marginBottom: verticalScale(4),
  },
  cancelButtonDisabled: {
    backgroundColor: COLORS.gray100,
    borderColor: COLORS.gray200,
  },
  cancelButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.error,
  },
  driverActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(8),
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.success),
  },
  driverActionButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '800',
    color: COLORS.white,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    gap: moderateScale(8),
    ...SHADOWS.colored(COLORS.success),
  },
  doneButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '800',
    color: COLORS.white,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warningBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    marginBottom: verticalScale(8),
    borderWidth: 1,
    borderColor: COLORS.warningLight,
    gap: moderateScale(8),
  },
  rateButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.warningDark,
    flex: 1,
  },
  // Rating Modal
  ratingOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  ratingModal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RESPONSIVE.borderRadius.xlarge,
    borderTopRightRadius: RESPONSIVE.borderRadius.xlarge,
    padding: moderateScale(24),
    paddingBottom: verticalScale(40),
    alignItems: 'center',
  },
  ratingCloseBtn: {
    position: 'absolute',
    top: moderateScale(16),
    right: moderateScale(16),
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingDriverAvatar: {
    marginBottom: verticalScale(12),
    ...SHADOWS.md,
  },
  ratingDriverImage: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: moderateScale(36),
    borderWidth: moderateScale(3),
    borderColor: COLORS.accentLight,
  },
  ratingDriverImagePlaceholder: {
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: COLORS.gray200,
  },
  ratingTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: '800',
    color: COLORS.gray900,
    marginBottom: verticalScale(3),
  },
  ratingDriverName: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray500,
    marginBottom: verticalScale(20),
  },
  starsRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(8),
  },
  starButton: {
    paddingHorizontal: moderateScale(6),
    minWidth: moderateScale(44),
    minHeight: moderateScale(44),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ratingLabelBadge: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(20),
    marginBottom: verticalScale(16),
  },
  ratingLabel: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
  },
  reviewInput: {
    width: '100%',
    backgroundColor: COLORS.gray50,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(14),
    borderWidth: 1,
    borderColor: COLORS.gray200,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray800,
    textAlignVertical: 'top',
    marginBottom: verticalScale(16),
    minHeight: verticalScale(80),
  },
  submitRatingButton: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: moderateScale(8),
    marginBottom: verticalScale(8),
    ...SHADOWS.colored(COLORS.accent),
  },
  submitRatingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '700',
    color: COLORS.white,
  },
  skipRatingButton: {
    padding: moderateScale(12),
  },
  skipRatingText: {
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray400,
    fontWeight: '500',
  },
});
