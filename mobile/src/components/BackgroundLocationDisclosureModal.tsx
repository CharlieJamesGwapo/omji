import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { fontScale, moderateScale, verticalScale } from '../utils/responsive';

interface Props {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

// Required by Google Play for apps using ACCESS_BACKGROUND_LOCATION: the
// wording and flow must match the justification submitted in Play Console's
// "Sensitive app permissions" declaration for background location. Any change
// to the text here must be mirrored in the Play Console submission.
export default function BackgroundLocationDisclosureModal({ visible, onAllow, onDeny }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Share your location while on a trip</Text>
          <Text style={styles.body}>
            ONE RIDE collects your location in the background while you are on an active trip, to stream your position to the assigned passenger so their map shows you approaching in real time.
            {'\n\n'}
            Background access is needed because you may open Google Maps for directions or lock your phone while riding. The tracking service only runs during a trip, shows a persistent notification while active, and stops the moment the trip ends or is cancelled.
            {'\n\n'}
            On the next system prompt, please choose <Text style={styles.bold}>"Allow all the time"</Text> so tracking keeps working when the app is backgrounded.
          </Text>
          <TouchableOpacity style={styles.allowBtn} onPress={onAllow} accessibilityRole="button">
            <Text style={styles.allowText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.denyBtn} onPress={onDeny} accessibilityRole="button">
            <Text style={styles.denyText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: moderateScale(20),
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: moderateScale(18),
    padding: moderateScale(22),
  },
  iconCircle: {
    width: moderateScale(64),
    height: moderateScale(64),
    borderRadius: moderateScale(32),
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: verticalScale(12),
  },
  title: {
    fontSize: fontScale(19),
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: verticalScale(12),
  },
  body: {
    fontSize: fontScale(14),
    color: '#374151',
    lineHeight: fontScale(21),
  },
  bold: {
    fontWeight: '700',
    color: '#111827',
  },
  allowBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(13),
    alignItems: 'center',
    marginTop: verticalScale(22),
  },
  allowText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: fontScale(16),
  },
  denyBtn: {
    paddingVertical: verticalScale(12),
    alignItems: 'center',
    marginTop: verticalScale(2),
  },
  denyText: {
    color: '#6B7280',
    fontSize: fontScale(14),
  },
});
