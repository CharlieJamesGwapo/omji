import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Toast, { ToastType } from '../../components/Toast';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState('');
  const { register } = useAuth();

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'error') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // Shake animation
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
    if (!phone.trim()) errors.phone = 'Phone number is required';
    else if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number';
    if (!password) errors.password = 'Password is required';
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) {
      shake();
      showToast('Please fix the errors below', 'warning');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, phone, password);
      showToast('Account created successfully!', 'success');
    } catch (error: any) {
      shake();
      const msg = error.message || 'Registration failed. Please try again.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (
    icon: string,
    placeholder: string,
    value: string,
    onChangeText: (t: string) => void,
    fieldKey: string,
    options?: { secure?: boolean; keyboard?: any; autoCapitalize?: any }
  ) => {
    const hasError = !!fieldErrors[fieldKey];
    const isFocused = focusedField === fieldKey;
    return (
      <View style={{ marginBottom: 14 }}>
        <View
          style={[
            styles.inputContainer,
            isFocused && styles.inputFocused,
            hasError && styles.inputError,
          ]}
        >
          <Ionicons name={icon as any} size={20} color={hasError ? '#EF4444' : isFocused ? '#3B82F6' : '#9CA3AF'} />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value}
            onChangeText={(t) => {
              onChangeText(t);
              if (fieldErrors[fieldKey]) setFieldErrors(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
            }}
            onFocus={() => setFocusedField(fieldKey)}
            onBlur={() => setFocusedField('')}
            secureTextEntry={options?.secure && !showPassword}
            keyboardType={options?.keyboard || 'default'}
            autoCapitalize={options?.autoCapitalize || 'none'}
          />
          {options?.secure && (
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        {hasError && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{fieldErrors[fieldKey]}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Account</Text>
        </View>

        {/* Form */}
        <Animated.View style={[styles.formContainer, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.welcomeText}>Join OMJI Today!</Text>
          <Text style={styles.subtitleText}>Get access to all services in Balingasag</Text>

          {renderInput('person-outline', 'Full Name', name, setName, 'name', { autoCapitalize: 'words' })}
          {renderInput('mail-outline', 'Email Address', email, setEmail, 'email', { keyboard: 'email-address' })}
          {renderInput('phone-portrait-outline', 'Phone Number', phone, setPhone, 'phone', { keyboard: 'phone-pad' })}
          {renderInput('lock-closed-outline', 'Password', password, setPassword, 'password', { secure: true })}
          {renderInput('lock-closed-outline', 'Confirm Password', confirmPassword, setConfirmPassword, 'confirmPassword', { secure: true })}

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.registerButton, loading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <TouchableOpacity style={styles.loginContainer} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <Text style={styles.loginLink}>Login</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  formContainer: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  welcomeText: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginBottom: 8, textAlign: 'center' },
  subtitleText: { fontSize: 14, color: '#6B7280', marginBottom: 24, textAlign: 'center' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  inputFocused: { borderColor: '#3B82F6', backgroundColor: '#F8FAFF' },
  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1F2937' },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4 },
  errorText: { fontSize: 12, color: '#EF4444', marginLeft: 4 },
  registerButton: {
    backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  registerButtonDisabled: { opacity: 0.6 },
  registerButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  loginContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  loginText: { color: '#6B7280', fontSize: 14 },
  loginLink: { color: '#3B82F6', fontSize: 14, fontWeight: 'bold' },
});
