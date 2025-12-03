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

// Example functions
export const fetchChallenges = async () => {
  // GraphQL query example
  // const { data } = await apolloClient.query({ query: GET_CHALLENGES })
  // return data

  // For now, REST example
  const response = await apiClient.get('/challenges')
  return response.data
}

export const submitChallenge = async (challengeId: string, code: string) => {
  const response = await apiClient.post('/submit', { challengeId, code })
  return response.data
}