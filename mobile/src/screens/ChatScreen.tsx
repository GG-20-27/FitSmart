// mobile/src/screens/ChatScreen.tsx
import React, { useCallback, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, getAuthToken } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography, shadows } from '../theme';

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// AsyncStorage keys
const CHAT_SESSIONS_KEY = '@fitscore_chat_sessions';
const CURRENT_SESSION_KEY = '@fitscore_current_session';

// Try to load ChatGPT icon, fallback to null if not available
let CHATGPT_ICON = null;
try {
  CHATGPT_ICON = require('../../assets/chatgpt-icon.png');
} catch (e) {
  console.warn('ChatGPT icon not found, using fallback');
}

interface Message {
  _id: string;
  text: string;
  createdAt: Date;
  isUser: boolean;
  images?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastMessageAt: Date;
}

// Subtle pulse indicator aligned left like assistant messages
function TypingIndicator() {
  const [pulseAnim] = useState(new Animated.Value(0.6));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingBubble, { opacity: pulseAnim }]}>
        <Text style={styles.loadingText}>Thinking</Text>
        <Text style={styles.loadingDots}>...</Text>
      </Animated.View>
    </View>
  );
}

// Listening Wave Animation for voice recording
function ListeningWave() {
  const [animations] = useState(() =>
    Array.from({ length: 20 }, () => new Animated.Value(0.3))
  );

  useEffect(() => {
    // Create staggered wave animations for each bar
    const animationSequence = animations.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 300 + (index * 20),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 300 + (index * 20),
            useNativeDriver: true,
          }),
        ])
      );
    });

    // Start all animations
    animationSequence.forEach(anim => anim.start());

    return () => {
      animationSequence.forEach(anim => anim.stop());
    };
  }, []);

  return (
    <View style={styles.listeningWaveContainer}>
      <Text style={styles.listeningText}>Listening</Text>
      <View style={styles.waveContainer}>
        {animations.map((anim, index) => {
          const scale = anim.interpolate({
            inputRange: [0.3, 1],
            outputRange: [0.5, 2],
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.waveBar,
                {
                  transform: [{ scaleY: scale }],
                  opacity: anim,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// Animated Message Component with Streaming Text Effect
function AnimatedMessage({ message }: { message: Message }) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [displayedText, setDisplayedText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Streaming text effect for AI messages
    if (!message.isUser && message.text) {
      const text = message.text;
      let currentIndex = 0;

      // Start with empty text
      setDisplayedText('');

      // Use requestAnimationFrame for smoother, faster streaming
      let animationFrameId: number;
      let lastTimestamp = 0;
      const charsPerFrame = 3; // Stream 3 chars at once for natural speed

      const animate = (timestamp: number) => {
        if (!lastTimestamp) lastTimestamp = timestamp;
        const elapsed = timestamp - lastTimestamp;

        // Update every ~16ms (60fps) with 3 chars = ~180 chars/second
        if (elapsed > 16) {
          lastTimestamp = timestamp;
          currentIndex = Math.min(currentIndex + charsPerFrame, text.length);
          setDisplayedText(text.substring(0, currentIndex));
        }

        if (currentIndex < text.length) {
          animationFrameId = requestAnimationFrame(animate);
        }
      };

      animationFrameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationFrameId);
    } else {
      // User messages appear instantly
      setDisplayedText(message.text);
    }
  }, [message.text, message.isUser]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={[styles.messageRow, message.isUser && styles.userMessageRow]}>
        <View style={[styles.messageBubble, message.isUser ? styles.userBubbleStyle : styles.assistantBubbleStyle]}>
          {message.images && message.images.length > 0 && (
            <ScrollView horizontal style={styles.messageImagesContainer}>
              {message.images.map((uri, idx) => (
                <Image key={idx} source={{ uri }} style={styles.messageImage} />
              ))}
            </ScrollView>
          )}
          {message.isUser ? (
            <Text style={styles.userMessageText} selectable>{displayedText}</Text>
          ) : (
            <View>
              <View style={styles.markdownWrapper}>
                <Markdown
                  style={markdownStyles}
                  mergeStyle={true}
                >
                  {displayedText}
                </Markdown>
              </View>
              {displayedText.length > 0 && (
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopy}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copied ? "checkmark-circle" : "copy-outline"}
                    size={16}
                    color={copied ? colors.success : colors.textMuted}
                  />
                  <Text style={[styles.copyButtonText, copied && styles.copiedText]}>
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

async function transcribeAudio(audioUri: string, jwt: string): Promise<string> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/chat/transcribe`;

  console.log('[TRANSCRIBE] Preparing to transcribe audio:', audioUri);

  try {
    // Read audio file as base64
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log(`[TRANSCRIBE] Read audio file: ${audioBase64.length} chars of base64 data`);

    // Send as JSON with base64 encoded audio
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64,
        filename: 'voice-message.m4a',
      }),
    });

    console.log('[TRANSCRIBE] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TRANSCRIBE] Error response:', errorText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[TRANSCRIBE] Success:', data);
    return data.transcription || '';
  } catch (error) {
    console.error('[TRANSCRIBE] Upload error:', error);
    throw error;
  }
}

async function postCoachMessage(message: string, images: string[] | undefined, jwt: string): Promise<string> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/chat`;
  const tokenPayload = JSON.parse(atob(jwt.split('.')[1]));
  const userId = tokenPayload.whoopId;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      message,
      images
    }),
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

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('default');
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollViewRef = React.useRef<ScrollView>(null);

  // Load chat sessions from AsyncStorage on mount
  useEffect(() => {
    const loadChatData = async () => {
      try {
        const [sessionsData, currentSessionData] = await Promise.all([
          AsyncStorage.getItem(CHAT_SESSIONS_KEY),
          AsyncStorage.getItem(CURRENT_SESSION_KEY),
        ]);

        if (sessionsData) {
          const sessions = JSON.parse(sessionsData);
          setChatSessions(sessions);
        }

        if (currentSessionData) {
          const { sessionId, messages: savedMessages } = JSON.parse(currentSessionData);
          setCurrentSessionId(sessionId);
          setMessages(savedMessages || []);
        }
      } catch (error) {
        console.error('Failed to load chat data:', error);
      }
    };

    loadChatData();
  }, []);

  // Save current session whenever messages change
  useEffect(() => {
    const saveCurrentSession = async () => {
      try {
        await AsyncStorage.setItem(
          CURRENT_SESSION_KEY,
          JSON.stringify({
            sessionId: currentSessionId,
            messages,
          })
        );

        // Update existing session in chatSessions if it exists
        if (messages.length > 0) {
          setChatSessions(prev => {
            const existingIndex = prev.findIndex(s => s.id === currentSessionId);
            if (existingIndex >= 0) {
              // Update existing session with new messages
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                messages: [...messages],
                lastMessageAt: new Date()
              };
              return updated;
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Failed to save current session:', error);
      }
    };

    if (messages.length > 0) {
      saveCurrentSession();
    }
  }, [messages, currentSessionId]);

  // Save chat sessions whenever they change
  useEffect(() => {
    const saveSessions = async () => {
      try {
        await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(chatSessions));
      } catch (error) {
        console.error('Failed to save chat sessions:', error);
      }
    };

    if (chatSessions.length > 0) {
      saveSessions();
    }
  }, [chatSessions]);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim() || transcribedText.trim();
    const images = selectedImages.length > 0 ? selectedImages : undefined;

    if (!text && !images) return;

    const userMessage: Message = {
      _id: generateId(),
      text: text || `📷 ${images!.length} image(s)`,
      createdAt: new Date(),
      isUser: true,
      images,
    };

    appendMessage(userMessage);
    setInputText('');
    setTranscribedText('');
    setSelectedImages([]);
    setIsSending(true);

    try {
      const jwt = await getAuthToken();
      if (!jwt) {
        throw new Error('Authentication required');
      }

      const messageText = text || 'Analyze these images';
      let imageUrls: string[] | undefined = undefined;

      // Upload images to get URLs if there are any
      if (images && images.length > 0) {
        console.log(`[SEND] Uploading ${images.length} images to get URLs`);

        try {
          const uploadResponse = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/images/upload`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ images }),
          });

          console.log(`[SEND] Image upload response status: ${uploadResponse.status}`);

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            imageUrls = uploadData.urls;
            console.log(`[SEND] ✅ Images uploaded successfully: ${imageUrls?.length} URLs`);
            console.log(`[SEND] Image URLs:`, imageUrls);
          } else {
            const errorText = await uploadResponse.text();
            console.error(`[SEND] ❌ Image upload HTTP ${uploadResponse.status}:`, errorText);
            console.error('[SEND] Falling back to base64');
            imageUrls = images; // Fallback to base64
          }
        } catch (uploadError) {
          console.error('[SEND] ❌ Image upload network error:', uploadError);
          console.error('[SEND] Falling back to base64');
          imageUrls = images; // Fallback to base64
        }
      }

      console.log(`[SEND] Sending message with ${imageUrls?.length || 0} images`);

      const replyText = (await postCoachMessage(messageText, imageUrls, jwt)).trim();

      console.log('[SEND] Received reply:', replyText.substring(0, 100));

      appendMessage({
        _id: generateId(),
        text: replyText || '⚠️ Coach is unavailable. Try again later.',
        createdAt: new Date(),
        isUser: false,
      });
    } catch (error) {
      console.error('[SEND] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';

      appendMessage({
        _id: generateId(),
        text: `⚠️ ${errorMessage}`,
        createdAt: new Date(),
        isUser: false,
      });
    } finally {
      setIsSending(false);
    }
  }, [inputText, transcribedText, selectedImages, appendMessage]);

  const handleImagePicker = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant photo library access');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      // Show loading state while processing
      setIsSending(true);

      // Process images
      const processedImages = await Promise.all(
        result.assets.map(async (asset) => {
          try {
            // Resize to max 512px width and compress more aggressively for Vision API
            const manipResult = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: 512 } }],
              { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            if (!manipResult.base64) {
              console.error('[IMAGE] No base64 data returned from manipulator');
              return null;
            }

            // Validate base64 data
            const base64Data = manipResult.base64;
            const base64Length = base64Data.length;
            const estimatedSizeKB = Math.round((base64Length * 0.75) / 1024);

            console.log(`[IMAGE] Processed image: ${estimatedSizeKB}KB (base64 length: ${base64Length})`);
            console.log(`[IMAGE] First 50 chars of base64: ${base64Data.substring(0, 50)}...`);

            // Return properly formatted data URL
            return `data:image/jpeg;base64,${base64Data}`;
          } catch (err) {
            console.error('[IMAGE] Processing error:', err);
            return null;
          }
        })
      );

      const validImages = processedImages.filter((img): img is string => img !== null);
      if (validImages.length > 0) {
        setSelectedImages(prev => [...prev, ...validImages]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick images');
    } finally {
      setIsSending(false); // Hide loading after processing
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant microphone access');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert('Error', 'Failed to save recording');
        return;
      }

      setIsSending(true);

      try {
        const jwt = await getAuthToken();
        if (!jwt) {
          throw new Error('Authentication required');
        }

        const transcription = await transcribeAudio(uri, jwt);

        if (!transcription.trim()) {
          throw new Error('No speech detected');
        }

        // Set transcribed text for user to review (don't auto-send)
        setTranscribedText(transcription);
        setInputText(transcription);
        console.log('[VOICE] Transcription inserted into input, ready for user review');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VOICE] Transcription error:', errorMsg);
        // Simple fallback toast
        Alert.alert('', "Didn't catch that - try again or use text input.");
      } finally {
        setIsSending(false);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to process recording');
      setIsSending(false);
    }
  }, [recording]);

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Generate chat title using OpenAI
  const generateChatTitle = useCallback(async (messages: Message[]): Promise<string> => {
    try {
      const jwt = await getAuthToken();
      if (!jwt) return 'New Chat';

      // Get first few messages for context
      const conversationContext = messages
        .slice(0, 4)
        .map(m => `${m.isUser ? 'User' : 'AI'}: ${m.text}`)
        .join('\n');

      const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'title-generator',
          message: `Generate a 2-5 word title for this conversation. Respond ONLY with the title, no quotes, no punctuation:\n\n${conversationContext}`,
          images: []
        }),
      });

      if (!response.ok) return 'New Chat';

      const data = await response.json();
      let title = (data?.reply ?? 'New Chat').toString().trim().replace(/['"]/g, '');

      // Limit to 5 words maximum
      const words = title.split(/\s+/);
      if (words.length > 5) {
        title = words.slice(0, 5).join(' ');
      }

      // Limit character length with ellipsis if needed
      if (title.length > 40) {
        title = title.substring(0, 37) + '...';
      }

      return title;
    } catch (error) {
      console.error('Failed to generate title:', error);
      return 'New Chat';
    }
  }, []);

  // Save current chat as new session with auto-generated title
  const saveCurrentChat = useCallback(async () => {
    if (messages.length === 0) return;

    setIsGeneratingTitle(true);
    const title = await generateChatTitle(messages);
    setIsGeneratingTitle(false);

    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title,
      messages: [...messages],
      createdAt: new Date(),
      lastMessageAt: new Date()
    };

    setChatSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  }, [messages, generateChatTitle]);

  // Load a chat session
  const loadChatSession = useCallback((session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setShowHistoryModal(false);
  }, []);

  // Start new chat
  const startNewChat = useCallback(() => {
    if (messages.length > 0) {
      saveCurrentChat();
    }
    setMessages([]);
    setCurrentSessionId(`session_${Date.now()}`);
    setShowHistoryModal(false);
  }, [messages, saveCurrentChat]);

  // Delete a chat session
  const deleteSession = useCallback((sessionId: string) => {
    setChatSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setMessages([]);
      setCurrentSessionId('default');
    }
    setShowSessionMenu(false);
    setSelectedSession(null);
  }, [currentSessionId]);

  // Rename a chat session
  const renameSession = useCallback((sessionId: string, newTitle: string) => {
    setChatSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, title: newTitle } : s
    ));
    setShowSessionMenu(false);
    setSelectedSession(null);
  }, []);

  // Share chat (placeholder for actual share implementation)
  const shareChat = useCallback(async (session: ChatSession) => {
    try {
      const chatText = session.messages
        .map(m => `${m.isUser ? 'You' : 'FitScore AI'}: ${m.text}`)
        .join('\n\n');

      Alert.alert('Share Chat', `Chat Title: ${session.title}\n\n${chatText.substring(0, 200)}...`);
      setShowSessionMenu(false);
      setSelectedSession(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to share chat');
    }
  }, []);

  // Handle long press on session
  const handleLongPress = useCallback((session: ChatSession) => {
    setSelectedSession(session);
    setShowSessionMenu(true);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => setShowHistoryModal(true)}>
          <Ionicons name="list-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.headerButtonText}>History</Text>
        </TouchableOpacity>
        {CHATGPT_ICON ? (
          <Image source={CHATGPT_ICON} style={styles.headerIcon} />
        ) : (
          <Text style={styles.headerTitle}>FitScore AI</Text>
        )}
        <TouchableOpacity style={styles.headerButton} onPress={startNewChat}>
          <Ionicons name="add-circle-outline" size={24} color={colors.textPrimary} />
          <Text style={styles.headerButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Chat History Modal */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowHistoryModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chat History</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sessionsList}>
              {chatSessions.length === 0 ? (
                <Text style={styles.emptyText}>No saved chats yet</Text>
              ) : (
                chatSessions.map((session) => {
                  // Truncate title to 25 chars max
                  const displayTitle = session.title.length > 25
                    ? session.title.substring(0, 25) + '...'
                    : session.title;

                  // Get last message preview (last assistant or user message)
                  const lastMessage = session.messages[session.messages.length - 1];
                  const lastMessagePreview = lastMessage
                    ? lastMessage.text.substring(0, 40) + (lastMessage.text.length > 40 ? '...' : '')
                    : '';

                  return (
                    <TouchableOpacity
                      key={session.id}
                      style={styles.sessionItem}
                      onPress={() => loadChatSession(session)}
                      onLongPress={() => handleLongPress(session)}
                      delayLongPress={500}
                    >
                      <View style={styles.sessionContent}>
                        <Text style={styles.sessionTitle} numberOfLines={1} ellipsizeMode="tail">
                          {displayTitle}
                        </Text>
                        <Text style={styles.sessionPreview} numberOfLines={1} ellipsizeMode="tail">
                          {lastMessagePreview}
                        </Text>
                        <Text style={styles.sessionDate}>
                          {session.messages.length} messages
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Session Preview Bottom Sheet */}
      <Modal
        visible={showSessionMenu}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSessionMenu(false);
          setSelectedSession(null);
        }}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowSessionMenu(false);
            setSelectedSession(null);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.bottomSheetContainer}
          >
            {selectedSession && (
              <>
                {/* Chat Preview */}
                <View style={styles.chatPreview}>
                  <Text style={styles.previewTitle}>{selectedSession.title}</Text>
                  <ScrollView style={styles.previewMessages} nestedScrollEnabled>
                    {selectedSession.messages.slice(0, 3).map((msg, idx) => (
                      <View key={idx} style={styles.previewMessage}>
                        <Text style={styles.previewMessageSender}>
                          {msg.isUser ? 'You' : 'FitScore AI'}
                        </Text>
                        <Text style={styles.previewMessageText} numberOfLines={2}>
                          {msg.text}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                {/* Action Buttons */}
                <View style={styles.menuActions}>
                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => shareChat(selectedSession)}
                  >
                    <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
                    <Text style={styles.menuButtonText}>Share chat</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => {
                      setShowSessionMenu(false);
                      setTimeout(() => {
                        Alert.prompt(
                          'Rename Chat',
                          'Enter a new name for this chat',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Save',
                              onPress: (newTitle) => {
                                if (newTitle && newTitle.trim()) {
                                  renameSession(selectedSession.id, newTitle.trim());
                                }
                              }
                            }
                          ],
                          'plain-text',
                          selectedSession.title
                        );
                      }, 100);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={24} color={colors.textPrimary} />
                    <Text style={styles.menuButtonText}>Rename</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => {
                      Alert.alert(
                        'Delete Chat',
                        'Are you sure you want to delete this chat?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteSession(selectedSession.id)
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={24} color={colors.danger} />
                    <Text style={[styles.menuButtonText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => (
          <AnimatedMessage key={message._id} message={message} />
        ))}
        {isSending && <TypingIndicator />}
      </ScrollView>

      {/* Image Preview */}
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

      {/* Input Area */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {isRecording ? (
          <View style={styles.recordingContainer}>
            <ListeningWave />
            <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
              <Ionicons name="stop-circle" size={32} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.actionButton} onPress={handleImagePicker} disabled={isSending}>
              <Ionicons name="image-outline" size={24} color={colors.accent} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message FitScore AI"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              editable={!isSending}
            />

            <TouchableOpacity
              style={styles.actionButton}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isSending}
            >
              <Ionicons name="mic-outline" size={24} color={colors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() && selectedImages.length === 0) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isSending || (!inputText.trim() && selectedImages.length === 0)}
            >
              <Ionicons name="send" size={20} color={colors.bgPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  // Message styles
  messageRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    alignItems: 'flex-start',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    ...typography.bodyMuted,
    fontWeight: '700',
  },
  messageBubble: {
    flex: 1,
    paddingVertical: 4,
  },
  userBubbleStyle: {
    maxWidth: '75%',
    backgroundColor: colors.accent,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  assistantBubbleStyle: {
    width: '100%',
    backgroundColor: 'transparent',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent, // Subtle accent border for warmth
    paddingLeft: spacing.md,
  },
  userMessageText: {
    ...typography.body,
    color: colors.bgPrimary,
    lineHeight: 22,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSecondary,
    gap: spacing.xs,
  },
  copyButtonText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '500',
  },
  copiedText: {
    color: colors.success,
  },
  markdownWrapper: {
    // Allow text selection in markdown content
  },
  messageImagesContainer: {
    marginBottom: spacing.sm,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: radii.md,
    marginRight: spacing.sm,
  },
  // Typing indicator
  typingContainer: {
    paddingVertical: spacing.sm,
    alignItems: 'flex-start', // Align left like assistant messages
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
  loadingDots: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 2,
  },
  // Image preview
  imagesPreviewContainer: {
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: 100,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Input container
  inputContainer: {
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    maxHeight: 120,
    minHeight: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionButton: {
    padding: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceMute,
  },
  // Recording
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.danger,
    marginRight: spacing.md,
  },
  recordingText: {
    flex: 1,
    color: colors.danger,
    ...typography.body,
    fontWeight: '600',
  },
  stopButton: {
    padding: 4,
  },
  listeningWaveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  listeningText: {
    color: colors.accent,
    ...typography.body,
    fontWeight: '600',
    marginRight: spacing.md,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  waveBar: {
    width: 3,
    backgroundColor: colors.accent,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  // Chat history header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSecondary,
  },
  headerButtonText: {
    ...typography.bodyMuted,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.title,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
  },
  // Chat history modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.xl,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute,
  },
  modalTitle: {
    ...typography.h2,
  },
  sessionsList: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  sessionPreview: {
    ...typography.bodyMuted,
    fontSize: 13,
    marginBottom: 4,
    color: colors.textMuted,
  },
  sessionDate: {
    ...typography.bodyMuted,
    fontSize: 12,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSecondary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  renameInput: {
    ...typography.body,
    fontWeight: '600',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  // Bottom sheet preview modal
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: `${colors.bgPrimary}D9`, // 85% opacity for blur effect
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: 40,
    maxHeight: '70%',
    ...shadows.card,
  },
  chatPreview: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute,
    maxHeight: 200,
  },
  previewTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  previewMessages: {
    maxHeight: 140,
  },
  previewMessage: {
    marginBottom: spacing.sm,
  },
  previewMessageSender: {
    ...typography.small,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewMessageText: {
    ...typography.bodyMuted,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  menuActions: {
    padding: spacing.sm,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  menuButtonText: {
    ...typography.body,
    fontWeight: '500',
  },
});

// Markdown styles optimized for dark theme
const markdownStyles = {
  body: {
    ...typography.body,
    lineHeight: 24,
  },
  heading1: {
    ...typography.h1,
    marginVertical: spacing.md,
  },
  heading2: {
    ...typography.h2,
    marginVertical: spacing.sm,
  },
  heading3: {
    ...typography.title,
    marginVertical: spacing.sm,
  },
  strong: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  paragraph: {
    marginVertical: 8, // Increased from 4 for better breathing room
  },
  bullet_list: {
    marginVertical: spacing.sm,
  },
  ordered_list: {
    marginVertical: spacing.sm,
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginRight: spacing.sm,
    color: colors.textMuted,
    fontSize: 16,
  },
  ordered_list_icon: {
    marginLeft: 0,
    marginRight: spacing.sm,
    color: colors.textMuted,
    fontSize: 16,
  },
  code_inline: {
    backgroundColor: colors.bgSecondary,
    color: colors.accent,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
  },
  code_block: {
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  fence: {
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  link: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  blockquote: {
    backgroundColor: colors.bgSecondary,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.sm,
    marginVertical: spacing.sm,
    borderRadius: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    borderRadius: radii.sm,
    marginVertical: spacing.sm,
  },
  thead: {
    backgroundColor: colors.bgSecondary,
  },
  tbody: {},
  th: {
    color: colors.textPrimary,
    fontWeight: '600',
    padding: spacing.sm,
  },
  td: {
    color: colors.textPrimary,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.surfaceMute,
  },
  hr: {
    backgroundColor: colors.surfaceMute,
    height: 1,
    marginVertical: spacing.md,
  },
};
