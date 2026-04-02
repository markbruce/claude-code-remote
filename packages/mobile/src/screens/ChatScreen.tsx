/**
 * CC Remote - Chat Screen
 * Dedicated chat view with message list and input
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute, type NativeStackNavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList, ChatScreenParams } from '../navigation/types';
import { useChatStore } from '../store/chat';
import { useSocketStore } from '../store/socket';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';
import { ChatMessage } from '../components/Chat/ChatMessage';
import { ChatInput } from '../components/Chat/ChatInput';
import { PermissionBanner } from '../components/Chat/PermissionBanner';
import { SocketEvents } from 'cc-remote-shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ChatScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { isDark } = useThemeStore();
  const params = route.params as ChatScreenParams;

  const { socket } = useSocketStore();
  const { token } = useAuthStore();
  const {
    currentSession,
    isLoading,
    isStreaming,
    error,
    startSession,
    sendMessage,
    sendPermissionAnswer,
    endSession,
    clearCurrentSession,
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string;
    toolInput: string;
    requestId: string;
  } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const theme = isDark
    ? {
        background: colors.background.dark,
        card: colors.background.cardDark,
        text: colors.text.darkPrimary,
        textSecondary: colors.text.darkSecondary,
        border: colors.border.dark,
      }
    : {
        background: colors.background.light,
        card: colors.background.card,
        text: colors.text.primary,
        textSecondary: colors.text.secondary,
        border: colors.border.light,
      };

  useEffect(() => {
    navigation.setOptions({
      title: params.projectName || 'Chat',
      headerRight: () =>
        currentSession?.isActive ? (
          <TouchableOpacity onPress={handleEndSession}>
            <Text style={[styles.headerButton, { color: colors.error.light }]}>End</Text>
          </TouchableOpacity>
        ) : null,
    });

    // Start new session if needed
    if (!currentSession && socket) {
      initializeSession();
    }

    // Set up socket listeners for permission requests
    if (socket) {
      const handlePermissionRequest = (data: {
        session_id: string;
        toolName: string;
        toolInput: Record<string, unknown>;
        requestId: string;
      }) => {
        if (data.session_id === currentSession?.sessionId) {
          setPendingPermission({
            toolName: data.toolName,
            toolInput: JSON.stringify(data.toolInput, null, 2),
            requestId: data.requestId,
          });
        }
      };

      socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, handlePermissionRequest);

      return () => {
        socket.off(SocketEvents.CHAT_PERMISSION_REQUEST, handlePermissionRequest);
        if (currentSession) {
          clearCurrentSession(socket.off.bind(socket));
        }
      };
    }
  }, [params.projectId, currentSession, socket]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (currentSession?.messages && currentSession.messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [currentSession?.messages]);

  const initializeSession = async () => {
    try {
      const requestId = `start_${Date.now()}`;
      await startSession(
        {
          machine_id: params.machineId,
          project_path: params.projectId,
          mode: 'chat',
          request_id: requestId,
        },
        params.projectName,
        socket
      );
    } catch (err) {
      Alert.alert(
        'Session Error',
        err instanceof Error ? err.message : 'Failed to start session'
      );
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !currentSession) return;

    const message = inputText.trim();
    setInputText('');

    if (socket) {
      sendMessage(message, socket.emit.bind(socket));
    }
  };

  const handleEndSession = () => {
    if (currentSession && socket) {
      endSession(currentSession.sessionId, socket.emit.bind(socket));
    }
  };

  const handlePermissionApprove = () => {
    if (socket && pendingPermission) {
      sendPermissionAnswer(true, undefined, socket.emit.bind(socket));
      setPendingPermission(null);
    }
  };

  const handlePermissionDeny = () => {
    if (socket && pendingPermission) {
      sendPermissionAnswer(false, 'Permission denied by user', socket.emit.bind(socket));
      setPendingPermission(null);
    }
  };

  const renderMessage = ({ item }: { item: typeof currentSession.messages[0] }) => (
    <ChatMessage key={item.id} message={item} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🤖</Text>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Start a conversation</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        Ask Claude to help you with your code
      </Text>
      <View style={styles.suggestionsContainer}>
        {[
          'Explain this codebase',
          'Find bugs in my code',
          'Refactor this function',
          'Add new feature',
        ].map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={[styles.suggestionChip, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setInputText(suggestion)}
          >
            <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Permission Banner */}
      {pendingPermission && (
        <PermissionBanner
          toolName={pendingPermission.toolName}
          toolInput={pendingPermission.toolInput}
          onApprove={handlePermissionApprove}
          onDeny={handlePermissionDeny}
        />
      )}

      {/* Messages Area */}
      {isLoading && !currentSession ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Starting session...
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={currentSession?.messages ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.messagesContent,
            !currentSession?.messages || currentSession.messages.length === 0
              ? styles.messagesContentEmpty
              : null,
          ]}
          ListEmptyComponent={renderEmptyState}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Streaming Indicator */}
      {isStreaming && currentSession?.messages && currentSession.messages.length > 0 && (
        <View style={[styles.streamingIndicator, { borderTopColor: theme.border }]}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
          <Text style={[styles.streamingText, { color: theme.textSecondary }]}>
            Claude is typing...
          </Text>
        </View>
      )}

      {/* Input Area */}
      {currentSession?.isActive ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.inputContainer, { borderTopColor: theme.border }]}>
            <ChatInput
              value={inputText}
              onChangeText={setInputText}
              onSend={handleSendMessage}
              isLoading={isStreaming}
              placeholder="Ask Claude anything..."
            />
          </View>
        </KeyboardAvoidingView>
      ) : currentSession ? (
        <View style={[styles.inactiveBanner, { backgroundColor: colors.warning.light + '20' }]}>
          <Text style={[styles.inactiveText, { color: colors.warning.light }]}>
            Session ended • Start a new session to continue
          </Text>
          <TouchableOpacity
            style={[styles.restartButton, { backgroundColor: colors.warning.light }]}
            onPress={initializeSession}
          >
            <Text style={styles.restartButtonText}>Restart</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error.light + '20' }]}>
          <Text style={[styles.errorText, { color: colors.error.light }]}>{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messagesContentEmpty: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  streamingText: {
    fontSize: 13,
  },
  inputContainer: {
    borderTopWidth: 1,
  },
  inactiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  inactiveText: {
    fontSize: 13,
    flex: 1,
  },
  restartButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  restartButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 16,
  },
  errorBanner: {
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
  },
});
