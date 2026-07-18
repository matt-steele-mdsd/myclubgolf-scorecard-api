import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => (
  <View style={styles.header}>
    <Text style={styles.title}>{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#2d5016',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: '#4a7c28',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
