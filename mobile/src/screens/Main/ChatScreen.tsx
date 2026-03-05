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

  const quickReplies = [
    "I'm waiting outside",
    'Running a bit late',
    'Where are you?',
    'Thanks!',
  ];

  useEffect(() => {
    if (chatId) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [chatId]);

  const fetchMessages = async () => {
    try {
      const response = await chatService.getMessages(chatId);
      const raw = response.data?.data;
      const msgs = Array.isArray(raw) ? raw : [];
      setMessages(msgs.map((m: any) => ({
        id: m.id?.toString() || Date.now().toString(),
        text: m.message || m.text || '',
        sender: m.sender_id === receiverId ? 'rider' : 'user',
        time: m.created_at
          ? new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : '',
      })));
    } catch {
      // Silent fail for polling
    } finally {
      setLoading(false);
    }
  };

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

    if (chatId && receiverId) {
      setSending(true);
      try {
        await chatService.sendMessage(chatId, receiverId, messageText);
      } catch {
        // Message already shown locally
      } finally {
        setSending(false);
      }
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
            <View style={[styles.messageAvatar, { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={16} color="#9CA3AF" />
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
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {rider.photo ? (
            <Image source={{ uri: rider.photo }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color="#9CA3AF" />
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerName}>{rider.name || 'Driver'}</Text>
            {!!(rider.rating) && (
              <View style={styles.headerRating}>
                <Ionicons name="star" size={12} color="#FBBF24" />
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
        }}>
          <Ionicons name="call" size={24} color="#10B981" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Send a message to start chatting</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Quick Replies */}
      <View style={styles.quickRepliesContainer}>
        <FlatList
          horizontal
          data={quickReplies}
          keyExtractor={(item, index) => index.toString()}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickReply}
              onPress={() => sendMessage(item)}
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
        >
          {sending ? (
            <ActivityIndicator size="small" color="#D1D5DB" />
          ) : (
            <Ionicons
              name="send"
              size={20}
              color={message.trim() ? '#ffffff' : '#D1D5DB'}
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
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  headerText: {
    marginLeft: 12,
  },
  headerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  headerRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 4,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  messagesList: {
    padding: 20,
    paddingBottom: 10,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  riderMessage: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  riderBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  userMessageText: {
    color: '#ffffff',
  },
  riderMessageText: {
    color: '#1F2937',
  },
  messageTime: {
    fontSize: 11,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  riderMessageTime: {
    color: '#9CA3AF',
  },
  quickRepliesContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  quickReply: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  quickReplyText: {
    fontSize: 14,
    color: '#374151',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#1F2937',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
});
