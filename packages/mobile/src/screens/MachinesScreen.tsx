/**
 * CC Remote - Machines Screen
 * Manage connected remote machines
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation, type NativeStackNavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useMachinesStore } from '../store/machines';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';
import type { Machine } from 'cc-remote-shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function MachinesScreen({ showAddModal }: { showAddModal?: boolean }): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { isDark } = useThemeStore();
  const {
    machines,
    isLoading,
    error,
    addMachine,
    removeMachine,
    getOnlineMachines,
  } = useMachinesStore();

  const [isAddModalVisible, setAddModalVisible] = useState(showAddModal || false);
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineHost, setNewMachineHost] = useState('');
  const [newMachinePort, setNewMachinePort] = useState('3000');

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
    if (showAddModal) {
      setAddModalVisible(true);
    }
  }, [showAddModal]);

  const handleAddMachine = () => {
    if (!newMachineName.trim() || !newMachineHost.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const newMachine: Machine = {
      id: `machine_${Date.now()}`,
      name: newMachineName.trim(),
      host: newMachineHost.trim(),
      port: parseInt(newMachinePort, 10) || 3000,
      created_at: new Date(),
    };

    addMachine(newMachine);
    setAddModalVisible(false);
    setNewMachineName('');
    setNewMachineHost('');
    setNewMachinePort('3000');
  };

  const handleRemoveMachine = (id: string, name: string) => {
    Alert.alert(
      'Remove Machine',
      `Are you sure you want to remove "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMachine(id),
        },
      ]
    );
  };

  const onlineMachines = getOnlineMachines();

  const renderMachine = ({ item }: { item: typeof machines[0] }) => (
    <TouchableOpacity
      style={[styles.machineCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() =>
        navigation.navigate('Projects', {
          machineId: item.id,
          machineName: item.name,
        })
      }
    >
      <View style={styles.machineHeader}>
        <View style={styles.machineInfo}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: item.isOnline ? colors.status.online : colors.status.offline },
            ]}
          />
          <Text style={[styles.machineName, { color: theme.text }]}>{item.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveMachine(item.id, item.name)}
        >
          <Text style={[styles.removeButtonText, { color: colors.error.light }]}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.machineDetails, { color: theme.textSecondary }]}>
        {item.host}:{item.port}
      </Text>
      {item.isOnline && (
        <View style={[styles.onlineBadge, { backgroundColor: colors.status.online + '20' }]}>
          <Text style={[styles.onlineBadgeText, { color: colors.status.online }]}>Online</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Machines</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {onlineMachines.length} of {machines.length} online
        </Text>
      </View>

      {/* Machines List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading machines...</Text>
        </View>
      ) : machines.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyEmoji]}>🖥️</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Machines</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add a remote machine to get started
          </Text>
        </View>
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          renderItem={renderMachine}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Add Machine Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.primary[600] }]}
        onPress={() => setAddModalVisible(true)}
      >
        <Text style={[styles.addButtonText, { color: '#fff' }]}>+ Add Machine</Text>
      </TouchableOpacity>

      {/* Add Machine Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={isAddModalVisible}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay.dark }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Machine</Text>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Machine Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="My Dev Machine"
              placeholderTextColor={theme.textSecondary}
              value={newMachineName}
              onChangeText={setNewMachineName}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Host</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="192.168.1.100"
              placeholderTextColor={theme.textSecondary}
              value={newMachineHost}
              onChangeText={setNewMachineHost}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Port</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="3000"
              placeholderTextColor={theme.textSecondary}
              value={newMachinePort}
              onChangeText={setNewMachinePort}
              keyboardType="number-pad"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, { backgroundColor: colors.primary[600] }]}
                onPress={handleAddMachine}
              >
                <Text style={styles.confirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  machineCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  machineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  machineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 18,
  },
  machineDetails: {
    fontSize: 14,
    marginLeft: 20,
    marginBottom: 8,
  },
  onlineBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 20,
  },
  onlineBadgeText: {
    fontSize: 12,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: colors.primary[600],
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
