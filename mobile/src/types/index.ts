export interface User {
  id: string;
  address: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  level: number;
  experience: number;
  totalScore: number;
  challengesCompleted: number;
  reputation: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  points: number;
  tags: string[];
  isActive: boolean;
  timeLimit?: number;
  memoryLimit?: number;
  testCases?: any[];
  problemStatement: string;
  hints?: string[];
}

export interface Submission {
  id: string;
  challengeId: string;
  userId: string;
  user: User;
  language: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'accepted' | 'rejected';
  score?: number;
  executionTime?: number;
  submittedAt: string;
  createdAt: string;
  completedAt?: string;
  feedback?: string;
  result?: any;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  totalPoints: number;
  challengesCompleted: number;
  winRate: number;
  lastActive: string;
  level?: number;
  achievementsCount?: number;
}

export interface Achievement {
  id: string;
  name: string;
  title: string;
  description: string;
  icon?: string;
  category: string;
  type: 'count' | 'streak' | 'score' | 'level';
  threshold: number;
  points: number;
  xpReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earnedAt: string;
}

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: string;
  target: number;
  rewardXP: number;
  rewardPoints: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface UserLevel {
  level: number;
  experiencePoints: number;
  reputation: number;
  currentLevelXP: number;
  nextLevelXP: number;
  xpToNext: number;
  progressPercent: number;
}