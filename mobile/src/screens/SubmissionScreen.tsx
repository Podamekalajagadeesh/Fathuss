import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { challengeAPI } from '../services/api';

export default function SubmissionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { challengeId, challengeTitle } = route.params as {
    challengeId: string;
    challengeTitle: string;
  };

  const [solution, setSolution] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!solution.trim()) {
      Alert.alert('Error', 'Please enter your solution');
      return;
    }

    setSubmitting(true);
    try {
      await challengeAPI.submitSolution(challengeId, {
        solution: solution.trim(),
        explanation: explanation.trim(),
      });

      Alert.alert(
        'Success!',
        'Your solution has been submitted successfully. You will receive feedback soon.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Submission failed:', error);
      Alert.alert('Error', 'Failed to submit solution. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (solution.trim() || explanation.trim()) {
      Alert.alert(
        'Discard Changes',
        'Are you sure you want to cancel? Your solution will be lost.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Submit Solution</Text>
          <Text style={styles.challengeTitle} numberOfLines={1}>
            {challengeTitle}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <View style={styles.instructionContent}>
            <Text style={styles.instructionTitle}>Submission Guidelines</Text>
            <Text style={styles.instructionText}>
              • Provide a clear and complete solution{'\n'}
              • Include your reasoning and approach{'\n'}
              • Use proper formatting for code{'\n'}
              • Double-check your solution before submitting
            </Text>
          </View>
        </View>

        {/* Solution Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Your Solution *</Text>
          <TextInput
            style={styles.solutionInput}
            multiline
            placeholder="Enter your solution here... (code, answer, or explanation)"
            placeholderTextColor="#9CA3AF"
            value={solution}
            onChangeText={setSolution}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>
            {solution.length} characters
          </Text>
        </View>

        {/* Explanation Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Explanation (Optional)</Text>
          <TextInput
            style={styles.explanationInput}
            multiline
            placeholder="Explain your approach and reasoning..."
            placeholderTextColor="#9CA3AF"
            value={explanation}
            onChangeText={setExplanation}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>
            {explanation.length} characters
          </Text>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Ionicons name="bulb" size={20} color="#F59E0B" />
          <View style={styles.tipsContent}>
            <Text style={styles.tipsTitle}>Tips for Better Submissions</Text>
            <Text style={styles.tipsText}>
              • Show your work and thought process{'\n'}
              • Use comments in your code{'\n'}
              • Test your solution thoroughly{'\n'}
              • Be concise but complete
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, (!solution.trim() || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!solution.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.submitButtonText}>
            {submitting ? 'Submitting...' : 'Submit Solution'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#1F2937',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  challengeTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  instructionCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  instructionContent: {
    flex: 1,
    marginLeft: 12,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  solutionInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 120,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  explanationInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 80,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  tipsCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  tipsContent: {
    flex: 1,
    marginLeft: 12,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  footer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});