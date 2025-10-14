import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  Bubble,
  Composer,
  GiftedChat,
  IMessage,
  InputToolbar,
  Send,
  User,
} from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL, getAuthToken } from '../api/client';

const USER: User = { _id: 'user', name: 'You' };
const ASSISTANT: User = { _id: 'assistant', name: 'FitScore Coach' };

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Suggested prompts for quick start
const SUGGESTED_PROMPTS = [
  "Create an image for my presentation",
  "Give me ideas for what to do with my workout data",
  "Analyze my recovery trends",
  "Plan my training week",
];

async function postCoachMessage(message: string, jwt: string, imageUris?: string[]): Promise<string> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/chat`;

  // Extract userId from JWT token
  const tokenPayload = JSON.parse(atob(jwt.split('.')[1]));
  const userId = tokenPayload.whoopId;

  let body: any = { userId, message };

  // If images are provided, convert to base64 and include
  if (imageUris && imageUris.length > 0) {
    try {
      const base64Images: string[] = [];

      for (const imageUri of imageUris) {
        const base64Response = await fetch(imageUri);
        const blob = await base64Response.blob();
        const reader = new FileReader();

        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]); // Remove data:image/...;base64, prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        base64Images.push(base64Data);
      }

      body.images = base64Images;
    } catch (err) {
      console.error('Failed to convert images to base64:', err);
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      errorText = parsed?.message || parsed?.error || response.statusText;
    } catch {
      /* ignore parse error */
    }
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data?.reply ?? '').toString();
}

export default function CoachScreen() {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showMemoryIndicator, setShowMemoryIndicator] = useState(true);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize with welcome message and memory indicator
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          _id: generateId(),
          text: "Hello! I'm your FitScore AI Coach. I can help you analyze your fitness data, plan workouts, and provide personalized insights based on your WHOOP metrics. What would you like to know?",
          createdAt: new Date(),
          user: ASSISTANT,
        },
      ]);

      // Show memory continuity indicator briefly
      setTimeout(() => {
        setShowMemoryIndicator(false);
      }, 3000);
    }
  }, []);

  const appendMessages = useCallback((incoming: IMessage[]) => {
    setMessages((prev) => {
      // Prepend messages (newer messages at top for reverse list)
      const newMessages = [...incoming, ...prev];
      return newMessages;
    });
  }, []);

  const handleSend = useCallback(
    async (text: string, imageUris?: string[]) => {
      if (!text.trim() && (!imageUris || imageUris.length === 0)) return;

      const hasImages = imageUris && imageUris.length > 0;
      const userMessage: IMessage = {
        _id: generateId(),
        text: text.trim() || (hasImages ? `📷 ${imageUris.length} image${imageUris.length > 1 ? 's' : ''} attached` : ''),
        createdAt: new Date(),
        user: USER,
        image: hasImages ? imageUris[0] : undefined, // Show first image in bubble
      };

      appendMessages([userMessage]);
      setIsSending(true);
      setShowSuggestions(false);

      try {
        const jwt = await getAuthToken();
        if (!jwt) {
          throw new Error('Authentication required');
        }

        const messageText = hasImages
          ? (text.trim() || 'Analyze these meal images and provide nutritional insights')
          : text.trim();

        const replyText = (await postCoachMessage(messageText, jwt, imageUris)).trim();
        appendMessages([
          {
            _id: generateId(),
            text: replyText || 'I apologize, but I\'m having trouble processing your request right now. Please try again.',
            createdAt: new Date(),
            user: ASSISTANT,
          },
        ]);
      } catch (error) {
        console.error('Chat error:', error);
        appendMessages([
          {
            _id: generateId(),
            text: 'I apologize, but I\'m having trouble connecting right now. Please check your connection and try again.',
            createdAt: new Date(),
            user: ASSISTANT,
            system: true,
          },
        ]);
      } finally {
        setIsSending(false);
        setSelectedImages([]);
      }
    },
    [appendMessages],
  );

  const handleSendPress = () => {
    if (inputText.trim() || selectedImages.length > 0) {
      handleSend(inputText, selectedImages.length > 0 ? selectedImages : undefined);
      setInputText('');
      setSelectedImages([]);
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setInputText(suggestion);
  };

  const handleImagePicker = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant photo library access to upload images');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.3, // Reduced quality to prevent "entity too large" error
      });

      if (!result.canceled && result.assets[0]) {
        // Add image to array instead of replacing
        setSelectedImages(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const renderBubble = useCallback(
    (props: any) => (
      <Bubble
        {...props}
        wrapperStyle={{
          left: styles.assistantBubble,
          right: styles.userBubble,
        }}
        textStyle={{
          left: styles.bubbleText,
          right: styles.bubbleText,
        }}
      />
    ),
    [],
  );

  const renderSystemMessage = useCallback((props: any) => {
    if (!props.currentMessage?.text) return null;
    return (
      <View style={styles.systemBubble}>
        <Text style={styles.systemText}>{props.currentMessage.text}</Text>
      </View>
    );
  }, []);

  const renderFooter = useCallback(() => {
    if (!isSending) return null;
    return (
      <View style={styles.typingIndicator}>
        <ActivityIndicator size="small" color="#10A37F" />
        <Text style={styles.typingText}>Coach is thinking...</Text>
      </View>
    );
  }, [isSending]);

  const renderSuggestions = () => {
    if (!showSuggestions || messages.length > 1) return null;

    return (
      <View style={styles.suggestionsContainer}>
        <Text style={styles.suggestionsTitle}>Try asking:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionChip}
              onPress={() => handleSuggestionPress(prompt)}
            >
              <Text style={styles.suggestionText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>FitScore Coach</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton}>
              <Text style={styles.headerButtonText}>⋮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Text style={styles.headerButtonText}>⟳</Text>
            </TouchableOpacity>
          </View>
        </View>
        {showMemoryIndicator && (
          <View style={styles.memoryIndicator}>
            <Text style={styles.memoryIndicatorText}>💬 Continuing from where we left off...</Text>
          </View>
        )}
      </View>

      {/* Chat Messages */}
      <View style={styles.chatContainer}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          inverted={true}
        >
          {isSending && (
            <View style={styles.typingIndicator}>
              <ActivityIndicator size="small" color="#10A37F" />
              <Text style={styles.typingText}>Coach is thinking...</Text>
            </View>
          )}
          {messages.map((message) => (
            <View
              key={message._id}
              style={[
                styles.messageContainer,
                message.user._id === 'user' ? styles.userMessageContainer : styles.assistantMessageContainer
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  message.user._id === 'user' ? styles.userBubble : styles.assistantBubble
                ]}
              >
                {message.image && (
                  <Image
                    source={{ uri: message.image }}
                    style={styles.messageImage}
                    resizeMode="cover"
                  />
                )}
                {message.user._id === 'assistant' ? (
                  <Markdown style={markdownStyles}>{message.text}</Markdown>
                ) : (
                  <Text style={styles.bubbleText}>{message.text}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        {renderSuggestions()}
      </View>

      {/* Input Area */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
        {selectedImages.length > 0 && (
          <ScrollView horizontal style={styles.imagesPreviewContainer} showsHorizontalScrollIndicator={false}>
            {selectedImages.map((uri, index) => (
              <View key={index} style={styles.imagePreviewWrapper}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.inputWrapper}>
          <TouchableOpacity style={styles.attachButton} onPress={handleImagePicker}>
            <Text style={styles.attachButtonText}>
              {selectedImages.length > 0 ? `📷 ${selectedImages.length}` : '📷'}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={selectedImages.length > 0 ? "Add a message (optional)" : "Ask anything"}
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={2000}
            onSubmitEditing={handleSendPress}
            returnKeyType="send"
          />

          <TouchableOpacity style={styles.micButton}>
            <Text style={styles.micButtonText}>🎤</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendPress}
            disabled={!inputText.trim() || isSending}
          >
            <Text style={styles.sendButtonText}>▶</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  memoryIndicator: {
    backgroundColor: '#10A37F',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  memoryIndicatorText: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontSize: 18,
    color: '#ffffff',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  messagesScroll: {
    flex: 1,
  },
  listContent: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  messageContainer: {
    marginBottom: 8,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  assistantMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: 12,
  },
  userBubble: {
    backgroundColor: '#3b82f6',
  },
  assistantBubble: {
    backgroundColor: '#1e293b',
  },
  bubbleText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  imagesPreviewContainer: {
    padding: 8,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: 100,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginVertical: 8,
  },
  systemText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
    marginBottom: 8,
  },
  suggestionsScroll: {
    flexDirection: 'row',
  },
  suggestionChip: {
    backgroundColor: '#334155',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  suggestionText: {
    fontSize: 14,
    color: '#ffffff',
  },
  inputContainer: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  attachButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachButtonText: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: '300',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    maxHeight: 120,
    minHeight: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    textAlignVertical: 'top',
  },
  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 8,
  },
  micButtonText: {
    fontSize: 16,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
  },
  sendButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  typingText: {
    color: '#94a3b8',
    marginLeft: 8,
    fontSize: 14,
  },
});

// Markdown styles for assistant messages
const markdownStyles = {
  body: {
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: '#f1f5f9',
    fontSize: 24,
    fontWeight: '700',
    marginVertical: 8,
  },
  heading2: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '600',
    marginVertical: 6,
  },
  strong: {
    fontWeight: '700',
    color: '#f1f5f9',
  },
  em: {
    fontStyle: 'italic',
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginRight: 8,
    color: '#94a3b8',
  },
  code_inline: {
    backgroundColor: '#1e293b',
    color: '#3b82f6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  code_block: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 6,
    marginVertical: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fence: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 6,
    marginVertical: 6,
  },
  link: {
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  blockquote: {
    backgroundColor: '#1e293b',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 6,
  },
};
