import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { EventCard } from '../src/components/EventCard';
import { searchEvents } from '../src/services/apiService';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Log when component mounts
  console.log('📱 SearchScreen mounted');

  const handleSearch = async () => {
    try {
      console.log('🔍 Searching for:', query);
      setLoading(true);
      setHasSearched(true);
      setError(null);
      
      // Explicitly log the API call attempt
      console.log('🌐 Attempting to fetch from API...');
      const events = await searchEvents(query);
      console.log('✅ Got results:', events.length, events);
      setResults(events);
      
      if (events.length === 0) {
        console.warn('⚠️ No events found for query:', query);
      }
    } catch (error: any) {
      const message = error.message || 'Unknown search error';
      console.error('❌ Search error:', error);
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
      console.log('🏁 Search completed');
    }
  };

  const handleCreateNewEvent = () => {
    router.push('/create');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Golf Club Events" />
      
      <View style={styles.searchSection}>
        <TextInput
          style={styles.input}
          placeholder="Search by event name or course..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        
        <TouchableOpacity 
          style={[styles.searchButton, loading && styles.disabledButton]} 
          onPress={handleSearch}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Searching...' : 'Search'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.createButton} onPress={handleCreateNewEvent}>
          <Text style={styles.createButtonText}>+ Create New Event</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ Error: {error}</Text>
        </View>
      )}

      {!loading && !error && hasSearched && results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No events found. Try a different search or create a new event.</Text>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/menu', params: { eventId: item.id } })}
            style={styles.eventItem}
          >
            <EventCard 
              eventName={item.eventName}
              courseName={item.courseName}
            />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  searchSection: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  searchButton: {
    backgroundColor: '#4a7c28',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#2d5016',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
  },
  eventItem: {
    marginBottom: 8,
  },
});
