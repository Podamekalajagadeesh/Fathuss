import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { challengeAPI } from '../services/api';
import { Challenge } from '../types';

type ChallengesScreenNavigationProp = StackNavigationProp<RootStackParamList>;

export default function ChallengesScreen() {
  const navigation = useNavigation<ChallengesScreenNavigationProp>();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [filteredChallenges, setFilteredChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');

  const categories = ['All', 'Smart Contracts', 'DeFi', 'NFTs', 'Security', 'Cryptography'];
  const difficulties = ['All', 'Easy', 'Medium', 'Hard', 'Expert'];

  useEffect(() => {
    loadChallenges();
  }, []);

  useEffect(() => {
    filterChallenges();
  }, [challenges, searchQuery, selectedCategory, selectedDifficulty]);

  const loadChallenges = async () => {
    try {
      const data = await challengeAPI.getChallenges();
      setChallenges(data);
    } catch (error) {
      console.error('Failed to load challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterChallenges = () => {
    let filtered = challenges;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(challenge =>
        challenge.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        challenge.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        challenge.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(challenge => challenge.category === selectedCategory);
    }

    // Filter by difficulty
    if (selectedDifficulty !== 'All') {
      filtered = filtered.filter(challenge => challenge.difficulty === selectedDifficulty);
    }

    setFilteredChallenges(filtered);
  };

  const renderChallenge = ({ item }: { item: Challenge }) => (
    <TouchableOpacity
      style={styles.challengeCard}
      onPress={() => navigation.navigate('ChallengeDetail', { challengeId: item.id })}
    >
      <View style={styles.challengeHeader}>
        <Text style={styles.challengeTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={[styles.difficultyBadge, getDifficultyStyle(item.difficulty)]}>
          <Text style={styles.difficultyText}>{item.difficulty}</Text>
        </View>
      </View>

      <Text style={styles.challengeDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.challengeMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="folder-outline" size={14} color="#6B7280" />
          <Text style={styles.metaText}>{item.category}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="trophy-outline" size={14} color="#6B7280" />
          <Text style={styles.metaText}>{item.points} pts</Text>
        </View>
      </View>

      <View style={styles.tagsContainer}>
        {item.tags.slice(0, 3).map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
        {item.tags.length > 3 && (
          <Text style={styles.moreTags}>+{item.tags.length - 3} more</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFilterButton = (title: string, isSelected: boolean, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.filterButton, isSelected && styles.filterButtonSelected]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, isSelected && styles.filterButtonTextSelected]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading challenges...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search challenges..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Category Filters */}
      <View style={styles.filtersContainer}>
        <Text style={styles.filterTitle}>Category</Text>
        <View style={styles.filterButtons}>
          {categories.map(category => (
            <TouchableOpacity
              key={category}
              style={[styles.filterButton, selectedCategory === category && styles.filterButtonSelected]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[styles.filterButtonText, selectedCategory === category && styles.filterButtonTextSelected]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Difficulty Filters */}
      <View style={styles.filtersContainer}>
        <Text style={styles.filterTitle}>Difficulty</Text>
        <View style={styles.filterButtons}>
          {difficulties.map(difficulty => (
            <TouchableOpacity
              key={difficulty}
              style={[styles.filterButton, selectedDifficulty === difficulty && styles.filterButtonSelected]}
              onPress={() => setSelectedDifficulty(difficulty)}
            >
              <Text style={[styles.filterButtonText, selectedDifficulty === difficulty && styles.filterButtonTextSelected]}>
                {difficulty}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Results Count */}
      <View style={styles.resultsContainer}>
        <Text style={styles.resultsText}>
          {filteredChallenges.length} challenge{filteredChallenges.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      {/* Challenges List */}
      <FlatList
        data={filteredChallenges}
        renderItem={renderChallenge}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.challengesList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No challenges found</Text>
            <Text style={styles.emptyText}>
              Try adjusting your search or filter criteria
            </Text>
          </View>
        }
      />
    </View>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  filtersContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 4,
  },
  filterButtonSelected: {
    backgroundColor: '#3B82F6',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterButtonTextSelected: {
    color: '#FFFFFF',
  },
  resultsContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  resultsText: {
    fontSize: 14,
    color: '#6B7280',
  },
  challengesList: {
    padding: 16,
  },
  challengeCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
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
    marginBottom: 8,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    marginRight: 12,
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
  challengeDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  challengeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#6B7280',
  },
  moreTags: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
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