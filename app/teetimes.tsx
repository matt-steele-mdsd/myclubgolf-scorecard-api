import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, FlatList, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { getEventById, getEventPlayers, Player, TeeTimeRow, getTeeTimes, getPlayerStatus, savePlayerStatus } from '../src/services/apiService';

/**
 * Format a time string like "08:30:00" to "8:30 am".
 */
function formatTime(raw: string): string {
  if (!raw || raw === '00:00:00') return '';
  const [h, m] = raw.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/**
 * Format a date string like "2026-06-27" or "2026-06-27T04:00:00.000Z" to "Saturday, June 27".
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Tee Times screen — mirrors the PHP teetimes.php layout.
 */
export default function TeeTimesScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getEventById>>>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(0);
  const [teeTimes, setTeeTimes] = useState<TeeTimeRow[]>([]);
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, {
    inPlayers: string[];
    early: string[];
    late: string[];
    other: string[];
    out: string[];
  }>>({});
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [playerSearchText, setPlayerSearchText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [evt, pls, tt] = await Promise.all([
          getEventById(Number(eventId)),
          getEventPlayers(Number(eventId)),
          getTeeTimes(Number(eventId)),
        ]);

        setEvent(evt);
        setPlayers(pls);
        setTeeTimes(tt);

        // Fetch player status for each tee date
        const statuses: Record<string, {
          inPlayers: string[];
          early: string[];
          late: string[];
          other: string[];
          out: string[];
        }> = {};
        await Promise.all(
          tt.map(async (row) => {
            // Extract just the date portion from ISO string (e.g. "2026-06-26T04:00:00.000Z" → "2026-06-26")
            const teeDate = row.TeeDate.split('T')[0];
            const statusList = await getPlayerStatus(Number(eventId), teeDate);
            const inPlayers: string[] = [];
            const early: string[] = [];
            const late: string[] = [];
            const other: string[] = [];
            const outPlayers: string[] = [];

            for (const ps of statusList) {
              const name = `${ps.LastName}, ${ps.FirstName}`;
              if (ps.Status === 'I') {
                inPlayers.push(name);
              } else if (ps.Status === 'E') {
                early.push(name);
              } else if (ps.Status === 'L') {
                late.push(name);
              } else if (ps.Status === 'X') {
                other.push(name);
              } else if (ps.Status === 'O') {
                outPlayers.push(name);
              }
            }

            statuses[teeDate] = { inPlayers, early, late, other, out: outPlayers };
          })
        );

        setPlayerStatuses(statuses);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load tee times:', err);
        setLoading(false);
      }
    })();
  }, [eventId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Tee Times" />
        <ActivityIndicator size="large" color="#2d5016" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Header title="Tee Times" />
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/search_event')}>
          <Text style={styles.backButtonText}>← Back to Search</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleStatusPress = async (status: 'I' | 'E' | 'L' | 'X' | 'O', teeDate: string) => {
    if (!selectedPlayerId) {
      Alert.alert('Select Player', 'Please select a player first.');
      return;
    }
    const success = await savePlayerStatus(Number(eventId), selectedPlayerId, teeDate, status);
    if (success) {
      // Refresh the player statuses to show updated data
      setLoading(true);
      try {
        const tt = await getTeeTimes(Number(eventId));
        const statuses: Record<string, {
          inPlayers: string[];
          early: string[];
          late: string[];
          other: string[];
          out: string[];
        }> = {};
        await Promise.all(
          tt.map(async (row) => {
            const teeDateKey = row.TeeDate.split('T')[0];
            const statusList = await getPlayerStatus(Number(eventId), teeDateKey);
            const inPlayers: string[] = [];
            const early: string[] = [];
            const late: string[] = [];
            const other: string[] = [];
            const outPlayers: string[] = [];

            for (const ps of statusList) {
              const name = `${ps.LastName}, ${ps.FirstName}`;
              if (ps.Status === 'I') inPlayers.push(name);
              else if (ps.Status === 'E') early.push(name);
              else if (ps.Status === 'L') late.push(name);
              else if (ps.Status === 'X') other.push(name);
              else if (ps.Status === 'O') outPlayers.push(name);
            }

            statuses[teeDateKey] = { inPlayers, early, late, other, out: outPlayers };
          })
        );
        setPlayerStatuses(statuses);
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert('Error', 'Failed to save status.');
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <View style={styles.container}>
      <Header title="Tee Times" />

      {/* ── Event info banner ── */}
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{event.eventName}</Text>
        <Text style={styles.courseText}>{event.courseName}</Text>
      </View>

      {/* ── Player selector row (mirrors PHP dropdown) ── */}
      <View style={styles.playerRow}>
        <Text style={styles.playerLabel}>Player:</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.selectText}>
            {selectedPlayerId === 0
              ? '-- select player --'
              : players.find((p) => p.id === selectedPlayerId)?.displayName ?? '-- select player --'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Player picker modal (mirrors startgame player selection) ── */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Player</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              value={playerSearchText}
              onChangeText={(text) => setPlayerSearchText(text)}
              autoFocus
            />
            <FlatList
              data={players.filter(p =>
                p.displayName.toLowerCase().includes(playerSearchText.toLowerCase())
              )}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.courseItem,
                    selectedPlayerId === item.id && styles.selectedCourseItem
                  ]}
                  onPress={() => {
                    setSelectedPlayerId(item.id);
                    setShowPicker(false);
                  }}
                >
                  <Text style={styles.courseItemText}>
                    {item.displayName || `${item.lastName}, ${item.firstName}` || `Player #${item.id}`}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Tee date cards ── */}
      {teeTimes.map((row, index) => {
        const times = [row.Time1, row.Time2, row.Time3]
          .filter(Boolean);
        // Extract just the date portion for status lookup (e.g. "2026-06-26T04:00:00.000Z" → "2026-06-26")
        const teeDate = row.TeeDate.split('T')[0];

        return (
          <View key={index} style={styles.teeCard}>
            <Text style={styles.dateTitle}>{formatDate(row.TeeDate)}</Text>

            {/* Tee times */}
            <View style={styles.timesRow}>
              {times.map((t, i) => (
                <Text key={i} style={styles.timeText}>{formatTime(t)}</Text>
              ))}
            </View>

            {/* Status buttons */}
            <View style={styles.statusButtonRow}>
              <TouchableOpacity
                style={[styles.statusButton, styles.inButton]}
                onPress={() => handleStatusPress('I', teeDate)}
              >
                <Text style={styles.statusButtonText}>In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.earlyButton]}
                onPress={() => handleStatusPress('E', teeDate)}
              >
                <Text style={styles.statusButtonText}>Early</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.lateButton]}
                onPress={() => handleStatusPress('L', teeDate)}
              >
                <Text style={styles.statusButtonText}>Late</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.otherButton]}
                onPress={() => handleStatusPress('X', teeDate)}
              >
                <Text style={styles.statusButtonText}>Other</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.outButton]}
                onPress={() => handleStatusPress('O', teeDate)}
              >
                <Text style={styles.statusButtonText}>Out</Text>
              </TouchableOpacity>
            </View>

            {/* Player status columns */}
            {(() => {
              const status = playerStatuses[teeDate];
              if (!status || (status.inPlayers.length === 0 && status.early.length === 0 && 
                  status.late.length === 0 && status.other.length === 0)) return null;

              const maxLen = Math.max(
                status.inPlayers.length, status.early.length, status.late.length,
                status.other.length
              );

              return (
                <ScrollView style={styles.statusScroll} nestedScrollEnabled>
                  <View style={styles.statusHeaderRow}>
                    <Text style={[styles.statusColSmall, styles.bold]}>In</Text>
                    <Text style={[styles.statusColSmall, styles.bold]}>Early</Text>
                    <Text style={[styles.statusColSmall, styles.bold]}>Late</Text>
                    <Text style={[styles.statusColSmall, styles.bold]}>Other</Text>
                  </View>

                  {Array.from({ length: maxLen }).map((_, i) => (
                    <View key={i} style={styles.statusRow}>
                      <Text style={styles.statusColSmall}>{status.inPlayers[i] ?? ''}</Text>
                      <Text style={styles.statusColSmall}>{status.early[i] ?? ''}</Text>
                      <Text style={styles.statusColSmall}>{status.late[i] ?? ''}</Text>
                      <Text style={styles.statusColSmall}>{status.other[i] ?? ''}</Text>
                    </View>
                  ))}
                </ScrollView>
              );
            })()}

            {/* Random Groups button — shown only for today */}
            {(() => {
              const teeDateObj = new Date(row.TeeDate + 'T12:00:00');
              return (
                today.getTime() === teeDateObj.getTime() && (
                  <TouchableOpacity style={styles.randomGroupsButton}>
                    <Text style={styles.randomGroupsButtonText}>Random Groups</Text>
                  </TouchableOpacity>
                )
              );
            })()}
          </View>
        );
      })}

      {/* ── Footer: Home button ── */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.homeButton} onPress={() => router.push(`/menu?eventId=${eventId}`)}>
          <Text style={styles.homeButtonText}>🏠 Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  eventInfo: {
    padding: 16,
    backgroundColor: '#2d5016',
    alignItems: 'center',
  },
  eventTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  courseText: {
    color: '#ddd',
    fontSize: 14,
    marginTop: 4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  playerLabel: {
    fontWeight: 'bold',
    marginRight: 8,
  },
  selectBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  selectText: {
    fontSize: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  courseItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedCourseItem: {
    backgroundColor: '#e8f5e9',
  },
  courseItemText: {
    fontSize: 16,
    color: '#333',
  },
  teeCard: {
    margin: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  timesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: '#333',
  },
  statusButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  statusButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  inButton: {
    backgroundColor: '#d4edda',
  },
  earlyButton: {
    backgroundColor: '#cce5ff',
  },
  lateButton: {
    backgroundColor: '#fff3cd',
  },
  otherButton: {
    backgroundColor: '#e2d9f3',
  },
  outButton: {
    backgroundColor: '#f8d7da',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    paddingBottom: 4,
    marginBottom: 4,
  },
  statusScroll: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 4,
  },
  statusRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  statusColSmall: {
    flex: 1,
    fontSize: 11,
    color: '#555',
    paddingVertical: 2,
  },
  bold: {
    fontWeight: 'bold',
  },
  randomGroupsButton: {
    marginTop: 8,
    backgroundColor: '#2d5016',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  randomGroupsButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  footer: {
    padding: 12,
    alignItems: 'center',
  },
  homeButton: {
    backgroundColor: '#2d5016',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  homeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  backButton: {
    margin: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#2d5016',
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '60%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  playerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  playerItemText: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 10,
    backgroundColor: '#dc3545',
    paddingVertical: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
