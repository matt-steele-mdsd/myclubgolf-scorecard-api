import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { Header } from '../src/components/Header';
import { createEvent, getCourseList, Course } from '../src/services/apiService';

export default function CreateEventScreen() {
  const [eventName, setEventName] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [courses, setCourses] = useState<Course[]>([]);

  const router = useRouter();

  useEffect(() => {
    getCourseList().then(setCourses);
  }, []);

  const handleSave = async () => {
    if (!eventName || !selectedCourseId) {
      Alert.alert('Error', 'Please fill in all required fields (Event Name and Course).');
      return;
    }

    const course = courses.find((c) => String(c.id) === selectedCourseId);
    try {
      const newEvent = await createEvent({
        eventName,
        courseName: course?.name || '',
      });

      if (!newEvent) {
        Alert.alert('Error', 'Failed to create event. Please try again.');
        return;
      }

      // Navigate to menu screen with the newly created event
      router.push({ 
        pathname: '/menu', 
        params: { eventId: String(newEvent.id) } 
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to create event. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <Header title="Create New Event" />

      <ScrollView contentContainerStyle={styles.formContent}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Thursday Pot Game"
            value={eventName}
            onChangeText={setEventName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Course Name *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedCourseId}
              onValueChange={(value) => setSelectedCourseId(value)}
              style={styles.picker}
            >
              <Picker.Item label="-- Select a course --" value="" />
              {courses.map((course) => (
                <Picker.Item key={course.id} label={course.name} value={course.id} />
              ))}
            </Picker>
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Event</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.navigate('/')}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  formContent: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d5016',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
  },
  saveButton: {
    backgroundColor: '#4a7c28',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
  },
});
