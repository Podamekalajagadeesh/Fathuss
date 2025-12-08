'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrophyIcon, MedalIcon, StarIcon, CodeBracketIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { fetchLeaderboard, fetchCurrentUser } from '@/lib/api'

interface LeaderboardUser {
  rank: number
  name: string
  address: string
  score: number
  avatar: string
  solvedCount: number
  isCurrentUser?: boolean
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ address: string; username?: string } | null>(null)

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const [leaderboardData, userData] = await Promise.all([
          fetchLeaderboard(),
          fetchCurrentUser().catch(() => null)
        ])

        setCurrentUser(userData)

        // Transform and sort leaderboard data
        const transformedData = leaderboardData
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((user, index) => ({
            rank: index + 1,
            name: user.username || `${user.address.substring(0, 6)}...${user.address.substring(user.address.length - 4)}`,
            address: user.address,
            score: user.totalPoints,
            avatar: user.username ? user.username.charAt(0).toUpperCase() : user.address.substring(2, 3).toUpperCase(),
            solvedCount: user.solvedCount || 0,
            isCurrentUser: userData && user.address.toLowerCase() === userData.address.toLowerCase()
          }))

        setLeaderboard(transformedData)
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error)
        // Fallback mock data
        setLeaderboard([
          { rank: 1, name: 'Alice Chen', address: '0x1234...', score: 2450, avatar: 'A', solvedCount: 89, isCurrentUser: false },
          { rank: 2, name: 'Bob Smith', address: '0x5678...', score: 2380, avatar: 'B', solvedCount: 85, isCurrentUser: false },
          { rank: 3, name: 'Carol Davis', address: '0x9abc...', score: 2320, avatar: 'C', solvedCount: 82, isCurrentUser: false },
          { rank: 4, name: 'David Wilson', address: '0xdef0...', score: 2280, avatar: 'D', solvedCount: 79, isCurrentUser: false },
          { rank: 5, name: 'Eva Johnson', address: '0x1111...', score: 2250, avatar: 'E', solvedCount: 76, isCurrentUser: false },
        ])
      } finally {
        setLoading(false)
      }
    }

    loadLeaderboard()
  }, [])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <TrophyIcon className="h-6 w-6 text-yellow-500" />
      case 2:
        return <MedalIcon className="h-6 w-6 text-gray-400" />
      case 3:
        return <StarIcon className="h-6 w-6 text-amber-600" />
      default:
        return <span className="text-lg font-bold text-gray-500">#{rank}</span>
    }
  }

  const getRankBadge = (rank: number) => {
    if (rank <= 3) {
      return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white'
    } else if (rank <= 10) {
      return 'bg-gradient-to-r from-blue-400 to-blue-600 text-white'
    } else if (rank <= 50) {
      return 'bg-gradient-to-r from-green-400 to-green-600 text-white'
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-2 rounded-lg">
                  <CodeBracketIcon className="h-6 w-6 text-white" />
                </div>
              </Link>
            </div>
            <nav className="hidden md:flex space-x-8">
              <Link href="/problems" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                Problems
              </Link>
              <Link href="/leaderboard" className="text-indigo-600 border-b-2 border-indigo-600 pb-1">
                Leaderboard
              </Link>
              <Link href="/about" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                About
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            🏆 Global Leaderboard
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Top Web3 developers ranked by their coding achievements and problem-solving skills
          </p>
        </div>

        {/* Top 3 Podium */}
        {leaderboard.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* 2nd Place */}
            <div className="order-1 md:order-1">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center transform hover:scale-105 transition-transform">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-gray-300 to-gray-500 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{leaderboard[1]?.avatar}</span>
                  </div>
                </div>
                <div className="mb-2">
                  <MedalIcon className="h-8 w-8 text-gray-400 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">{leaderboard[1]?.name}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">2nd Place</p>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{leaderboard[1]?.score.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{leaderboard[1]?.solvedCount} solved</div>
              </div>
            </div>

            {/* 1st Place */}
            <div className="order-2 md:order-2">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-yellow-200 dark:border-yellow-700 p-6 text-center transform hover:scale-105 transition-transform relative">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-yellow-400 text-white px-3 py-1 rounded-full text-sm font-semibold">👑 Champion</div>
                </div>
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">{leaderboard[0]?.avatar}</span>
                  </div>
                </div>
                <div className="mb-2">
                  <TrophyIcon className="h-10 w-10 text-yellow-500 mx-auto" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">{leaderboard[0]?.name}</h3>
                <p className="text-yellow-600 dark:text-yellow-400 font-semibold mb-2">1st Place</p>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{leaderboard[0]?.score.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{leaderboard[0]?.solvedCount} solved</div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="order-3 md:order-3">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center transform hover:scale-105 transition-transform">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{leaderboard[2]?.avatar}</span>
                  </div>
                </div>
                <div className="mb-2">
                  <StarIcon className="h-8 w-8 text-amber-600 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">{leaderboard[2]?.name}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">3rd Place</p>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{leaderboard[2]?.score.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{leaderboard[2]?.solvedCount} solved</div>
              </div>
            </div>
          </div>
        )}

        {/* Full Leaderboard Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Full Rankings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Developer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Solved
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {leaderboard.map((user) => (
                  <tr
                    key={user.address}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      user.isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getRankBadge(user.rank)}`}>
                          {getRankIcon(user.rank)}
                        </div>
                        {user.isCurrentUser && (
                          <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-medium">(You)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-sm font-bold text-white">{user.avatar}</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">{user.address}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">
                        {user.score.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {user.solvedCount} problems
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Ready to Climb the Ranks?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              Start solving challenges and earn your place among the top Web3 developers. Every solved problem brings you closer to the top!
            </p>
            <Link
              href="/problems"
              className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center shadow-lg"
            >
              Start Coding
              <ArrowLeftIcon className="ml-2 h-5 w-5 rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}