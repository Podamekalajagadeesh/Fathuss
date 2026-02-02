import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Challenge, User, Submission, LeaderboardEntry, Achievement } from '../types';

const API_BASE_URL = 'http://localhost:4000'; // Update this for production

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth functions
export const authAPI = {
  login: async (credentials: { address: string; signature: string }) => {
    const response = await api.post('/auth/login', credentials);
    const { token, user } = response.data;
    await AsyncStorage.setItem('authToken', token);
    return { token, user };
  },

  logout: async () => {
    await AsyncStorage.removeItem('authToken');
  },
};

// Challenge functions
export const challengeAPI = {
  getChallenges: async (): Promise<Challenge[]> => {
    const response = await api.get('/challenges');
    return response.data;
  },

  getChallenge: async (id: string): Promise<Challenge> => {
    const response = await api.get(`/challenges/${id}`);
    return response.data;
  },

  getChallengeSubmissions: async (challengeId: string): Promise<Submission[]> => {
    const response = await api.get(`/challenges/${challengeId}/submissions`);
    return response.data;
  },

  submitSolution: async (challengeId: string, data: { solution: string; explanation: string }): Promise<Submission> => {
    const response = await api.post(`/challenges/${challengeId}/submit`, data);
    return response.data;
  },
};

// User functions
export const userAPI = {
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/users/me');
    return response.data;
  },

  getUserAchievements: async (address: string): Promise<any> => {
    const response = await api.get(`/achievements/user/${address}`);
    return response.data;
  },

  getUserLevel: async (address: string): Promise<any> => {
    const response = await api.get(`/user/level/${address}`);
    return response.data;
  },
};

// Leaderboard functions
export const leaderboardAPI = {
  getGlobalLeaderboard: async (): Promise<LeaderboardEntry[]> => {
    const response = await api.get('/leaderboard/global');
    return response.data.leaderboard;
  },

  getUserStats: async (address: string): Promise<any> => {
    const response = await api.get(`/leaderboard/user/${address}`);
    return response.data;
  },
};

// Achievement functions
export const achievementAPI = {
  getAllAchievements: async (): Promise<Achievement[]> => {
    const response = await api.get('/achievements');
    return response.data;
  },

  getUserAchievements: async (): Promise<Achievement[]> => {
    const response = await api.get('/achievements/user');
    return response.data;
  },

  getDailyChallenge: async (): Promise<any> => {
    const response = await api.get('/daily-challenge');
    return response.data;
  },

  updateDailyProgress: async (challengeId: string, progress: number): Promise<any> => {
    const response = await api.post('/daily-challenge/progress', { challengeId, progress });
    return response.data;
  },

  claimDailyReward: async (challengeId: string): Promise<any> => {
    const response = await api.post('/daily-challenge/claim', { challengeId });
    return response.data;
  },
};

export default api;