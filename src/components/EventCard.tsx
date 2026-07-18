import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface EventCardProps {
  id?: number;
  eventName: string;
  courseName: string;
}

export const EventCard: React.FC<EventCardProps> = ({ eventName, courseName }) => (
  <View style={styles.card}>
    <Text style={styles.eventName}>{eventName}</Text>
    <Text style={styles.courseName}>{courseName}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d5016',
    marginBottom: 4,
  },
  courseName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});
