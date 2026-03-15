import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/api';
import { COLORS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

const NAME_MAX_LENGTH = 50;

export default function EditProfileScreen({ navigation }: any) {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Track original values for unsaved changes detection
  const originalName = useRef(user?.name || '');
  const originalPhone = useRef(user?.phone || '');
  const originalImage = useRef(user?.profile_image || null);

  // Floating label animations
  const nameLabelAnim = useRef(new Animated.Value(name ? 1 : 0)).current;
  const phoneLabelAnim = useRef(new Animated.Value(phone ? 1 : 0)).current;

  // Focus states
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const hasUnsavedChanges = useCallback(() => {
    return (
      name.trim() !== originalName.current ||
      phone.trim() !== originalPhone.current ||
      newImageUri !== null
    );
  }, [name, phone, newImageUri]);

  // Intercept back navigation for unsaved changes
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasUnsavedChanges()) return;

      e.preventDefault();
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to leave without saving?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  const animateLabel = (anim: Animated.Value, toValue: number) => {
    Animated.timing(anim, {
      toValue,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleNameFocus = () => {
    setNameFocused(true);
    animateLabel(nameLabelAnim, 1);
  };

  const handleNameBlur = () => {
    setNameFocused(false);
    if (!name) animateLabel(nameLabelAnim, 0);
  };

  const handlePhoneFocus = () => {
    setPhoneFocused(true);
    animateLabel(phoneLabelAnim, 1);
  };

  const handlePhoneBlur = () => {
    setPhoneFocused(false);
    if (!phone) animateLabel(phoneLabelAnim, 0);
  };

  const formatPhoneNumber = (text: string) => {
    // Remove all non-digit characters
    let digits = text.replace(/\D/g, '');

    // Handle Philippine format
    // If starts with 63, keep it
    // If starts with 0, convert to 63
    // Otherwise prepend 63 if it looks like a local number
    if (digits.startsWith('63')) {
      // Already has country code
    } else if (digits.startsWith('0') && digits.length > 1) {
      digits = '63' + digits.substring(1);
    } else if (digits.length >= 10 && !digits.startsWith('63')) {
      digits = '63' + digits;
    }

    // Format: +63 XXX XXX XXXX
    if (digits.startsWith('63') && digits.length > 2) {
      const countryCode = '+63';
      const rest = digits.substring(2);
      if (rest.length <= 3) {
        return `${countryCode} ${rest}`;
      } else if (rest.length <= 6) {
        return `${countryCode} ${rest.substring(0, 3)} ${rest.substring(3)}`;
      } else {
        return `${countryCode} ${rest.substring(0, 3)} ${rest.substring(3, 6)} ${rest.substring(6, 10)}`;
      }
    }

    return text;
  };

  const handlePhoneChange = (text: string) => {
    // Only allow digits, spaces, +, and -
    const cleaned = text.replace(/[^\d\s+\-]/g, '');
    setPhone(cleaned);
  };

  const validatePhone = (phoneStr: string): boolean => {
    const digits = phoneStr.replace(/\D/g, '');
    // Philippine phone: must be 12 digits (63 + 10 digits) or 11 digits (0 + 10 digits) or 10 digits
    if (digits.startsWith('63')) {
      return digits.length === 12;
    } else if (digits.startsWith('0')) {
      return digits.length === 11;
    }
    return digits.length === 10 || digits.length === 11 || digits.length === 12;
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please grant camera roll permissions to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setNewImageUri(uri);
      setProfileImage(uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please grant camera permissions to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setNewImageUri(uri);
      setProfileImage(uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose a photo source', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickImage },
      ...(profileImage ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => { setProfileImage(null); setNewImageUri('remove'); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert('Validation Error', 'Name must be at least 2 characters.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required.');
      return;
    }
    if (!validatePhone(phone)) {
      Alert.alert('Validation Error', 'Please enter a valid Philippine phone number.\n\nFormat: +63 9XX XXX XXXX');
      return;
    }

    try {
      setSaving(true);

      const payload: any = {
        name: name.trim(),
        phone: phone.trim(),
      };
      if (newImageUri === 'remove') {
        payload.profile_image = '';
      }

      const response = await userService.updateProfile(payload);
      const updatedData = response.data?.data || response.data;

      if (newImageUri && newImageUri !== 'remove') {
        // Image selected but profile photo upload requires server-side file handling
        // For now, save name/phone and keep the local image preview
        updateUser({
          name: updatedData?.name || name.trim(),
          phone: updatedData?.phone || phone.trim(),
          profile_image: updatedData?.profile_image || user?.profile_image,
        });
      } else {
        updateUser({
          name: updatedData?.name || name.trim(),
          phone: updatedData?.phone || phone.trim(),
          ...(newImageUri === 'remove' ? { profile_image: '' } : {}),
        });
      }

      // Reset originals so unsaved changes detection won't trigger
      originalName.current = name.trim();
      originalPhone.current = phone.trim();
      setNewImageUri(null);

      Alert.alert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      const message =
        error.response?.data?.error || error.message || 'Failed to update profile.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const getAvatarUri = () => {
    if (profileImage) return profileImage;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=3B82F6&color=fff&size=200`;
  };

  const nameCharCount = name.length;
  const isNameNearLimit = nameCharCount > NAME_MAX_LENGTH - 10;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={moderateScale(22)} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !hasUnsavedChanges()}
          style={[
            styles.saveHeaderButton,
            (!hasUnsavedChanges() || saving) && styles.saveHeaderButtonDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={[
              styles.saveHeaderText,
              !hasUnsavedChanges() && styles.saveHeaderTextDisabled,
            ]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Photo Section */}
          <View style={styles.photoSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={showImageOptions}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: getAvatarUri() }}
                style={styles.avatar}
              />
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={moderateScale(20)} color={COLORS.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={showImageOptions}>
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Name Field */}
            <View style={styles.fieldContainer}>
              <View style={[
                styles.floatingInputWrapper,
                nameFocused && styles.floatingInputFocused,
              ]}>
                <Animated.Text
                  style={[
                    styles.floatingLabel,
                    {
                      top: nameLabelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [verticalScale(18), verticalScale(6)],
                      }),
                      fontSize: nameLabelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [RESPONSIVE.fontSize.regular, RESPONSIVE.fontSize.small],
                      }),
                      color: nameFocused ? COLORS.accent : COLORS.gray500,
                    },
                  ]}
                >
                  Full Name
                </Animated.Text>
                <View style={styles.inputRow}>
                  <Ionicons
                    name="person-outline"
                    size={moderateScale(18)}
                    color={nameFocused ? COLORS.accent : COLORS.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.floatingInput}
                    value={name}
                    onChangeText={(text) => setName(text.slice(0, NAME_MAX_LENGTH))}
                    onFocus={handleNameFocus}
                    onBlur={handleNameBlur}
                    autoCapitalize="words"
                    editable={!saving}
                    maxLength={NAME_MAX_LENGTH}
                  />
                </View>
              </View>
              <View style={styles.fieldFooter}>
                <Text style={styles.fieldHint}>Your display name</Text>
                <Text style={[
                  styles.charCounter,
                  isNameNearLimit && styles.charCounterWarn,
                ]}>
                  {nameCharCount}/{NAME_MAX_LENGTH}
                </Text>
              </View>
            </View>

            {/* Email Field (read-only) */}
            <View style={styles.fieldContainer}>
              <View style={[styles.floatingInputWrapper, styles.inputDisabled]}>
                <Text style={[styles.floatingLabelStatic, { color: COLORS.gray400 }]}>
                  Email Address
                </Text>
                <View style={styles.inputRow}>
                  <Ionicons
                    name="mail-outline"
                    size={moderateScale(18)}
                    color={COLORS.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.floatingInput, styles.inputTextDisabled]}
                    value={user?.email || ''}
                    editable={false}
                  />
                  <View style={styles.lockBadge}>
                    <Ionicons name="lock-closed" size={moderateScale(12)} color={COLORS.gray400} />
                  </View>
                </View>
              </View>
              <View style={styles.fieldFooter}>
                <Text style={styles.fieldHintDisabled}>Email cannot be changed</Text>
              </View>
            </View>

            {/* Phone Field */}
            <View style={styles.fieldContainer}>
              <View style={[
                styles.floatingInputWrapper,
                phoneFocused && styles.floatingInputFocused,
              ]}>
                <Animated.Text
                  style={[
                    styles.floatingLabel,
                    {
                      top: phoneLabelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [verticalScale(18), verticalScale(6)],
                      }),
                      fontSize: phoneLabelAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [RESPONSIVE.fontSize.regular, RESPONSIVE.fontSize.small],
                      }),
                      color: phoneFocused ? COLORS.accent : COLORS.gray500,
                    },
                  ]}
                >
                  Phone Number
                </Animated.Text>
                <View style={styles.inputRow}>
                  <Ionicons
                    name="call-outline"
                    size={moderateScale(18)}
                    color={phoneFocused ? COLORS.accent : COLORS.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.floatingInput}
                    value={phone}
                    onChangeText={handlePhoneChange}
                    onFocus={handlePhoneFocus}
                    onBlur={() => {
                      handlePhoneBlur();
                      // Auto-format on blur
                      if (phone.trim()) {
                        setPhone(formatPhoneNumber(phone));
                      }
                    }}
                    keyboardType="phone-pad"
                    editable={!saving}
                  />
                </View>
              </View>
              <View style={styles.fieldFooter}>
                <Text style={styles.fieldHint}>Format: +63 9XX XXX XXXX</Text>
              </View>
            </View>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={moderateScale(20)} color={COLORS.accent} />
            <Text style={styles.infoText}>
              Your profile information helps us personalize your experience and keeps your account secure.
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (saving || !hasUnsavedChanges()) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving || !hasUnsavedChanges()}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <View style={styles.saveButtonContent}>
                <Ionicons name="checkmark-circle-outline" size={moderateScale(20)} color={COLORS.white} />
                <Text style={styles.saveButtonText}>
                  {hasUnsavedChanges() ? 'Save Changes' : 'No Changes'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ height: verticalScale(40) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(12),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: RESPONSIVE.fontSize.xlarge,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  saveHeaderButton: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.accent,
    minWidth: moderateScale(64),
    alignItems: 'center',
  },
  saveHeaderButtonDisabled: {
    backgroundColor: COLORS.gray200,
  },
  saveHeaderText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.white,
  },
  saveHeaderTextDisabled: {
    color: COLORS.gray400,
  },
  scrollContent: {
    paddingBottom: verticalScale(40),
  },

  // Photo Section
  photoSection: {
    alignItems: 'center',
    paddingVertical: verticalScale(28),
    backgroundColor: COLORS.white,
    marginBottom: verticalScale(8),
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: verticalScale(12),
  },
  avatar: {
    width: moderateScale(110),
    height: moderateScale(110),
    borderRadius: moderateScale(55),
    borderWidth: 4,
    borderColor: COLORS.gray100,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(3),
  },
  changePhotoText: {
    fontSize: RESPONSIVE.fontSize.medium,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Form Section
  formSection: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: verticalScale(20),
  },
  fieldContainer: {
    marginBottom: verticalScale(20),
  },
  floatingInputWrapper: {
    backgroundColor: COLORS.white,
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(10),
    paddingHorizontal: moderateScale(14),
    position: 'relative',
    minHeight: moderateScale(62),
  },
  floatingInputFocused: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(2),
  },
  floatingLabel: {
    position: 'absolute',
    left: moderateScale(46),
    fontWeight: '500',
  },
  floatingLabelStatic: {
    position: 'absolute',
    left: moderateScale(46),
    top: verticalScale(6),
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    marginRight: moderateScale(10),
  },
  floatingInput: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.regular,
    color: COLORS.gray800,
    paddingVertical: 0,
    fontWeight: '500',
  },
  inputDisabled: {
    backgroundColor: COLORS.gray50,
    borderColor: COLORS.gray200,
  },
  inputTextDisabled: {
    color: COLORS.gray400,
  },
  lockBadge: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: verticalScale(6),
    paddingHorizontal: moderateScale(4),
  },
  fieldHint: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    fontWeight: '400',
  },
  fieldHintDisabled: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    fontStyle: 'italic',
  },
  charCounter: {
    fontSize: fontScale(11),
    color: COLORS.gray400,
    fontWeight: '500',
  },
  charCounterWarn: {
    color: COLORS.warning,
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.accentBg,
    marginHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(4),
    marginBottom: verticalScale(20),
    padding: moderateScale(14),
    borderRadius: RESPONSIVE.borderRadius.medium,
    borderLeftWidth: moderateScale(3),
    borderLeftColor: COLORS.accent,
  },
  infoText: {
    flex: 1,
    fontSize: RESPONSIVE.fontSize.small,
    color: COLORS.gray600,
    marginLeft: moderateScale(10),
    lineHeight: fontScale(18),
  },

  // Save Button
  saveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RESPONSIVE.borderRadius.medium,
    height: RESPONSIVE.height.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: RESPONSIVE.paddingHorizontal,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(8),
    elevation: moderateScale(4),
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.white,
    marginLeft: moderateScale(8),
  },
});
