import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { getCourses, getEventPlayers, getPlayerHandicap, getEventById, Course, Player } from '../src/services/apiService';

const API_URL = 'https://api.myclubgolf.com/api';

const HOLES_OPTIONS = [
  { value: '18h', label: '18 holes' },
  { value: '9f', label: '9 holes - Front' },
  { value: '9b', label: '9 holes - Back' },
];

export default function StartGameScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getEventById>>>(undefined);
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [selectedHoles, setSelectedHoles] = useState('18h');
  const [holesModalVisible, setHolesModalVisible] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer1, setSelectedPlayer1] = useState<Player | null>(null);
  const [hdcp1, setHdcp1] = useState('');
  const [pot1, setPot1] = useState(true);
  const [selectedPlayer2, setSelectedPlayer2] = useState<Player | null>(null);
  const [hdcp2, setHdcp2] = useState('');
  const [pot2, setPot2] = useState(true);
  const [selectedPlayer3, setSelectedPlayer3] = useState<Player | null>(null);
  const [hdcp3, setHdcp3] = useState('');
  const [pot3, setPot3] = useState(true);
  const [selectedPlayer4, setSelectedPlayer4] = useState<Player | null>(null);
  const [hdcp4, setHdcp4] = useState('');
  const [pot4, setPot4] = useState(true);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [activePlayerSlot, setActivePlayerSlot] = useState<1 | 2 | 3 | 4>(1);
  const [playerSearchText, setPlayerSearchText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [courseData, playerData, eventData] = await Promise.all([
          getCourses(),
          getEventPlayers(Number(eventId)),
          getEventById(Number(eventId)),
        ]);
        if (courseData.length > 0) {
          setCourses(courseData);
          // Default to the event's course, or York Golf Club like the PHP page
          const eventCourse = eventData?.courseName;
          const matchedCourse = courseData.find(c => c.name === eventCourse);
          setSelectedCourse(matchedCourse || courseData[0]);
        }
        if (playerData.length > 0) {
          setPlayers(playerData);
        }
        setEvent(eventData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [eventId]);

  return (
    <View style={styles.container}>
      <Header title="Start Game" />
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4a7c28" />
        </View>
      ) : (
        <>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle}>{event?.eventName || 'Loading...'}</Text>
            {selectedCourse && <Text style={styles.courseText}>{selectedCourse.name}</Text>}
          </View>

      <View style={styles.formSection}>
        {/* Course Selection */}
        <View style={styles.formRow}>
          <Text style={styles.label}>Course:</Text>
          <TouchableOpacity 
            style={styles.selectBox}
            onPress={() => setCourseModalVisible(true)}
          >
            <Text style={styles.selectText}>{selectedCourse?.name || 'Select Course'}</Text>
          </TouchableOpacity>
        </View>

        {/* Course Selection Modal */}
        <Modal
          visible={courseModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setCourseModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Course</Text>
              <FlatList
                data={courses}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.courseItem,
                      selectedCourse?.id === item.id && styles.selectedCourseItem
                    ]}
                    onPress={() => {
                      setSelectedCourse(item);
                      setCourseModalVisible(false);
                    }}
                  >
                    <Text style={styles.courseItemText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Holes Selection */}
        <View style={styles.formRow}>
          <Text style={styles.label}>Holes:</Text>
          <TouchableOpacity
            style={styles.selectBox}
            onPress={() => setHolesModalVisible(true)}
          >
            <Text style={styles.selectText}>{HOLES_OPTIONS.find(h => h.value === selectedHoles)?.label || '18 holes'}</Text>
          </TouchableOpacity>
        </View>

        {/* Holes Selection Modal */}
        <Modal
          visible={holesModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setHolesModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Holes</Text>
              {HOLES_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.courseItem,
                    selectedHoles === option.value && styles.selectedCourseItem
                  ]}
                  onPress={() => {
                    setSelectedHoles(option.value);
                    setHolesModalVisible(false);
                  }}
                >
                  <Text style={styles.courseItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* Player 1 */}
        <View style={styles.playerRow}>
          <Text style={styles.label}>Player 1:</Text>
          <TouchableOpacity
            style={styles.playerSelectBox}
            onPress={() => { setActivePlayerSlot(1); setPlayerSearchText(''); setPlayerModalVisible(true); }}>
            <Text style={styles.selectText}>{selectedPlayer1?.displayName || 'Choose Plyr'}</Text>
          </TouchableOpacity>
          <Text style={styles.hdcpLabel}>Hdcp:</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={[styles.inputText, styles.hdcInput]}
              value={hdcp1}
              onChangeText={setHdcp1}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.potContainer}>
            <Text style={styles.potLabel}>Pot: </Text>
            <TouchableOpacity onPress={() => setPot1(!pot1)}>
              <View style={[styles.checkbox, pot1 && styles.checkedCheckbox]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Player 2 */}
        <View style={styles.playerRow}>
          <Text style={styles.label}>Player 2:</Text>
          <TouchableOpacity
            style={styles.playerSelectBox}
            onPress={() => { setActivePlayerSlot(2); setPlayerSearchText(''); setPlayerModalVisible(true); }}>
            <Text style={styles.selectText}>{selectedPlayer2?.displayName || 'Choose Plyr'}</Text>
          </TouchableOpacity>
          <Text style={styles.hdcpLabel}>Hdcp:</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={[styles.inputText, styles.hdcInput]}
              value={hdcp2}
              onChangeText={setHdcp2}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.potContainer}>
            <Text style={styles.potLabel}>Pot: </Text>
            <TouchableOpacity onPress={() => setPot2(!pot2)}>
              <View style={[styles.checkbox, pot2 && styles.checkedCheckbox]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Player 3 */}
        <View style={styles.playerRow}>
          <Text style={styles.label}>Player 3:</Text>
          <TouchableOpacity
            style={styles.playerSelectBox}
            onPress={() => { setActivePlayerSlot(3); setPlayerSearchText(''); setPlayerModalVisible(true); }}>
            <Text style={styles.selectText}>{selectedPlayer3?.displayName || 'Choose Plyr'}</Text>
          </TouchableOpacity>
          <Text style={styles.hdcpLabel}>Hdcp:</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={[styles.inputText, styles.hdcInput]}
              value={hdcp3}
              onChangeText={setHdcp3}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.potContainer}>
            <Text style={styles.potLabel}>Pot: </Text>
            <TouchableOpacity onPress={() => setPot3(!pot3)}>
              <View style={[styles.checkbox, pot3 && styles.checkedCheckbox]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Player 4 */}
        <View style={styles.playerRow}>
          <Text style={styles.label}>Player 4:</Text>
          <TouchableOpacity
            style={styles.playerSelectBox}
            onPress={() => { setActivePlayerSlot(4); setPlayerSearchText(''); setPlayerModalVisible(true); }}>
            <Text style={styles.selectText}>{selectedPlayer4?.displayName || 'Choose Plyr'}</Text>
          </TouchableOpacity>
          <Text style={styles.hdcpLabel}>Hdcp:</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={[styles.inputText, styles.hdcInput]}
              value={hdcp4}
              onChangeText={setHdcp4}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.potContainer}>
            <Text style={styles.potLabel}>Pot: </Text>
            <TouchableOpacity onPress={() => setPot4(!pot4)}>
              <View style={[styles.checkbox, pot4 && styles.checkedCheckbox]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Player Selection Modal */}
        <Modal
          visible={playerModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setPlayerModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Player {activePlayerSlot}</Text>
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
                renderItem={({ item }) => {
                  const currentSelected =
                    activePlayerSlot === 1 ? selectedPlayer1 :
                    activePlayerSlot === 2 ? selectedPlayer2 :
                    activePlayerSlot === 3 ? selectedPlayer3 : selectedPlayer4;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.courseItem,
                        currentSelected?.id === item.id && styles.selectedCourseItem
                      ]}
                      onPress={async () => {
                        const hdcp = await getPlayerHandicap(item.id);
                        if (activePlayerSlot === 1) { setSelectedPlayer1(item); setHdcp1(hdcp); }
                        else if (activePlayerSlot === 2) { setSelectedPlayer2(item); setHdcp2(hdcp); }
                        else if (activePlayerSlot === 3) { setSelectedPlayer3(item); setHdcp3(hdcp); }
                        else { setSelectedPlayer4(item); setHdcp4(hdcp); }
                        setPlayerModalVisible(false);
                      }}
                    >
                      <Text style={styles.courseItemText}>{item.displayName}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>

        {/* Start Game Button */}
        <TouchableOpacity 
          style={styles.startButton}
          onPress={async () => {
            try {
              const response = await fetch(`${API_URL}/game`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: Number(eventId), courseId: Number(selectedCourse?.id) }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Failed to get or create game');

              router.push({
                pathname: '/game',
                params: {
                  eventId,
                  courseId: selectedCourse?.id ?? '',
                  courseName: selectedCourse?.name ?? '',
                  holes: selectedHoles,
                  gameId: String(data.gameId),
                  pid1: selectedPlayer1?.id ?? '',
                  name1: selectedPlayer1?.displayName ?? '',
                  hdcp1,
                  pot1: String(pot1),
                  pid2: selectedPlayer2?.id ?? '',
                  name2: selectedPlayer2?.displayName ?? '',
                  hdcp2,
                  pot2: String(pot2),
                  pid3: selectedPlayer3?.id ?? '',
                  name3: selectedPlayer3?.displayName ?? '',
                  hdcp3,
                  pot3: String(pot3),
                  pid4: selectedPlayer4?.id ?? '',
                  name4: selectedPlayer4?.displayName ?? '',
                  hdcp4,
                  pot4: String(pot4),
                },
              });
            } catch (e) {
              console.error('Failed to get or create game:', e);
            }
          }}
        >
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.homeButton}
          onPress={() => router.push(`/menu?eventId=${eventId}`)}
        >
          <Text style={styles.homeButtonText}>🏠 Home</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.push('/search_event')}
      >
        <Text style={styles.backButtonText}>← Back to Search</Text>
      </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  eventInfo: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d5016',
    marginBottom: 8,
  },
  courseText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  formSection: {
    padding: 20,
    gap: 16,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
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
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    width: 80,
  },
  hdcpLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    width: 50,
  },
  selectBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  playerSelectBox: {
    flex: 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  selectText: {
    fontSize: 14,
    color: '#333',
  },
  inputBox: {
    width: 50,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  inputText: {
    fontSize: 14,
    color: '#333',
  },
  hdcInput: {
    textAlign: 'center',
  },
  potContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  potLabel: {
    fontSize: 14,
    color: '#333',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  checkedCheckbox: {
    backgroundColor: '#4a7c28',
    borderColor: '#4a7c28',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#4a7c28',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  homeButton: {
    backgroundColor: '#2d5016',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  homeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 'auto',
    padding: 20,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#4a7c28',
    fontWeight: '500',
  },
});