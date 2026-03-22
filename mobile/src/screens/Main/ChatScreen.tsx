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
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, fontScale, verticalScale, moderateScale, isIOS } from '../../utils/responsive';

export default function ChatScreen({ route, navigation }: any) {
  const { rider: routeRider, rideId, deliveryId } = route.params || {};
  const chatId = rideId || deliveryId || 0;
  const receiverId = routeRider?.user_id || routeRider?.id || 0;

  const rider = routeRider || {
    name: 'Driver',
    rating: 0,
    photo: '',
  };

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const prevMessageCount = useRef(0);
  const shouldAutoScroll = useRef(true);

  const quickReplies = [
    "I'm waiting outside",
    'Running a bit late',
    'Where are you?',
    'Thanks!',
  ];

  // Fetch messages on mount, poll every 5s, stop polling when screen loses focus
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
        const msgs = Array.isArray(raw) ? raw : [];
        setMessages(msgs.map((m: any, i: number) => ({
          id: m.id?.toString() || `msg-${i}`,
          text: m.message || m.text || '',
          sender: m.sender_id === receiverId ? 'rider' : 'user',
          time: m.created_at
            ? new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '',
        })));
      } catch {
        // Silent fail for polling
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
  }, [chatId, receiverId, navigation]);

  const sendMessage = async (text?: string) => {
    const messageText = text || message.trim();
    if (!messageText) return;

    const tempMessage = {
      id: Date.now().toString(),
      text: messageText,
      sender: 'user',
      time: new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };

    setMessages(prev => [...prev, tempMessage]);
    setMessage('');
    shouldAutoScroll.current = true;

    if (chatId && receiverId) {
      setSending(true);
      try {
        await chatService.sendMessage(chatId, receiverId, messageText);
      } catch {
        // Remove the optimistic message and show error
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        Alert.alert('Send Failed', 'Message could not be sent. Please try again.');
      } finally {
        setSending(false);
      }
    } else {
      // Remove optimistic message — chat session is not properly initialized
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
      Alert.alert('Chat Unavailable', 'Cannot send messages. Please go back and try again.');
    }
  };

  const renderMessage = ({ item }: any) => {
    const isUser = item.sender === 'user';
    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.riderMessage,
        ]}
      >
        {!isUser && (
          rider.photo ? (
            <Image source={{ uri: rider.photo }} style={styles.messageAvatar} />
          ) : (
            <View style={[styles.messageAvatar, { backgroundColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={moderateScale(16)} color={COLORS.gray400} />
            </View>
          )
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.riderBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.riderMessageText,
            ]}
          >
            {item.text}
          </Text>
          {!!(item.time) && (
            <Text
              style={[
                styles.messageTime,
                isUser ? styles.userMessageTime : styles.riderMessageTime,
              ]}
            >
              {item.time}
            </Text>
          )}
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
          {rider.photo ? (
            <Image source={{ uri: rider.photo }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={moderateScale(20)} color={COLORS.gray400} />
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerName}>{rider.name || 'Driver'}</Text>
            {!!(rider.rating) && (
              <View style={styles.headerRating}>
                <Ionicons name="star" size={moderateScale(12)} color={COLORS.warningDark} />
                <Text style={styles.headerRatingText}>{rider.rating}</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => {
          const phone = rider?.phone;
          if (phone) {
            Linking.openURL(`tel:${phone}`);
          } else {
            Alert.alert('No Phone', 'Phone number not available');
          }
        }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Call driver" accessibilityRole="button">
          <Ionicons name="call" size={moderateScale(24)} color={COLORS.success} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={moderateScale(48)} color={COLORS.gray300} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Send a message to start chatting</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => item.id || `temp-${index}`}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => {
            // Only auto-scroll when new messages arrive, not on every poll
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
          keyExtractor={(item, index) => `reply-${index}`}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickReply}
              onPress={() => sendMessage(item)}
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
          accessibilityState={{ disabled: !message.trim() || sending }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.gray400} />
          ) : (
            <Ionicons
              name="send"
              size={moderateScale(20)}
              color={message.trim() ? COLORS.white : COLORS.gray400}
            />
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
    paddingBottom: verticalScale(16),
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: moderateScale(16),
  },
  headerAvatar: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  headerText: {
    marginLeft: moderateScale(12),
  },
  headerName: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: verticalScale(2),
  },
  headerRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRatingText: {
    fontSize: RESPONSIVE.fontSize.small,
    fontWeight: '600',
    color: COLORS.warningDark,
    marginLeft: moderateScale(4),
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: RESPONSIVE.fontSize.regular,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: verticalScale(12),
  },
  emptySubtext: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray400,
    marginTop: verticalScale(4),
  },
  messagesList: {
    padding: RESPONSIVE.paddingHorizontal,
    paddingBottom: verticalScale(10),
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: verticalScale(16),
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  riderMessage: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    marginRight: moderateScale(8),
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: RESPONSIVE.borderRadius.large,
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
  },
  userBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: moderateScale(4),
  },
  riderBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: moderateScale(4),
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  messageText: {
    fontSize: fontScale(15),
    lineHeight: fontScale(20),
    marginBottom: verticalScale(4),
  },
  userMessageText: {
    color: COLORS.white,
  },
  riderMessageText: {
    color: COLORS.gray800,
  },
  messageTime: {
    fontSize: fontScale(11),
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  riderMessageTime: {
    color: COLORS.gray400,
  },
  quickRepliesContainer: {
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  quickReply: {
    backgroundColor: COLORS.gray100,
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(8),
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    marginRight: moderateScale(8),
  },
  quickReplyText: {
    fontSize: RESPONSIVE.fontSize.medium,
    color: COLORS.gray700,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: RESPONSIVE.borderRadius.xlarge,
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
    fontSize: fontScale(15),
    maxHeight: verticalScale(100),
    color: COLORS.gray800,
  },
  sendButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: moderateScale(8),
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray200,
    opacity: 0.7,
  },
});
