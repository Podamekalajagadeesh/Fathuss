import { ApolloClient, InMemoryCache } from '@apollo/client'
import axios from 'axios'

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:4000'

export const apolloClient = new ApolloClient({
  uri: `${API_GATEWAY_URL}/graphql`,
  cache: new InMemoryCache(),
})

export const apiClient = axios.create({
  baseURL: API_GATEWAY_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add JWT token to requests if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auth functions
export const verifySiweSignature = async (message: string, signature: string) => {
  const response = await apiClient.post('/auth/verify', { message, signature })
  const { token } = response.data
  localStorage.setItem('authToken', token)
  return response.data
}

export const logout = () => {
  localStorage.removeItem('authToken')
}

export const fetchChallenges = async () => {
  const response = await apiClient.get('/challenges')
  return response.data
}

export const fetchChallenge = async (id: string) => {
  const response = await apiClient.get(`/challenges/${id}`)
  return response.data
}

export const fetchLeaderboard = async (): Promise<{ username?: string; address: string; totalPoints: number }[]> => {
  const response = await apiClient.get('/leaderboard/global')
  return response.data
}

export const submitChallenge = async (challengeId: string, code: string) => {
  const response = await apiClient.post('/submit', { challengeId, code })
  return response.data
}

export const fetchSubmissionResult = async (submissionId: string) => {
  const response = await apiClient.get(`/api/submissions/${submissionId}`)
  return response.data
}

export const fetchSolvedChallenges = async (address: string): Promise<{ solvedChallenges: any[]; pagination: any }> => {
  const response = await apiClient.get(`/challenges/users/${address}/solved`)
  return response.data
}

export const fetchCurrentUser = async (): Promise<{ address: string; username?: string; totalPoints: number }> => {
  const response = await apiClient.get('/users/me')
  return response.data
}

export const fetchSolvedChallengeIds = async (address: string): Promise<string[]> => {
  const response = await apiClient.get(`/challenges/users/${address}/solved?limit=1000`)
  return response.data.solvedChallenges.map((c: any) => c.id)
}

export const fetchUserBadges = async (address: string): Promise<any[]> => {
  const response = await apiClient.get(`/users/${address}/badges`)
  return response.data.badges
}