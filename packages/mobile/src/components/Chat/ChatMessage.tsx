/**
 * CC Remote - Chat Message Component
 * Displays a single chat message with markdown support
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';
import type { ChatMessage } from '../../store/chat';

interface Props {
  message: ChatMessage;
}

export function ChatMessage({ message }: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    background: isDark ? colors.background.cardDark : colors.background.card,
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    border: isDark ? colors.border.dark : colors.border.light,
    userBubble: isDark ? '#1e3a8a' : '#dbeafe',
    assistantBubble: isDark ? '#1f2937' : '#f3f4f6',
    codeBlock: isDark ? '#111827' : '#1e293b',
    codeText: isDark ? '#e5e7eb' : '#f1f5f9',
  };

  const isUser = message.type === 'text' && !message.toolName;
  const isToolUse = message.type === 'tool_use';
  const isToolResult = message.type === 'tool_result';
  const isError = message.type === 'error' || message.isError;

  const getBubbleStyle = (): ViewStyle => {
    if (isUser) {
      return {
        backgroundColor: theme.userBubble,
        alignSelf: 'flex-end',
        marginLeft: 48,
      };
    }
    return {
      backgroundColor: theme.assistantBubble,
      alignSelf: 'flex-start',
    };
  };

  const renderContent = () => {
    if (isToolUse) {
      return (
        <View style={styles.toolUseContainer}>
          <Text style={[styles.toolLabel, { color: colors.primary[600] }]}>
            {message.toolName || 'Tool'}
          </Text>
          {message.toolInput && (
            <Text style={[styles.toolInput, { color: theme.textSecondary }]}>
              {message.toolInput}
            </Text>
          )}
        </View>
      );
    }

    if (isToolResult) {
      return (
        <View style={[styles.toolResultContainer, { backgroundColor: theme.codeBlock }]}>
          <Text style={[styles.toolResultLabel, { color: colors.warning.light }]}>
            Result
          </Text>
          {message.toolResult && (
            <Text style={[styles.toolResultText, { color: theme.codeText }]}>
              {message.toolResult}
            </Text>
          )}
        </View>
      );
    }

    if (isError) {
      return (
        <View style={[styles.errorContainer, { backgroundColor: colors.error.light + '20' }]}>
          <Text style={[styles.errorText, { color: colors.error.light }]}>
            {message.content}
          </Text>
        </View>
      );
    }

    if (message.content) {
      return (
        <Markdown
          style={{
            body: { color: theme.text, fontSize: 15, lineHeight: 22 },
            heading1: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
            heading2: { color: theme.text, fontSize: 18, fontWeight: '600', marginBottom: 6 },
            heading3: { color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
            paragraph: { marginBottom: 8 },
            code_inline: {
              backgroundColor: theme.codeBlock,
              color: colors.primary[600],
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 13,
            },
            code_block: {
              backgroundColor: theme.codeBlock,
              color: theme.codeText,
              padding: 12,
              borderRadius: 8,
              marginVertical: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              overflow: 'hidden',
            },
            fence: {
              backgroundColor: theme.codeBlock,
              color: theme.codeText,
              padding: 12,
              borderRadius: 8,
              marginVertical: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              overflow: 'hidden',
            },
            bullet_list: { marginBottom: 8 },
            ordered_list: { marginBottom: 8 },
            list_item: { flexDirection: 'row', marginBottom: 4 },
            strong: { fontWeight: '700' },
            link: { color: colors.primary[600], textDecorationLine: 'underline' },
            blockquote: {
              backgroundColor: theme.codeBlock,
              borderLeftWidth: 4,
              borderLeftColor: colors.primary[600],
              paddingLeft: 12,
              paddingVertical: 4,
              marginVertical: 8,
              fontStyle: 'italic',
            },
            hr: { backgroundColor: theme.border, height: 1, marginVertical: 12 },
            table: { borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
            th: { backgroundColor: theme.codeBlock, padding: 8, fontWeight: '600' },
            td: { padding: 8, borderWidth: 1, borderColor: theme.border },
          }}
        >
          {message.content}
        </Markdown>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.bubble, getBubbleStyle()]}>
        {renderContent()}
      </View>
      {message.modelUsage && (
        <Text style={[styles.usageText, { color: theme.textSecondary }]}>
          {message.modelUsage.input} in / {message.modelUsage.output} out tokens
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 12,
  },
  toolUseContainer: {
    gap: 4,
  },
  toolLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  toolInput: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  toolResultContainer: {
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  toolResultLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  toolResultText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  errorContainer: {
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
  },
  usageText: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
  },
});
