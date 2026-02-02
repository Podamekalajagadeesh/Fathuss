import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { userAPI, achievementAPI, challengeAPI } from '../services/api';
import { User, DailyChallenge, Challenge } from '../types';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [user, setUser] = useState<User | null>(null);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);
  const [recentChallenges, setRecentChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, dailyData, challengesData] = await Promise.all([
        userAPI.getCurrentUser().catch(() => null),
        achievementAPI.getDailyChallenge().catch(() => null),
        challengeAPI.getChallenges().catch(() => []),
      ]);

      setUser(userData);
      setDailyChallenge(dailyData);
      setRecentChallenges(challengesData.slice(0, 3));
    } catch (error) {
      console.error('Failed to load home data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimDailyReward = async () => {
    if (!dailyChallenge) return;

    try {
      await achievementAPI.claimDailyReward(dailyChallenge.id);
      Alert.alert('Success', 'Daily reward claimed!');
      loadData(); // Refresh data
    } catch (error) {
      Alert.alert('Error', 'Failed to claim reward');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>
          Welcome{user?.username ? `, ${user.username}` : ''}!
        </Text>
        <Text style={styles.welcomeSubtitle}>
          Ready to tackle some challenges?
        </Text>
      </View>

      {/* Level Progress */}
      {user && (
        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <Ionicons name="star" size={24} color="#FFD700" />
            <Text style={styles.levelTitle}>Level {user.level}</Text>
          </View>
          <Text style={styles.xpText}>
            {user.experience} XP
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, ((user.experience % 100) / 100) * 100)}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {100 - (user.experience % 100)} XP to next level
          </Text>
        </View>
      )}

      {/* Daily Challenge */}
      {dailyChallenge && (
        <View style={styles.dailyCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="time" size={24} color="#3B82F6" />
            <Text style={styles.cardTitle}>Daily Challenge</Text>
          </View>
          <Text style={styles.challengeTitle}>{dailyChallenge.title}</Text>
          <Text style={styles.challengeDesc}>{dailyChallenge.description}</Text>

          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {dailyChallenge.progress} / {dailyChallenge.target}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (dailyChallenge.progress / dailyChallenge.target) * 100)}%`,
                    backgroundColor: dailyChallenge.completed ? '#10B981' : '#3B82F6'
                  }
                ]}
              />
            </View>
          </View>

          {dailyChallenge.completed && !dailyChallenge.claimed && (
            <TouchableOpacity
              style={styles.claimButton}
              onPress={handleClaimDailyReward}
            >
              <Text style={styles.claimButtonText}>
                Claim {dailyChallenge.rewardXP} XP + {dailyChallenge.rewardPoints} Points
              </Text>
            </TouchableOpacity>
          )}

          {dailyChallenge.claimed && (
            <View style={styles.claimedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.claimedText}>Completed & Claimed!</Text>
            </View>
          )}
        </View>
      )}

      {/* Recent Challenges */}
      <View style={styles.challengesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Challenges</Text>
        </View>

        {recentChallenges.map((challenge) => (
          <TouchableOpacity
            key={challenge.id}
            style={styles.challengeCard}
            onPress={() => navigation.navigate('ChallengeDetail', { challengeId: challenge.id })}
          >
            <View style={styles.challengeHeader}>
              <Text style={styles.challengeTitle}>{challenge.title}</Text>
              <View style={[styles.difficultyBadge, getDifficultyStyle(challenge.difficulty)]}>
                <Text style={styles.difficultyText}>{challenge.difficulty}</Text>
              </View>
            </View>
            <Text style={styles.challengeCategory}>{challenge.category}</Text>
            <View style={styles.challengeFooter}>
              <Text style={styles.pointsText}>{challenge.points} points</Text>
              <Ionicons name="chevron-forward" size={16} color="#6B7280" />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Stats */}
      {user && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.challengesCompleted}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.totalScore}</Text>
              <Text style={styles.statLabel}>Total Score</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.currentStreak}</Text>
              <Text style={styles.statLabel}>Current Streak</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const getDifficultyStyle = (difficulty: string) => {
  switch (difficulty) {
    case 'Easy':
      return { backgroundColor: '#10B981' };
    case 'Medium':
      return { backgroundColor: '#F59E0B' };
    case 'Hard':
      return { backgroundColor: '#EF4444' };
    case 'Expert':
      return { backgroundColor: '#8B5CF6' };
    default:
      return { backgroundColor: '#6B7280' };
  }
};

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
  welcomeSection: {
    padding: 20,
    backgroundColor: '#1F2937',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  levelCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  levelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 8,
  },
  xpText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  dailyCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 8,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  challengeDesc: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  claimButton: {
    backgroundColor: '#10B981',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  claimedText: {
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
  challengesSection: {
    margin: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  seeAllText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  challengeCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  challengeCategory: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  challengeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsCard: {
    margin: 16,
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});