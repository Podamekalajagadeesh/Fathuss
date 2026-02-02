import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { leaderboardAPI, userAPI } from '../services/api';
import { LeaderboardEntry, User } from '../types';

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<'all' | 'weekly' | 'monthly'>('all');

  useEffect(() => {
    loadLeaderboard();
  }, [timeframe]);

  const loadLeaderboard = async () => {
    try {
      const [leaderboardData, userData] = await Promise.all([
        leaderboardAPI.getGlobalLeaderboard(),
        userAPI.getCurrentUser().catch(() => null),
      ]);

      setLeaderboard(leaderboardData);
      setCurrentUser(userData);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard();
  };

  const renderLeaderboardItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentUser = currentUser && item.address.toLowerCase() === currentUser.address.toLowerCase();

    return (
      <View style={[styles.leaderboardItem, isCurrentUser && styles.currentUserItem]}>
        <View style={styles.rankContainer}>
          {index < 3 ? (
            <View style={[styles.rankBadge, getRankStyle(index)]}>
              <Ionicons
                name={index === 0 ? 'trophy' : index === 1 ? 'medal' : 'ribbon'}
                size={16}
                color="#FFFFFF"
              />
            </View>
          ) : (
            <Text style={styles.rankText}>#{index + 1}</Text>
          )}
        </View>

        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {item.username ? item.username.charAt(0).toUpperCase() :
               item.address.substring(2, 3).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username || `${item.address.substring(0, 6)}...${item.address.substring(item.address.length - 4)}`}
            </Text>
            <Text style={styles.address} numberOfLines={1}>
              {item.address}
            </Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.totalPoints}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.challengesCompleted}</Text>
            <Text style={styles.statLabel}>Solved</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{Math.round(item.winRate * 100)}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>
      </View>
    );
  };

  const getRankStyle = (index: number) => {
    switch (index) {
      case 0:
        return { backgroundColor: '#FFD700' }; // Gold
      case 1:
        return { backgroundColor: '#C0C0C0' }; // Silver
      case 2:
        return { backgroundColor: '#CD7F32' }; // Bronze
      default:
        return { backgroundColor: '#6B7280' };
    }
  };

  const renderTimeframeButton = (label: string, value: 'all' | 'weekly' | 'monthly') => (
    <TouchableOpacity
      style={[styles.timeframeButton, timeframe === value && styles.timeframeButtonActive]}
      onPress={() => setTimeframe(value)}
    >
      <Text style={[styles.timeframeButtonText, timeframe === value && styles.timeframeButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Text style={styles.headerSubtitle}>Top performers this {timeframe === 'all' ? 'season' : timeframe}</Text>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.timeframeContainer}>
        {renderTimeframeButton('All Time', 'all')}
        {renderTimeframeButton('This Week', 'weekly')}
        {renderTimeframeButton('This Month', 'monthly')}
      </View>

      {/* Current User Rank (if not in top 10) */}
      {currentUser && !leaderboard.some(entry =>
        entry.address.toLowerCase() === currentUser.address.toLowerCase()
      ) && (
        <View style={styles.currentUserCard}>
          <Text style={styles.currentUserTitle}>Your Rank</Text>
          <View style={styles.currentUserItem}>
            <View style={styles.rankContainer}>
              <Text style={styles.rankText}>#{currentUser.reputation || 'Unranked'}</Text>
            </View>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {currentUser.username ? currentUser.username.charAt(0).toUpperCase() :
                   currentUser.address.substring(2, 3).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.username}>
                  {currentUser.username || 'You'}
                </Text>
                <Text style={styles.address} numberOfLines={1}>
                  {currentUser.address}
                </Text>
              </View>
            </View>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{currentUser.totalScore}</Text>
                <Text style={styles.statLabel}>Points</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Leaderboard List */}
      <FlatList
        data={leaderboard}
        renderItem={renderLeaderboardItem}
        keyExtractor={(item) => item.address}
        contentContainerStyle={styles.leaderboardList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No rankings yet</Text>
            <Text style={styles.emptyText}>
              Be the first to solve challenges and claim the top spot!
            </Text>
          </View>
        }
      />
    </View>
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
  header: {
    padding: 20,
    backgroundColor: '#1F2937',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  timeframeContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeframeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  timeframeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  timeframeButtonTextActive: {
    color: '#FFFFFF',
  },
  currentUserCard: {
    margin: 16,
    marginBottom: 0,
  },
  currentUserTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  currentUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  leaderboardList: {
    padding: 16,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
  rankContainer: {
    width: 50,
    alignItems: 'center',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  address: {
    fontSize: 12,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    marginLeft: 12,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
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