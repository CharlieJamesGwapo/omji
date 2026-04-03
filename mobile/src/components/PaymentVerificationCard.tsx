import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { riderPaymentProofService } from '../services/api';
import { COLORS } from '../constants/theme';
import { fontScale, verticalScale, moderateScale, RESPONSIVE } from '../utils/responsive';

interface Props {
  serviceType: 'ride' | 'delivery';
  serviceId: number;
  paymentMethod: string;
  onVerified?: () => void;
}

export default function PaymentVerificationCard({ serviceType, serviceId, paymentMethod, onVerified }: Props) {
  const [proof, setProof] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  React.useEffect(() => {
    if (paymentMethod === 'gcash' || paymentMethod === 'maya') {
      fetchProof();
      const interval = setInterval(fetchProof, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [serviceType, serviceId, paymentMethod]);

  const fetchProof = async () => {
    try {
      const res = await riderPaymentProofService.getProof(serviceType, serviceId);
      setProof(res.data?.data || null);
    } catch {
      setProof(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = () => {
    Alert.alert('Verify Payment', 'Confirm that you have verified this payment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Verify',
        onPress: async () => {
          setVerifying(true);
          try {
            await riderPaymentProofService.verify(proof.id);
            setProof((prev: any) => ({ ...prev, status: 'verified' }));
            onVerified?.();
          } catch {
            Alert.alert('Error', 'Failed to verify payment. Please try again.');
          } finally {
            setVerifying(false);
          }
        },
      },
    ]);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setRejecting(true);
    try {
      await riderPaymentProofService.reject(proof.id, rejectReason.trim());
      setProof((prev: any) => ({ ...prev, status: 'rejected' }));
      setShowRejectModal(false);
      setRejectReason('');
    } catch {
      Alert.alert('Error', 'Failed to reject payment. Please try again.');
    } finally {
      setRejecting(false);
    }
  };

  if (paymentMethod !== 'gcash' && paymentMethod !== 'maya') return null;
  if (loading) return <ActivityIndicator size="small" color="#DC2626" style={{ margin: verticalScale(8) }} />;

  if (!proof) {
    return (
      <View style={styles.card}>
        <View style={styles.waitingRow}>
          <ActivityIndicator size="small" color="#F59E0B" />
          <Text style={styles.waitingText}>Waiting for payment proof from customer...</Text>
        </View>
      </View>
    );
  }

  if (proof.status === 'verified') {
    return (
      <View style={[styles.card, { borderColor: '#10B981' }]}>
        <View style={styles.verifiedRow}>
          <Ionicons name="checkmark-circle" size={moderateScale(20)} color="#10B981" />
          <Text style={[styles.statusLabel, { color: '#10B981' }]}>Payment Verified</Text>
        </View>
      </View>
    );
  }

  if (proof.status === 'rejected') {
    return (
      <View style={[styles.card, { borderColor: '#EF4444' }]}>
        <View style={styles.verifiedRow}>
          <Ionicons name="close-circle" size={moderateScale(20)} color="#EF4444" />
          <Text style={[styles.statusLabel, { color: '#EF4444' }]}>Proof Rejected — Waiting for retry</Text>
        </View>
      </View>
    );
  }

  const brandName = paymentMethod === 'gcash' ? 'GCash' : 'Maya';

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.methodBadge, { backgroundColor: paymentMethod === 'gcash' ? '#007bff' : '#34A853' }]}>
            <Text style={styles.methodText}>{brandName}</Text>
          </View>
          <Text style={styles.amountText}>₱{proof.amount?.toFixed(2)}</Text>
        </View>

        <TouchableOpacity onPress={() => setShowFullImage(true)} style={styles.proofImageContainer}>
          <Image source={{ uri: proof.proof_image_url }} style={styles.proofImage} resizeMode="contain" />
          <Text style={styles.tapHint}>Tap to view full size</Text>
        </TouchableOpacity>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reference:</Text>
          <Text style={styles.detailValue}>{proof.reference_number}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.verifyButton} onPress={handleVerify} disabled={verifying}>
            {verifying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={moderateScale(18)} color="#fff" />
                <Text style={styles.verifyText}>Verify</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectButton} onPress={() => setShowRejectModal(true)}>
            <Ionicons name="close" size={moderateScale(18)} color="#fff" />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showFullImage} transparent animationType="fade">
        <TouchableOpacity style={styles.fullImageOverlay} onPress={() => setShowFullImage(false)} activeOpacity={1}>
          <Image source={{ uri: proof.proof_image_url }} style={styles.fullImage} resizeMode="contain" />
          <TouchableOpacity style={styles.closeFullImage} onPress={() => setShowFullImage(false)}>
            <Ionicons name="close-circle" size={moderateScale(36)} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rejection Reason</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Why is this proof invalid?"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={handleReject} disabled={rejecting}>
                {rejecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalRejectText}>Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: moderateScale(12),
    marginVertical: verticalScale(8),
    marginHorizontal: RESPONSIVE.paddingHorizontal,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  methodBadge: {
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(6),
  },
  methodText: { color: '#fff', fontSize: fontScale(12), fontWeight: '700' },
  amountText: { fontSize: fontScale(18), fontWeight: '700', color: '#1F2937' },
  proofImageContainer: { alignItems: 'center', marginBottom: verticalScale(8) },
  proofImage: {
    width: moderateScale(180),
    height: moderateScale(220),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tapHint: { fontSize: fontScale(11), color: '#9CA3AF', marginTop: verticalScale(4) },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(6),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  detailLabel: { fontSize: fontScale(13), color: '#6B7280' },
  detailValue: { fontSize: fontScale(13), fontWeight: '600', color: '#1F2937' },
  actionRow: { flexDirection: 'row', gap: moderateScale(10), marginTop: verticalScale(10) },
  verifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11),
    gap: moderateScale(6),
  },
  verifyText: { color: '#fff', fontSize: fontScale(14), fontWeight: '700' },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11),
    gap: moderateScale(6),
  },
  rejectText: { color: '#fff', fontSize: fontScale(14), fontWeight: '700' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(8) },
  waitingText: { fontSize: fontScale(13), color: '#F59E0B', fontWeight: '600', flex: 1 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(8) },
  statusLabel: { fontSize: fontScale(14), fontWeight: '700' },
  fullImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: { width: '90%', height: '80%' },
  closeFullImage: { position: 'absolute', top: verticalScale(50), right: moderateScale(20) },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: moderateScale(20),
  },
  modalTitle: { fontSize: fontScale(17), fontWeight: '700', color: '#1F2937', marginBottom: verticalScale(12) },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: moderateScale(10),
    padding: moderateScale(12),
    fontSize: fontScale(14),
    minHeight: verticalScale(80),
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: moderateScale(10), marginTop: verticalScale(16) },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  modalCancelText: { fontSize: fontScale(14), fontWeight: '600', color: '#6B7280' },
  modalReject: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
    backgroundColor: '#EF4444',
  },
  modalRejectText: { fontSize: fontScale(14), fontWeight: '700', color: '#fff' },
});
