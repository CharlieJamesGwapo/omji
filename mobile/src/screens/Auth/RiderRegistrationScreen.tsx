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
import { driverService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

export default function RiderRegistrationScreen({ navigation }: any) {
  const { user } = useAuth();
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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        switch (type) {
          case 'profile':
            setProfilePhoto(result.assets[0].uri);
            break;
          case 'license':
            setLicensePhoto(result.assets[0].uri);
            break;
          case 'orcr':
            setOrCrPhoto(result.assets[0].uri);
            break;
          case 'id':
            setValidIdPhoto(result.assets[0].uri);
            break;
        }
      }
    } catch {
      Alert.alert('Error', 'Could not open photo library. Please check your permissions in Settings.');
    }
  };

  const handleSubmit = async () => {
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
        style={styles.uploadButton}
        onPress={() => pickImage(type)}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.uploadedImage} />
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', left: moderateScale(16), top: isIOS ? verticalScale(50) : verticalScale(35), zIndex: 1 }}>
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
          <View style={{ alignItems: 'center', paddingVertical: verticalScale(32) }}>
            <View style={{ width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(20) }}>
              <Ionicons name="time" size={moderateScale(40)} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: RESPONSIVE.fontSize.xxlarge, fontWeight: 'bold', color: '#1F2937', marginBottom: verticalScale(12), textAlign: 'center' }}>Application Submitted!</Text>
            <Text style={{ fontSize: RESPONSIVE.fontSize.medium, color: '#6B7280', textAlign: 'center', lineHeight: fontScale(22), paddingHorizontal: moderateScale(16), marginBottom: verticalScale(24) }}>
              Your rider application is now under review. An admin will verify your documents and approve your account. You'll be notified once approved.
            </Text>
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: RESPONSIVE.borderRadius.medium, padding: moderateScale(16), width: '100%', marginBottom: verticalScale(20) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(8) }}>
                <Ionicons name="checkmark-circle" size={moderateScale(18)} color="#3B82F6" />
                <Text style={{ fontSize: RESPONSIVE.fontSize.small, color: '#3B82F6', fontWeight: '600', marginLeft: moderateScale(8) }}>What happens next?</Text>
              </View>
              <Text style={{ fontSize: RESPONSIVE.fontSize.small, color: '#6B7280', lineHeight: fontScale(18) }}>
                1. Admin reviews your documents{'\n'}
                2. Your account gets verified{'\n'}
                3. You'll receive access to the Rider Dashboard{'\n'}
                4. Start accepting rides and earning!
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#3B82F6', borderRadius: RESPONSIVE.borderRadius.medium, paddingVertical: moderateScale(14), paddingHorizontal: moderateScale(32), alignItems: 'center' }}
              onPress={() => navigation.goBack()}
            >
              <Text style={{ color: '#ffffff', fontSize: RESPONSIVE.fontSize.regular, fontWeight: 'bold' }}>Back to Home</Text>
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
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Model *</Text>
          <TextInput
            style={styles.input}
            placeholder="Honda TMX 155"
            value={vehicleModel}
            onChangeText={setVehicleModel}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Color *</Text>
          <TextInput
            style={styles.input}
            placeholder="Red"
            value={vehicleColor}
            onChangeText={setVehicleColor}
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
        style={[styles.submitButton, loading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
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
});
