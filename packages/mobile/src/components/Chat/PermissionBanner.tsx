/**
 * CC Remote - Permission Banner Component
 * Displays permission request from assistant with approve/reject buttons
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';

interface PermissionRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
}

interface Props {
  permission: PermissionRequest;
  onApprove: (message?: string) => void;
  onReject: (message?: string) => void;
}

export function PermissionBanner({ permission, onApprove, onReject }: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    background: isDark ? colors.background.cardDark : colors.background.card,
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    border: isDark ? colors.border.dark : colors.border.light,
  };

  const formatInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.warning.light + '15', borderColor: colors.warning.dark }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: colors.warning.light + '30' }]}>
          <Text style={styles.icon}>🔐</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.warning.dark }]}>Permission Required</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            The assistant wants to use a tool
          </Text>
        </View>
      </View>

      <View style={[styles.details, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Tool</Text>
        <Text style={[styles.toolName, { color: colors.primary[600] }]}>{permission.toolName}</Text>

        <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Input</Text>
        <ScrollView style={styles.inputScroll} horizontal>
          <Text style={[styles.inputText, { color: theme.text }]}>
            {formatInput(permission.toolInput)}
          </Text>
        </ScrollView>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.rejectButton, { borderColor: colors.error.light }]}
          onPress={() => onReject()}
        >
          <Text style={[styles.buttonText, { color: colors.error.light }]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.approveButton, { backgroundColor: colors.success.light }]}
          onPress={() => onApprove()}
        >
          <Text style={[styles.buttonText, styles.approveButtonText]}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  details: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  toolName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  inputScroll: {
    marginTop: 4,
  },
  inputText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  approveButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  approveButtonText: {
    color: '#ffffff',
  },
});
