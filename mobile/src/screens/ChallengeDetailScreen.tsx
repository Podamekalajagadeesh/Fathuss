import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { challengeAPI } from '../services/api';
import { Challenge, Submission } from '../types';

type ChallengeDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ChallengeDetail'>;
type ChallengeDetailScreenRouteProp = RouteProp<RootStackParamList, 'ChallengeDetail'>;

export default function ChallengeDetailScreen() {
  const navigation = useNavigation<ChallengeDetailScreenNavigationProp>();
  const route = useRoute<ChallengeDetailScreenRouteProp>();
  const { challengeId } = route.params as { challengeId: string };

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadChallengeData();
  }, [challengeId]);

  const loadChallengeData = async () => {
    try {
      const [challengeData, submissionsData] = await Promise.all([
        challengeAPI.getChallenge(challengeId),
        challengeAPI.getChallengeSubmissions(challengeId),
      ]);

      setChallenge(challengeData);
      setSubmissions(submissionsData);
    } catch (error) {
      console.error('Failed to load challenge data:', error);
      Alert.alert('Error', 'Failed to load challenge details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSolution = () => {
    if (!challenge) return;

    navigation.navigate('Submission', {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
    });
  };

  const getDifficultyStyle = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return { backgroundColor: '#D1FAE5', color: '#065F46' };
      case 'medium':
        return { backgroundColor: '#FED7AA', color: '#9A3412' };
      case 'hard':
        return { backgroundColor: '#FECACA', color: '#B91C1C' };
      case 'expert':
        return { backgroundColor: '#E0E7FF', color: '#1E3A8A' };
      default:
        return { backgroundColor: '#F3F4F6', color: '#374151' };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'cryptography':
        return 'lock-closed';
      case 'web3':
        return 'globe';
      case 'smart contracts':
        return 'document-text';
      case 'defi':
        return 'cash';
      case 'security':
        return 'shield-checkmark';
      default:
        return 'code-slash';
    }
  };

  const renderSubmission = (submission: Submission) => (
    <View key={submission.id} style={styles.submissionItem}>
      <View style={styles.submissionHeader}>
        <View style={styles.submitterInfo}>
          <View style={styles.submitterAvatar}>
            <Text style={styles.submitterAvatarText}>
              {submission.user.username ? submission.user.username.charAt(0).toUpperCase() :
               submission.user.address.substring(2, 3).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.submitterName}>
              {submission.user.username || `${submission.user.address.substring(0, 6)}...`}
            </Text>
            <Text style={styles.submissionDate}>
              {new Date(submission.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, getStatusStyle(submission.status)]}>
          <Text style={styles.statusText}>{submission.status}</Text>
        </View>
      </View>

      {submission.score !== null && (
        <View style={styles.scoreContainer}>
          <Ionicons name="star" size={16} color="#FFD700" />
          <Text style={styles.scoreText}>{submission.score}/100</Text>
        </View>
      )}

      {submission.feedback && (
        <Text style={styles.feedbackText}>{submission.feedback}</Text>
      )}
    </View>
  );

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
        return { backgroundColor: '#D1FAE5' };
      case 'rejected':
        return { backgroundColor: '#FECACA' };
      case 'pending':
        return { backgroundColor: '#FED7AA' };
      default:
        return { backgroundColor: '#F3F4F6' };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading challenge...</Text>
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
        <Text style={styles.errorTitle}>Challenge not found</Text>
        <Text style={styles.errorText}>This challenge may have been removed</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Challenge Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={[styles.difficultyBadge, getDifficultyStyle(challenge.difficulty)]}>
            <Text style={styles.difficultyText}>{challenge.difficulty}</Text>
          </View>
        </View>

        <View style={styles.categoryContainer}>
          <View style={styles.categoryIcon}>
            <Ionicons name={getCategoryIcon(challenge.category)} size={20} color="#3B82F6" />
          </View>
          <Text style={styles.categoryText}>{challenge.category}</Text>
        </View>

        <Text style={styles.title}>{challenge.title}</Text>
        <Text style={styles.description}>{challenge.description}</Text>

        <View style={styles.challengeStats}>
          <View style={styles.stat}>
            <Ionicons name="trophy" size={16} color="#FFD700" />
            <Text style={styles.statText}>{challenge.points} points</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="time" size={16} color="#FFFFFF" />
            <Text style={styles.statText}>{challenge.timeLimit} min</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="people" size={16} color="#FFFFFF" />
            <Text style={styles.statText}>{submissions.length} attempts</Text>
          </View>
        </View>
      </View>

      {/* Challenge Content */}
      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Problem Statement</Text>
          <View style={styles.problemCard}>
            <Text style={styles.problemText}>{challenge.problemStatement}</Text>
          </View>
        </View>

        {challenge.hints && challenge.hints.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hints</Text>
            {challenge.hints.map((hint, index) => (
              <View key={index} style={styles.hintCard}>
                <Text style={styles.hintText}>{hint}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmitSolution}
          disabled={submitting}
        >
          <Ionicons name="code-slash" size={20} color="#FFFFFF" />
          <Text style={styles.submitButtonText}>
            {submitting ? 'Submitting...' : 'Submit Solution'}
          </Text>
        </TouchableOpacity>

        {/* Recent Submissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Submissions</Text>
          {submissions.length > 0 ? (
            <View style={styles.submissionsContainer}>
              {submissions.slice(0, 5).map(renderSubmission)}
            </View>
          ) : (
            <View style={styles.emptySubmissions}>
              <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No submissions yet</Text>
              <Text style={styles.emptyText}>
                Be the first to solve this challenge!
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#1F2937',
    padding: 20,
    paddingTop: 60,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  categoryText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#D1D5DB',
    lineHeight: 24,
    marginBottom: 16,
  },
  challengeStats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 4,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  problemCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  problemText: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 24,
  },
  hintCard: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  hintText: {
    fontSize: 14,
    color: '#92400E',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  submissionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  submissionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  submitterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitterAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  submitterAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  submitterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  submissionDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#374151',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 4,
  },
  feedbackText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  emptySubmissions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});