/**
 * CC Remote - Chat Input Component
 * Text input with auto-grow textarea and send button
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Type a message...' }: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    background: isDark ? colors.background.cardDark : colors.background.card,
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    border: isDark ? colors.border.dark : colors.border.light,
    placeholder: isDark ? colors.text.darkLight : colors.text.light,
  };

  const [text, setText] = useState('');
  const [height, setHeight] = useState(40);
  const inputRef = useRef<TextInput>(null);

  const minHeight = 40;
  const maxHeight = 120;

  const handleSend = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setText('');
      setHeight(minHeight);
      Keyboard.dismiss();
    }
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
      <View style={[styles.inputWrapper, { backgroundColor: theme.border }]}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: theme.text,
              height: Math.max(minHeight, Math.min(height, maxHeight)),
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          value={text}
          onChangeText={setText}
          onContentSizeChange={(event) => {
            const newHeight = event.nativeEvent.contentSize.height;
            setHeight(newHeight);
          }}
          multiline
          maxLength={4000}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={canSend ? handleSend : undefined}
          blurOnSubmit={false}
        />
      </View>
      <TouchableOpacity
        style={[
          styles.sendButton,
          {
            backgroundColor: canSend ? colors.primary[600] : colors.text.light,
            opacity: canSend ? 1 : 0.5,
          },
        ]}
        onPress={handleSend}
        disabled={!canSend}
      >
        <Text style={styles.sendButtonText}>Send</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
