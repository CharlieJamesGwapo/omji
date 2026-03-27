import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

interface ChatMsg {
  id: string;
  text: string;
  sender: 'me' | 'them';
  time: string;
  pending?: boolean;
}

export default function ChatScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { rider: routeRider, rideId, deliveryId } = route.params || {};
  const chatId = rideId || deliveryId || 0;
  const receiverId = routeRider?.user_id || routeRider?.id || 0;
  const currentUserId = user?.id || 0;

  const rider = routeRider || { name: 'Driver', rating: 0, photo: '', phone: '' };
  const riderPhoto = rider.profile_image || rider.photo || '';

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const prevMessageCount = useRef(0);
  const shouldAutoScroll = useRef(true);
  const pendingIds = useRef<Set<string>>(new Set());

  const quickReplies = [
    "I'm waiting outside",
    'On my way!',
    'Where are you?',
    'Thanks!',
    "I'm here",
  ];

  // Fetch messages on mount, poll every 3s, stop on blur
  useEffect(() => {
    if (!chatId) { setLoading(false); return; }
    let interval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const fetchMessages = async () => {
      try {
        const response = await chatService.getMessages(chatId);
        if (!mounted) return;
        const raw = response.data?.data;
        const msgs: ChatMsg[] = Array.isArray(raw)
          ? raw.map((m: any) => ({
              id: m.id?.toString() || `srv-${m.created_at}`,
              text: m.message || m.text || '',
              sender: (m.sender_id === currentUserId ? 'me' : 'them') as 'me' | 'them',
              time: m.created_at
                ? new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : '',
            }))
          : [];

        // Merge: keep pending (unsent) messages, replace with server versions
        setMessages(prev => {
          // Find pending messages not yet confirmed by server
          const stillPending = prev.filter(
            p => p.pending && !msgs.some(s => s.text === p.text && s.sender === 'me')
          );
          return [...msgs, ...stillPending];
        });
      } catch {
        // Silent fail for polling — will retry
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const startPolling = () => {
      stopPolling();
      fetchMessages();
      interval = setInterval(fetchMessages, 3000);
    };

    startPolling();
    const unsubBlur = navigation.addListener('blur', stopPolling);
    const unsubFocus = navigation.addListener('focus', startPolling);
    return () => { mounted = false; stopPolling(); unsubBlur(); unsubFocus(); };
  }, [chatId, currentUserId, navigation]);

  const sendMessage = async (text?: string) => {
    const messageText = (text || message).trim();
    if (!messageText || sending) return;

    const tempId = `pending-${Date.now()}`;
    const tempMessage: ChatMsg = {
      id: tempId,
      text: messageText,
      sender: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      pending: true,
    };

    setMessages(prev => [...prev, tempMessage]);
    setMessage('');
    shouldAutoScroll.current = true;

    if (!chatId || !receiverId) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Chat Unavailable', 'Cannot send messages right now. Please try again.');
      return;
    }

    setSending(true);
    try {
      await chatService.sendMessage(chatId, receiverId, messageText);
      // Mark as no longer pending — next poll will replace with server version
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Send Failed', 'Message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMsg }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          riderPhoto ? (
            <Image source={{ uri: riderPhoto }} style={styles.messageAvatar} />
          ) : (
            <View style={[styles.messageAvatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={moderateScale(16)} color={COLORS.gray400} />
            </View>
          )
        )}
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
            {item.text}
          </Text>
          <View style={styles.messageFooter}>
            {!!item.time && (
              <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.theirMessageTime]}>
                {item.time}
              </Text>
            )}
            {isMe && item.pending && (
              <Ionicons name="time-outline" size={fontScale(10)} color="rgba(255,255,255,0.6)" style={{ marginLeft: moderateScale(4) }} />
            )}
            {isMe && !item.pending && (
              <Ionicons name="checkmark-done" size={fontScale(10)} color="rgba(255,255,255,0.8)" style={{ marginLeft: moderateScale(4) }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? verticalScale(90) : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={moderateScale(24)} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {riderPhoto ? (
            <Image source={{ uri: riderPhoto }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={moderateScale(20)} color={COLORS.gray400} />
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerName}>{rider.name || 'Driver'}</Text>
            <View style={styles.headerSubRow}>
              {!!rider.rating && (
                <View style={styles.headerRating}>
                  <Ionicons name="star" size={moderateScale(11)} color={COLORS.warningDark} />
                  <Text style={styles.headerRatingText}>{Number(rider.rating).toFixed(1)}</Text>
                </View>
              )}
              {!!rider.phone && (
                <Text style={styles.headerPhone}>{rider.phone}</Text>
              )}
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            const phone = rider?.phone;
            if (phone) {
              Linking.openURL(`tel:${phone}`);
            } else {
              Alert.alert('No Phone', 'Phone number not available');
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Call"
          accessibilityRole="button"
        >
          <View style={styles.callBtn}>
            <Ionicons name="call" size={moderateScale(18)} color={COLORS.white} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="chatbubbles-outline" size={moderateScale(48)} color={COLORS.gray300} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Send a message or tap a quick reply below</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => {
            if (messages.length > prevMessageCount.current || shouldAutoScroll.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
              shouldAutoScroll.current = false;
            }
            prevMessageCount.current = messages.length;
          }}
          onScrollBeginDrag={() => { shouldAutoScroll.current = false; }}
        />
      )}

      {/* Quick Replies */}
      <View style={styles.quickRepliesContainer}>
        <FlatList
          horizontal
          data={quickReplies}
          keyExtractor={(_, index) => `reply-${index}`}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickReply}
              onPress={() => sendMessage(item)}
              activeOpacity={0.7}
              accessibilityLabel={`Quick reply: ${item}`}
              accessibilityRole="button"
            >
              <Text style={styles.quickReplyText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.gray400}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => sendMessage()}
          disabled={!message.trim() || sending}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="send" size={moderateScale(18)} color={COLORS.white} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingTop: isIOS ? verticalScale(50) : verticalScale(35),
    paddingBottom: verticalScale(14),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: moderateScale(14),
  },
  headerAvatar: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  avatarPlaceholder: {
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    marginLeft: moderateScale(12),
    flex: 1,
  },
  headerName: {
    fontSize: fontScale(16),
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(2),
    gap: moderateScale(8),
  },
  headerRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRatingText: {
    fontSize: fontScale(12),
    fontWeight: '600',
    color: COLORS.warningDark,
    marginLeft: moderateScale(3),
  },
  headerPhone: {
    fontSize: fontScale(12),
    color: COLORS.gray500,
  },
  callBtn: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontScale(16),
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  emptySubtext: {
    fontSize: fontScale(13),
    color: COLORS.gray400,
    marginTop: verticalScale(4),
  },
  messagesList: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: verticalScale(10),
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: verticalScale(12),
    alignItems: 'flex-end',
  },
  myMessage: {
    justifyContent: 'flex-end',
  },
  theirMessage: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(15),
    marginRight: moderateScale(8),
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: moderateScale(18),
    paddingHorizontal: moderateScale(14),
    paddingVertical: verticalScale(10),
  },
  myBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: moderateScale(4),
  },
  theirBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: moderateScale(4),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  messageText: {
    fontSize: fontScale(15),
    lineHeight: fontScale(21),
  },
  myMessageText: {
    color: COLORS.white,
  },
  theirMessageText: {
    color: COLORS.gray800,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: verticalScale(3),
  },
  messageTime: {
    fontSize: fontScale(10),
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  theirMessageTime: {
    color: COLORS.gray400,
  },
  quickRepliesContainer: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(10),
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  quickReply: {
    backgroundColor: COLORS.accentBg || COLORS.gray100,
    paddingHorizontal: moderateScale(14),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(20),
    marginRight: moderateScale(8),
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  quickReplyText: {
    fontSize: fontScale(13),
    color: COLORS.accent,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(10),
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingBottom: isIOS ? verticalScale(24) : verticalScale(10),
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: moderateScale(24),
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
    fontSize: fontScale(15),
    maxHeight: verticalScale(100),
    color: COLORS.gray800,
  },
  sendButton: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray300,
    opacity: 0.6,
  },
});
