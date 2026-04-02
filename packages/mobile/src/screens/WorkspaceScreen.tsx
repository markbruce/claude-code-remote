/**
 * CC Remote - Workspace Screen
 * Main workspace combining chat interface and file browser
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
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

interface Tab {
  key: 'chat' | 'files';
  title: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: 'chat', title: 'Chat', icon: '💬' },
  { key: 'files', title: 'Files', icon: '📁' },
];

export function WorkspaceScreen(): React.JSX.Element {
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

  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [inputText, setInputText] = useState('');
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string;
    toolInput: string;
    requestId: string;
  } | null>(null);

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
      title: params.projectName || 'Workspace',
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

    return () => {
      // Clean up session on unmount
      if (currentSession) {
        clearCurrentSession(socket.off.bind(socket));
      }
    };
  }, [params.projectId, currentSession, socket]);

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

  const renderChatTab = () => (
    <View style={styles.chatContainer}>
      {currentSession?.messages && currentSession.messages.length > 0 ? (
        <View style={styles.messagesList}>
          {currentSession.messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </View>
      ) : (
        <View style={styles.emptyChatContainer}>
          <Text style={styles.emptyEmoji}>🤖</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Start a conversation</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Ask Claude to help you with your code
          </Text>
        </View>
      )}

      {isStreaming && (
        <View style={styles.streamingIndicator}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
          <Text style={[styles.streamingText, { color: theme.textSecondary }]}>
            Claude is thinking...
          </Text>
        </View>
      )}
    </View>
  );

  const renderFilesTab = () => (
    <View style={styles.filesContainer}>
      <View style={styles.filesEmptyContainer}>
        <Text style={styles.filesEmptyEmoji}>📁</Text>
        <Text style={[styles.filesEmptyTitle, { color: theme.text }]}>File Browser</Text>
        <Text style={[styles.filesEmptyText, { color: theme.textSecondary }]}>
          Browse and edit files in your project
        </Text>
        <TouchableOpacity
          style={[styles.filesEmptyButton, { backgroundColor: colors.primary[600] }]}
          onPress={() => navigation.navigate('FileBrowser', params)}
        >
          <Text style={styles.filesEmptyButtonText}>Open File Browser</Text>
        </TouchableOpacity>
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

      {/* Tabs */}
      <View style={[styles.tabsContainer, { borderBottomColor: theme.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && [styles.activeTab, { borderBottomColor: colors.primary[600] }],
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabIcon]}>{tab.icon}</Text>
            <Text
              style={[
                styles.tabTitle,
                { color: activeTab === tab.key ? colors.primary[600] : theme.textSecondary },
              ]}
            >
              {tab.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading && !currentSession ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Starting session...
          </Text>
        </View>
      ) : (
        <>
          {activeTab === 'chat' ? renderChatTab() : renderFilesTab()}

          {/* Chat Input (only show on chat tab) */}
          {activeTab === 'chat' && currentSession?.isActive && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'position' : 'height'}
              keyboardVerticalOffset={80}
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
          )}

          {!currentSession?.isActive && (
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
          )}
        </>
      )}

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
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabIcon: {
    fontSize: 18,
  },
  tabTitle: {
    fontSize: 14,
    fontWeight: '600',
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
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  emptyChatContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 48,
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
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  streamingText: {
    fontSize: 13,
  },
  inputContainer: {
    borderTopWidth: 1,
    padding: 12,
  },
  filesContainer: {
    flex: 1,
  },
  filesEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  filesEmptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  filesEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  filesEmptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  filesEmptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  filesEmptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
