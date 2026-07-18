import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { getCourses } from '../src/services/apiService';

const API_URL = 'https://api.myclubgolf.com/api';

interface CourseHole {
  holeNum: number;
  par: number;
  hdcp: number;
}

/** Calculate net score the same way the PHP does. */
function calcNet(gross: number, playerHdcp: number, _holePar: number, holeHdcp: number): number {
  let net = gross;
  if (playerHdcp >= holeHdcp) net--;
  if ((playerHdcp - 18) >= holeHdcp) net--;
  if ((playerHdcp - 36) >= holeHdcp) net--;
  return net;
}

export default function GameScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  // Parse params
  const courseId = Number(params.courseId);
  const gameId = Number(params.gameId);
  const side = (params.holes as string) || '18h';
  const hdcp1 = Number(params.hdcp1) || 0;
  const hdcp2 = Number(params.hdcp2) || 0;
  const hdcp3 = Number(params.hdcp3) || 0;
  const hdcp4 = Number(params.hdcp4) || 0;

  // Determine hole range based on side
  let startHole = 1, endHole = 18;
  if (side === '9f') { startHole = 1; endHole = 9; }
  else if (side === '9b') { startHole = 10; endHole = 18; }

  // State
  const [courseDetails, setCourseDetails] = useState<CourseHole[]>([]);
  const [currentHole, setCurrentHole] = useState(startHole);
  const [loading, setLoading] = useState(true);
  const [showFrontNineSummary, setShowFrontNineSummary] = useState(false);

  // Gross scores per player keyed by hole number (default to par)
  const [scores1, setScores1] = useState<Record<number, number>>({});
  const [scores2, setScores2] = useState<Record<number, number>>({});
  const [scores3, setScores3] = useState<Record<number, number>>({});
  const [scores4, setScores4] = useState<Record<number, number>>({});

  // Load course details on mount
  useEffect(() => {
    async function loadCourse() {
      try {
        const [rows] = await Promise.all([
          fetch(`${API_URL}/courses/${courseId}/details`).then(r => r.json()),
        ]);
        setCourseDetails(rows);

        // Load existing scores for each player if they exist in the database
        const eventIdStr = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId || '0';
        const eventIdNum = parseInt(eventIdStr);
        
        // Player 1 scores
        if (params.pid1) {
          try {
            const response = await fetch(`${API_URL}/scores/${eventIdNum}/${params.pid1}`);
            if (response.ok) {
              const savedScores = await response.json();
              setScores1(savedScores);
            }
          } catch (e) {
            console.error('Failed to load player 1 scores:', e);
          }
        }

        // Player 2 scores
        if (params.pid2) {
          try {
            const response = await fetch(`${API_URL}/scores/${eventIdNum}/${params.pid2}`);
            if (response.ok) {
              const savedScores = await response.json();
              setScores2(savedScores);
            }
          } catch (e) {
            console.error('Failed to load player 2 scores:', e);
          }
        }

        // Player 3 scores
        if (params.pid3) {
          try {
            const response = await fetch(`${API_URL}/scores/${eventIdNum}/${params.pid3}`);
            if (response.ok) {
              const savedScores = await response.json();
              setScores3(savedScores);
            }
          } catch (e) {
            console.error('Failed to load player 3 scores:', e);
          }
        }

        // Player 4 scores
        if (params.pid4) {
          try {
            const response = await fetch(`${API_URL}/scores/${eventIdNum}/${params.pid4}`);
            if (response.ok) {
              const savedScores = await response.json();
              setScores4(savedScores);
            }
          } catch (e) {
            console.error('Failed to load player 4 scores:', e);
          }
        }

      } catch (e) {
        console.error('Failed to load course details:', e);
      } finally {
        setLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  // Get current hole info
  const holeInfo = courseDetails.find(h => h.holeNum === currentHole) || { par: 4, hdcp: 12 };

  // Helper to get/set score for a player on the current hole
  function getScore(scores: Record<number, number>): number {
    return scores[currentHole] ?? holeInfo.par;
  }
  function setScore(scores: Record<number, number>, setScores: React.Dispatch<React.SetStateAction<Record<number, number>>>, value: number) {
    setScores({ ...scores, [currentHole]: value });
  }

  // Build active players list
  type PlayerSlot = { name: string; hdcp: number };
  const playerSlots: (PlayerSlot & { scores: Record<number, number>; setScores: React.Dispatch<React.SetStateAction<Record<number, number>>> })[] = [];
  if (params.name1) playerSlots.push({ name: params.name1 as string, hdcp: hdcp1, scores: scores1, setScores: setScores1 });
  if (params.name2) playerSlots.push({ name: params.name2 as string, hdcp: hdcp2, scores: scores2, setScores: setScores2 });
  if (params.name3) playerSlots.push({ name: params.name3 as string, hdcp: hdcp3, scores: scores3, setScores: setScores3 });
  if (params.name4) playerSlots.push({ name: params.name4 as string, hdcp: hdcp4, scores: scores4, setScores: setScores4 });

  // Save scores for every active player to the database
  async function saveScoresToDatabase() {
    const eventIdNum = parseInt((Array.isArray(params.eventId) ? params.eventId[0] : params.eventId) || '0');

    function buildPayload(playerId: string, scores: Record<number, number>, hdcp: number) {
      const entries: any[] = [];
      for (const [holeNumber, grossScore] of Object.entries(scores)) {
        const holeData = courseDetails.find(h => h.holeNum === parseInt(holeNumber));
        if (!holeData) continue;

        let net = grossScore;
        let skins = grossScore;
        if (hdcp >= holeData.hdcp) {
          if (holeData.par === 3) {
            skins = grossScore - 0.5;
          } else {
            net--;
            skins = net;
          }
        }
        if ((hdcp - 18) >= holeData.hdcp) { net--; }
        if ((hdcp - 36) >= holeData.hdcp) { net--; }

        entries.push({
          gameId,
          playerId: parseInt(playerId),
          courseId,
          holeNumber: parseInt(holeNumber),
          grossScore,
          netScore: net,
          skinsScore: skins,
        });
      }
      return { gameId, playerId: parseInt(playerId), scores: entries };
    }

    // Player 1
    if (params.pid1) {
      try {
        const response = await fetch(`${API_URL}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(params.pid1 as string, scores1, hdcp1)),
        });
        if (!response.ok) console.error('Failed to save player 1 scores:', await response.text());
      } catch (e) { console.error('Error saving player 1 scores:', e); }
    }

    // Player 2
    if (params.pid2) {
      try {
        const response = await fetch(`${API_URL}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(params.pid2 as string, scores2, hdcp2)),
        });
        if (!response.ok) console.error('Failed to save player 2 scores:', await response.text());
      } catch (e) { console.error('Error saving player 2 scores:', e); }
    }

    // Player 3
    if (params.pid3) {
      try {
        const response = await fetch(`${API_URL}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(params.pid3 as string, scores3, hdcp3)),
        });
        if (!response.ok) console.error('Failed to save player 3 scores:', await response.text());
      } catch (e) { console.error('Error saving player 3 scores:', e); }
    }

    // Player 4
    if (params.pid4) {
      try {
        const response = await fetch(`${API_URL}/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(params.pid4 as string, scores4, hdcp4)),
        });
        if (!response.ok) console.error('Failed to save player 4 scores:', await response.text());
      } catch (e) { console.error('Error saving player 4 scores:', e); }
    }
  }

  // Navigation handlers
  function goNextHole() {
    if (showFrontNineSummary) {
      setShowFrontNineSummary(false);
      setCurrentHole(10);
    } else if (currentHole === 9 && side === '18h') {
      setShowFrontNineSummary(true);
    } else if (currentHole < endHole || currentHole === endHole) {
      // Save scores before advancing to next hole or showing summary
      saveScoresToDatabase();
      // Advance past the final hole to show summary
      setCurrentHole(currentHole + 1);
    }
  }
  function goPrevHole() {
    if (showFrontNineSummary) {
      setShowFrontNineSummary(false);
    } else if (currentHole > startHole) {
      // Save scores before going back
      saveScoresToDatabase();
      setCurrentHole(currentHole - 1);
    }
  }

  // Calculate running totals for completed holes
  function calcTotals(scores: Record<number, number>, playerHdcp: number, holeRange: [number, number]) {
    let grossTotal = 0;
    let netTotal = 0;
    for (let h = holeRange[0]; h <= holeRange[1]; h++) {
      const holeData = courseDetails.find(x => x.holeNum === h);
      if (!holeData) continue;
      const gross = scores[h] ?? holeData.par;
      grossTotal += gross;
      netTotal += calcNet(gross, playerHdcp, holeData.par, holeData.hdcp);
    }
    return { gross: grossTotal, net: netTotal };
  }

  // Determine if we should show a summary (after completing front 9 or all 18)
  const showFullRoundSummary = side === '18h' && currentHole > endHole || side !== '18h' && currentHole > endHole;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a7c28" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hole header — mirrors PHP: "Hole 1 - Par 4 - Hdcp 12" */}
      {!showFrontNineSummary && !showFullRoundSummary && (
        <Header title={`Hole ${currentHole} - Par ${holeInfo.par} - Hdcp ${holeInfo.hdcp}`} />
      )}

      {/* Column headers row */}
      {!showFrontNineSummary && !showFullRoundSummary && (
        <View style={styles.columnHeaderRow}>
          <View style={styles.nameCol} />
          <Text style={styles.colLabel}>Gross</Text>
          <View style={styles.btnPlaceholder} />
          <View style={styles.btnPlaceholder} />
          <Text style={styles.colLabel}>Net</Text>
        </View>
      )}

      {/* Player rows */}
      {!showFrontNineSummary && !showFullRoundSummary && playerSlots.map((p, i) => {
        const gross = getScore(p.scores);
        const net = calcNet(gross, p.hdcp, holeInfo.par, holeInfo.hdcp);
        return (
          <View key={i} style={styles.playerRow}>
            <Text style={styles.playerName}>{p.name}</Text>
            <Text style={[styles.scoreValue, gross === holeInfo.par ? styles.onPar : gross < holeInfo.par ? styles.underPar : styles.overPar]}>
              {gross}
            </Text>
            <TouchableOpacity style={styles.minusBtn} onPress={() => setScore(p.scores, p.setScores, gross - 1)}>
              <Text style={styles.btnText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.plusBtn} onPress={() => setScore(p.scores, p.setScores, gross + 1)}>
              <Text style={styles.btnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.netValue}>{net}</Text>
          </View>
        );
      })}

      {/* Front 9 summary — shown after completing hole 9 on an 18-hole round */}
      {showFrontNineSummary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Front 9 Scores</Text>
          {playerSlots.map((p, i) => {
            const totals = calcTotals(p.scores, p.hdcp, [1, 9]);
            return (
              <View key={`front-${i}`} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{p.name}</Text>
                <Text style={styles.summaryLabel}>Gross: {totals.gross}</Text>
                <Text style={styles.summaryLabel}>Net: {totals.net}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Back 9 summary — shown after completing all 18 holes */}
      {showFullRoundSummary && side === '18h' && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Back 9 Scores</Text>
          {playerSlots.map((p, i) => {
            const totals = calcTotals(p.scores, p.hdcp, [10, 18]);
            return (
              <View key={`back-${i}`} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{p.name}</Text>
                <Text style={styles.summaryLabel}>Gross: {totals.gross}</Text>
                <Text style={styles.summaryLabel}>Net: {totals.net}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Overall summary — shown after completing all 18 holes */}
      {showFullRoundSummary && side === '18h' && (
        <View style={[styles.summaryCard, styles.overallCard]}>
          <Text style={styles.summaryTitle}>Overall Scores</Text>
          {playerSlots.map((p, i) => {
            const totals = calcTotals(p.scores, p.hdcp, [1, 18]);
            return (
              <View key={`overall-${i}`} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{p.name}</Text>
                <Text style={styles.summaryLabel}>Gross: {totals.gross}</Text>
                <Text style={styles.summaryLabel}>Net: {totals.net}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* 9-hole summary — shown after completing a front-9-only or back-9-only round */}
      {showFullRoundSummary && side !== '18h' && (
        <View style={[styles.summaryCard, styles.overallCard]}>
          <Text style={styles.summaryTitle}>{side === '9f' ? 'Front 9 Scores' : 'Back 9 Scores'}</Text>
          {playerSlots.map((p, i) => {
            const totals = calcTotals(p.scores, p.hdcp, [startHole, endHole]);
            return (
              <View key={`nine-${i}`} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{p.name}</Text>
                <Text style={styles.summaryLabel}>Gross: {totals.gross}</Text>
                <Text style={styles.summaryLabel}>Net: {totals.net}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Action buttons row — mirrors PHP: hdcp, scores, scorecard, leaderboard icons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn}><Text>📊 Hdcp</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Text>⛳ Scores</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Text>📋 Scorecard</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Text>🏆 Leaderboard</Text></TouchableOpacity>
      </View>

      {/* Hole navigation — mirrors PHP: prev/next hole buttons */}
      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.navBtn, currentHole <= startHole && styles.navBtnDisabled]} onPress={goPrevHole}>
          <Text>← Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navBtn, (side !== '18h' && showFullRoundSummary) || (side === '18h' && currentHole > endHole) ? styles.navBtnDisabled : null]} onPress={goNextHole}>
          <Text>{showFrontNineSummary ? 'Continue →' : 'Next →'}</Text>
        </TouchableOpacity>
      </View>

      {/* Home button — mirrors PHP: home icon */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => router.push(`/menu?eventId=${params.eventId}`)}
      >
        <Text style={styles.homeButtonText}>🏠 Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5dc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  columnHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  nameCol: {
    width: 30,
  },
  colLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
    width: 50,
  },
  btnPlaceholder: {
    width: 30,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 50,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  onPar: {
    backgroundColor: '#d4edda',
    borderColor: '#28a745',
    borderWidth: 2,
  },
  underPar: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
    borderWidth: 2,
  },
  overPar: {
    backgroundColor: 'transparent',
    borderColor: '#ccc',
    borderWidth: 2,
  },
  minusBtn: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  plusBtn: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  btnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  netValue: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 50,
    textShadowColor: '#444',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navBtn: {
    flex: 0.48,
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  navBtnDisabled: {
    backgroundColor: '#999',
  },
  homeButton: {
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  homeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  summaryCard: {
    backgroundColor: '#fffbe6',
    borderWidth: 2,
    borderColor: '#f0c94b',
    borderRadius: 8,
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  overallCard: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#555',
    marginHorizontal: 8,
  },
});
