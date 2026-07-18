import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { getEventById } from '../src/services/apiService';

const MENU_ITEMS = [
  { label: 'Start Game', route: '/startgame' },
  { label: 'Teams', route: '/teams', disabled: true },
  { label: 'Results', route: '/results', disabled: true },
  { label: 'Tee Times', route: '/teetimes' },
  { label: 'Leaderboard', route: '/leaderboard' },
  { label: 'Calc Course Hdcp', route: '/calchdcp', disabled: true },
  { label: 'Admin', route: '/admin', disabled: true },
  { label: 'Ryder Cup', route: '/rydercup', disabled: true },
];

export default function MenuScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getEventById>>>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      getEventById(Number(eventId)).then((data) => {
        setEvent(data);
        setLoading(false);
      });
    }
  }, [eventId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Event Menu" />
        <ActivityIndicator size="large" color="#2d5016" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Header title="Event Menu" />
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.navigate('/')}>
          <Text style={styles.backButtonText}>← Back to Search</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Event Menu" />
      
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{event.eventName}</Text>
        <Text style={styles.courseText}>{event.courseName}</Text>
      </View>

      <View style={styles.actionsContainer}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity 
            key={item.label} 
            style={[styles.actionButton, item.disabled && styles.actionButtonDisabled]}
            onPress={() => !item.disabled && router.push(`${item.route}?eventId=${eventId}`)}
            disabled={item.disabled}
          >
            <Text style={[styles.actionButtonText, item.disabled && styles.actionButtonTextDisabled]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
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
        onPress={() => router.navigate('/')}
      >
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
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginTop: 40,
  },
  actionsContainer: {
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    width: '75%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#e0e0e0',
    opacity: 0.6,
  },
  actionButtonTextDisabled: {
    color: '#999',
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
