import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import { driverService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

export default function RiderRegistrationScreen({ navigation }: any) {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Personal Information (pre-filled from user profile)
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState('');

  // Vehicle Information
  const [vehicleType, setVehicleType] = useState('Motorcycle');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  // License Information
  const [licenseNumber, setLicenseNumber] = useState('');

  // Documents
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [licensePhoto, setLicensePhoto] = useState<string | null>(null);
  const [orCrPhoto, setOrCrPhoto] = useState<string | null>(null);
  const [validIdPhoto, setValidIdPhoto] = useState<string | null>(null);

  const vehicleTypes = ['Motorcycle', 'Tricycle', 'Car', 'Van'];

  const pickImage = async (type: 'profile' | 'license' | 'orcr' | 'id') => {
    Alert.alert(
      'Upload Photo',
      type === 'profile' ? 'Choose your profile photo' : 'Upload a clear photo of your document',
      [
        {
          text: 'Take Photo',
          onPress: () => captureImage(type, 'camera'),
        },
        {
          text: 'Choose from Gallery',
          onPress: () => captureImage(type, 'gallery'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const captureImage = async (type: 'profile' | 'license' | 'orcr' | 'id', source: 'camera' | 'gallery') => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow camera access in your device settings.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow photo library access in your device settings.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];

        // Basic validation for document photos
        if (type !== 'profile') {
          if (asset.width < 300 || asset.height < 300) {
            Alert.alert('Low Quality', 'Image resolution is too low. Please take a clearer photo.');
            return;
          }
          if (asset.fileSize && asset.fileSize < 50000) {
            Alert.alert('Low Quality', 'Image file is too small. Please upload a clear, high-quality photo.');
            return;
          }
        }

        switch (type) {
          case 'profile': setProfilePhoto(asset.uri); break;
          case 'license': setLicensePhoto(asset.uri); break;
          case 'orcr': setOrCrPhoto(asset.uri); break;
          case 'id': setValidIdPhoto(asset.uri); break;
        }
      }
    } catch {
      Alert.alert('Error', 'Could not access camera or photo library. Please check your permissions in Settings.');
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    // Validation
    if (!fullName || !phone || !email || !address) {
      Alert.alert('Error', 'Please fill in all personal information');
      return;
    }

    if (!plateNumber || !vehicleModel || !vehicleColor) {
      Alert.alert('Error', 'Please fill in all vehicle information');
      return;
    }

    if (!licenseNumber) {
      Alert.alert('Error', 'Please enter your license number');
      return;
    }

    if (!profilePhoto || !licensePhoto || !orCrPhoto || !validIdPhoto) {
      Alert.alert('Error', 'Please upload all required documents');
      return;
    }

    setLoading(true);
    try {
      const response = await driverService.registerDriverWithDocuments(
        {
          vehicle_type: vehicleType.toLowerCase(),
          vehicle_model: `${vehicleModel} (${vehicleColor})`,
          vehicle_plate: plateNumber,
          license_number: licenseNumber,
        },
        {
          profile: profilePhoto,
          license: licensePhoto,
          orcr: orCrPhoto,
          id: validIdPhoto,
        }
      );

      setSubmitted(true);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to submit application';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const renderDocumentUpload = (
    title: string,
    type: 'profile' | 'license' | 'orcr' | 'id',
    photo: string | null
  ) => (
    <View style={styles.section}>
      <Text style={styles.label}>{title} *</Text>
      <TouchableOpacity
        style={[styles.uploadButton, photo && styles.uploadButtonWithPhoto]}
        onPress={() => pickImage(type)}
        accessibilityLabel={photo ? `Change ${title}` : `Upload ${title}`}
        accessibilityRole="button"
      >
        {photo ? (
          <View>
            <Image source={{ uri: photo }} style={styles.uploadedImage} />
            <View style={styles.changeOverlay}>
              <Ionicons name="camera" size={moderateScale(16)} color="#fff" />
              <Text style={styles.changeOverlayText}>Tap to change</Text>
            </View>
          </View>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Ionicons name="camera-outline" size={32} color="#DC2626" />
            <Text style={styles.uploadText}>Tap to upload</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
          }
        }} style={{ position: 'absolute', left: moderateScale(16), top: isIOS ? verticalScale(50) : verticalScale(35), zIndex: 1, minWidth: 44, minHeight: 44, justifyContent: 'center' as const }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Ionicons name="bicycle" size={48} color="#DC2626" />
        <Text style={styles.headerTitle}>Become a Rider</Text>
        <Text style={styles.headerSubtitle}>
          {submitted ? 'Your application is being reviewed' : 'Join OMJI and start earning today!'}
        </Text>
      </View>

      {submitted ? (
        <View style={styles.card}>
          <View style={styles.submittedContainer}>
            <View style={styles.submittedIconCircle}>
              <Ionicons name="checkmark-circle" size={moderateScale(48)} color={COLORS.success} />
            </View>
            <Text style={styles.submittedTitle}>Application Submitted!</Text>
            <Text style={styles.submittedDescription}>
              Your rider application is now under review. An admin will verify your documents and approve your account.
            </Text>
            <View style={styles.submittedStepsCard}>
              <View style={styles.submittedStepsHeader}>
                <Ionicons name="information-circle" size={moderateScale(18)} color={COLORS.accent} />
                <Text style={styles.submittedStepsHeaderText}>What happens next?</Text>
              </View>
              {[
                { icon: 'document-text-outline', text: 'Admin reviews your documents' },
                { icon: 'shield-checkmark-outline', text: 'Your account gets verified' },
                { icon: 'flash-outline', text: 'Dashboard unlocks automatically' },
                { icon: 'cash-outline', text: 'Start accepting rides and earning!' },
              ].map((step, i) => (
                <View key={i} style={styles.submittedStepRow}>
                  <View style={styles.submittedStepNumber}>
                    <Text style={styles.submittedStepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.submittedStepText}>{step.text}</Text>
                </View>
              ))}
            </View>
            <View style={styles.pendingBadge}>
              <Ionicons name="hourglass-outline" size={moderateScale(16)} color={COLORS.warning} />
              <Text style={styles.pendingBadgeText}>Status: Pending Approval</Text>
            </View>
            <Text style={styles.pendingNote}>
              You will stay in user mode until an admin approves your application. Once approved, your account will automatically switch to rider mode.
            </Text>
            <TouchableOpacity
              style={styles.goToDashboardButton}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
                }
              }}
              accessibilityLabel="Back to home"
              accessibilityRole="button"
            >
              <Text style={styles.goToDashboardText}>Back to Home</Text>
              <Ionicons name="arrow-forward" size={moderateScale(18)} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <>
      {/* Personal Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal Information</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChangeText={setFullName}
            accessibilityLabel="Full name"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Phone Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="09123456789"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            accessibilityLabel="Phone number"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="rider@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email address"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Complete Address *</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Street, Barangay, City"
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={3}
            accessibilityLabel="Complete address"
          />
        </View>
      </View>

      {/* Vehicle Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle Information</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Type *</Text>
          <View style={styles.vehicleTypes}>
            {vehicleTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.vehicleTypeButton,
                  vehicleType === type && styles.vehicleTypeButtonActive,
                ]}
                onPress={() => setVehicleType(type)}
                accessibilityLabel={`Vehicle type: ${type}${vehicleType === type ? ' (selected)' : ''}`}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.vehicleTypeText,
                    vehicleType === type && styles.vehicleTypeTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Plate Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="ABC-1234"
            value={plateNumber}
            onChangeText={setPlateNumber}
            autoCapitalize="characters"
            accessibilityLabel="Plate number"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Model *</Text>
          <TextInput
            style={styles.input}
            placeholder="Honda TMX 155"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            accessibilityLabel="Vehicle model"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Color *</Text>
          <TextInput
            style={styles.input}
            placeholder="Red"
            value={vehicleColor}
            onChangeText={setVehicleColor}
            accessibilityLabel="Vehicle color"
          />
        </View>
      </View>

      {/* License Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>License Information</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Driver's License Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="N01-12-345678"
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            accessibilityLabel="Driver's license number"
          />
        </View>
      </View>

      {/* Required Documents */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Required Documents</Text>
        <Text style={styles.cardSubtitle}>
          Please upload clear photos of the following documents
        </Text>

        {renderDocumentUpload('Profile Photo', 'profile', profilePhoto)}
        {renderDocumentUpload("Driver's License", 'license', licensePhoto)}
        {renderDocumentUpload('OR/CR (Official Receipt/Certificate of Registration)', 'orcr', orCrPhoto)}
        {renderDocumentUpload('Valid ID', 'id', validIdPhoto)}
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, loading && { opacity: 0.5 }]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityLabel={loading ? 'Submitting registration' : 'Submit application'}
        accessibilityRole="button"
      >
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: moderateScale(8) }}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.submitButtonText}>Submitting registration...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.submitButtonText}>Submit Application</Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: verticalScale(40) }} />
      </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: moderateScale(24),
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: verticalScale(12),
  },
  headerSubtitle: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: moderateScale(16),
    marginTop: verticalScale(16),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: RESPONSIVE.fontSize.large,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: verticalScale(16),
  },
  cardSubtitle: {
    fontSize: fontScale(13),
    color: '#6B7280',
    marginBottom: verticalScale(16),
  },
  section: {
    marginBottom: verticalScale(16),
  },
  label: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#374151',
    marginBottom: verticalScale(8),
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    borderRadius: RESPONSIVE.borderRadius.small,
    padding: moderateScale(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: RESPONSIVE.fontSize.regular,
    color: '#1F2937',
    textAlignVertical: 'top',
    minHeight: verticalScale(80),
  },
  vehicleTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: moderateScale(8),
  },
  vehicleTypeButton: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
    borderRadius: RESPONSIVE.borderRadius.small,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    minHeight: 44,
    justifyContent: 'center',
  },
  vehicleTypeButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  vehicleTypeText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: '#6B7280',
  },
  vehicleTypeTextActive: {
    color: '#ffffff',
  },
  uploadButton: {
    borderRadius: RESPONSIVE.borderRadius.medium,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  uploadButtonWithPhoto: {
    borderStyle: 'solid',
    borderColor: '#10B981',
  },
  changeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(8),
    gap: moderateScale(6),
  },
  changeOverlayText: {
    color: '#fff',
    fontSize: fontScale(13),
    fontWeight: '600',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: moderateScale(40),
    backgroundColor: '#F9FAFB',
  },
  uploadText: {
    marginTop: verticalScale(8),
    fontSize: RESPONSIVE.fontSize.medium,
    color: '#6B7280',
  },
  uploadedImage: {
    width: '100%',
    height: verticalScale(200),
    resizeMode: 'cover',
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#DC2626',
    marginHorizontal: moderateScale(16),
    marginTop: verticalScale(24),
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginRight: moderateScale(8),
  },
  // Submitted state styles
  submittedContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(32),
  },
  submittedIconCircle: {
    width: moderateScale(80),
    height: moderateScale(80),
    borderRadius: moderateScale(40),
    backgroundColor: COLORS.successBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  submittedTitle: {
    fontSize: RESPONSIVE.fontSize.xxlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(12),
    textAlign: 'center',
  },
  submittedDescription: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(22),
    paddingHorizontal: moderateScale(16),
    marginBottom: verticalScale(24),
  },
  submittedStepsCard: {
    backgroundColor: COLORS.accentBg,
    borderRadius: RESPONSIVE.borderRadius.medium,
    padding: moderateScale(16),
    width: '100%',
    marginBottom: verticalScale(24),
  },
  submittedStepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  submittedStepsHeaderText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.accent,
    fontWeight: '700',
    marginLeft: moderateScale(8),
  },
  submittedStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  submittedStepNumber: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: moderateScale(10),
  },
  submittedStepNumberText: {
    fontSize: fontScale(12),
    fontWeight: '700',
    color: COLORS.white,
  },
  submittedStepText: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray700,
    flex: 1,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(20),
    gap: moderateScale(6),
    marginBottom: verticalScale(12),
  },
  pendingBadgeText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '700',
    color: COLORS.warningDark,
  },
  pendingNote: {
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: fontScale(20),
    marginBottom: verticalScale(20),
    paddingHorizontal: moderateScale(8),
  },
  goToDashboardButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    borderRadius: RESPONSIVE.borderRadius.medium,
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(32),
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: verticalScale(12),
  },
  goToDashboardText: {
    color: COLORS.white,
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    marginRight: moderateScale(8),
  },
});
