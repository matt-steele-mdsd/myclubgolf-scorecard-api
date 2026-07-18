import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { getEventById, getLatestGame, getLeaderboard, LatestGameInfo, LeaderboardRow } from '../src/services/apiService';

/**
 * View mode: leaderboard or scorecard (mirrors PHP toggle).
 */
type ViewMode = 'leaderboard' | 'scorecard';

/**
 * Score type for leaderboard: Gross or Net.
 */
type ScoreType = 'G' | 'N';

export default function LeaderboardScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getEventById>>>(undefined);
  const [latestGame, setLatestGame] = useState<LatestGameInfo | undefined>(undefined);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('leaderboard');
  const [scoreType, setScoreType] = useState<ScoreType>('G');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const evt = await getEventById(Number(eventId));
        setEvent(evt);

        if (!evt) return;

        // Get the latest game for this event (mirrors PHP query in showleaderboard.php)
        const gameInfo = await getLatestGame(Number(eventId));
        setLatestGame(gameInfo);

        if (gameInfo) {
          // Load leaderboard data — default to Gross, same as PHP's $(document).ready() call
          const rows = await getLeaderboard(gameInfo.gameId, 'G');
          setLeaderboardData(rows);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
        setLoading(false);
      }
    })();
  }, [eventId]);

  /** Reload leaderboard when score type changes. */
  useEffect(() => {
    if (!latestGame) return;
    (async () => {
      const rows = await getLeaderboard(latestGame.gameId, scoreType);
      setLeaderboardData(rows);
    })();
  }, [scoreType]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Leaderboard" />
        <ActivityIndicator size="large" color="#2d5016" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Header title="Leaderboard" />
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/search_event')}>
          <Text style={styles.backButtonText}>← Back to Search</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Leaderboard" />

      {/* ── Event info banner ── */}
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{event.eventName}</Text>
        {latestGame && (
          <Text style={styles.courseText}>
            {latestGame.courseName} — {latestGame.gameDate}
          </Text>
        )}
      </View>

      {/* ── View toggle buttons (mirrors PHP footer images) ── */}
      <View style={styles.viewToggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'scorecard' && styles.toggleButtonActive]}
          onPress={() => setViewMode('scorecard')}
        >
          <Text style={styles.toggleButtonText}>📋 ScoreCard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'leaderboard' && styles.toggleButtonActive]}
          onPress={() => setViewMode('leaderboard')}
        >
          <Text style={styles.toggleButtonText}>🏆 Leaderboard</Text>
        </TouchableOpacity>
      </View>

      {/* ── Score type buttons (Gross / Net) — mirrors PHP buttons ── */}
      {viewMode === 'leaderboard' && (
        <View style={styles.scoreTypeRow}>
          <TouchableOpacity
            style={[styles.scoreTypeButton, scoreType === 'G' && styles.scoreTypeButtonActive]}
            onPress={() => setScoreType('G')}
          >
            <Text style={styles.scoreTypeButtonText}>Gross</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scoreTypeButton, scoreType === 'N' && styles.scoreTypeButtonActive]}
            onPress={() => setScoreType('N')}
          >
            <Text style={styles.scoreTypeButtonText}>Net</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Leaderboard table (mirrors PHP leaderboard.php output) ── */}
      {viewMode === 'leaderboard' && (
        <View style={styles.tableContainer}>
          {/* Table header */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colName, styles.headerCell]}>Name</Text>
            <Text style={[styles.colThru, styles.headerCell]}>Thru</Text>
            <Text style={[styles.colScore, styles.headerCell]}>Score</Text>
          </View>

          {/* Table rows */}
          {leaderboardData.length === 0 ? (
            <Text style={styles.emptyText}>No scores recorded yet.</Text>
          ) : (
            <FlatList
              data={leaderboardData}
              keyExtractor={(item, index) => `${index}`}
              renderItem={({ item }) => (
                <View style={styles.tableRow}>
                  <Text style={[styles.colName, styles.dataCell]}>{item.name}</Text>
                  <Text style={[styles.colThru, styles.dataCell]}>{String(item.thru)}</Text>
                  <Text style={[styles.colScore, styles.dataCell]}>
                    {item.score === 'Even' ? (
                      <Text style={styles.evenScore}>E</Text>
                    ) : item.score.startsWith('+') ? (
                      <Text style={styles.positiveScore}>{item.score}</Text>
                    ) : (
                      <Text style={styles.negativeScore}>{item.score}</Text>
                    )}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ── ScoreCard view placeholder ── */}
      {viewMode === 'scorecard' && (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderTitle}>ScoreCard View</Text>
          <View style={styles.scoreTypeRow}>
            <TouchableOpacity style={styles.scoreTypeButton} onPress={() => {}}>
              <Text style={styles.scoreTypeButtonText}>Gross</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scoreTypeButton} onPress={() => {}}>
              <Text style={styles.scoreTypeButtonText}>Net</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scoreTypeButton} onPress={() => {}}>
              <Text style={styles.scoreTypeButtonText}>Skins</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.placeholderText}>ScoreCard view coming soon.</Text>
        </View>
      )}

      {/* ── Footer: Home button (mirrors PHP home icon) ── */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.homeButton} onPress={() => router.push(`/menu?eventId=${eventId}`)}>
          <Text style={styles.homeButtonText}>🏠 Home</Text>
        </TouchableOpacity>
      </View>

      {/* ── Back to Search ── */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/search_event')}>
        <Text style={styles.backButtonText}>← Back to Search</Text>
      </TouchableOpacity>
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
  viewToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
    gap: 12,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#999',
    backgroundColor: '#fff',
  },
  toggleButtonActive: {
    backgroundColor: '#2d5016',
    borderColor: '#2d5016',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  scoreTypeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  scoreTypeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#999',
    backgroundColor: '#fff',
  },
  scoreTypeButtonActive: {
    backgroundColor: '#2d5016',
    borderColor: '#2d5016',
  },
  scoreTypeButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  tableContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#e8e8d0',
  },
  headerCell: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  dataCell: {
    fontSize: 13,
  },
  colName: {
    flex: 2,
  },
  colThru: {
    flex: 0.5,
    textAlign: 'center',
  },
  colScore: {
    flex: 0.7,
    textAlign: 'center',
  },
  evenScore: {
    color: '#2d5016',
    fontWeight: 'bold',
  },
  positiveScore: {
    color: '#c0392b',
    fontWeight: 'bold',
  },
  negativeScore: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    padding: 24,
    fontSize: 15,
    color: '#888',
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  placeholderText: {
    marginTop: 16,
    color: '#888',
    fontSize: 14,
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
});
