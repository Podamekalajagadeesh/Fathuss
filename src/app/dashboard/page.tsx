'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrophyIcon, ClockIcon, ArrowRightIcon, CodeBracketIcon, StarIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Logo from '../../components/Logo'
import { fetchLeaderboard, fetchSolvedChallenges, fetchCurrentUser, fetchUserAchievements, fetchUserLevel, fetchDailyChallenge } from '@/lib/api'

export default function Dashboard() {
  const [recentlySolved, setRecentlySolved] = useState<{ id: number; title: string; difficulty: string; solvedAt: string }[]>([])
  const [leaderboardPreview, setLeaderboardPreview] = useState<{ rank: number; name: string; score: number; avatar: string; isCurrentUser?: boolean }[]>([])
  const [userAchievements, setUserAchievements] = useState<any[]>([])
  const [userLevel, setUserLevel] = useState<any>(null)
  const [dailyChallenge, setDailyChallenge] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch current user
        const currentUser = await fetchCurrentUser()

        // Fetch recently solved problems for the user
        const solvedData = await fetchSolvedChallenges(currentUser.address)
        const recentlySolved = solvedData.solvedChallenges.slice(0, 5).map((challenge: any) => ({
          id: challenge.id,
          title: challenge.title,
          difficulty: challenge.difficulty,
          solvedAt: new Date(challenge.solvedAt).toLocaleDateString()
        }))

        setRecentlySolved(recentlySolved)

        // Fetch user achievements
        const achievements = await fetchUserAchievements(currentUser.address)
        setUserAchievements(achievements.achievements.slice(0, 6)) // Show latest 6 achievements

        // Fetch user level
        const level = await fetchUserLevel(currentUser.address)
        setUserLevel(level)

        // Fetch daily challenge
        try {
          const daily = await fetchDailyChallenge()
          setDailyChallenge(daily)
        } catch (error) {
          console.log('Daily challenge not available')
        }

        const leaderboardData = await fetchLeaderboard()
        // Assuming leaderboardData is an array with rank, name, score, etc.
        setLeaderboardPreview(leaderboardData.slice(0, 5).map((user, index) => ({
          rank: index + 1,
          name: user.username || user.address.substring(0, 6) + '...',
          score: user.totalPoints,
          avatar: user.username ? user.username.charAt(0).toUpperCase() : 'U',
          isCurrentUser: user.address.toLowerCase() === currentUser.address.toLowerCase()
        })))
      } catch (error) {
        console.error('Failed to fetch data:', error)
        // Fallback to mock data
        setRecentlySolved([
          { id: 1, title: 'Two Sum', difficulty: 'Easy', solvedAt: '2 hours ago' },
          { id: 2, title: 'Valid Parentheses', difficulty: 'Easy', solvedAt: '1 day ago' },
          { id: 3, title: 'Merge Two Sorted Lists', difficulty: 'Easy', solvedAt: '2 days ago' },
        ])
        setLeaderboardPreview([
          { rank: 1, name: 'Alice', score: 2450, avatar: 'A' },
          { rank: 2, name: 'Bob', score: 2380, avatar: 'B' },
          { rank: 3, name: 'Charlie', score: 2320, avatar: 'C' },
          { rank: 4, name: 'You', score: 2280, avatar: 'Y', isCurrentUser: true },
          { rank: 5, name: 'Diana', score: 2250, avatar: 'D' },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <Logo />
              </Link>
            </div>
            <nav className="hidden md:flex space-x-8">
              <Link href="/dashboard" className="text-indigo-600 border-b-2 border-indigo-600 pb-1">
                Dashboard
              </Link>
              <Link href="/problems" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                Problems
              </Link>
              <Link href="/leaderboard" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
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
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome back!</h1>
          <p className="text-gray-600 dark:text-gray-400">Ready to tackle some coding challenges?</p>
        </div>

        {/* CTA: Start Solving */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl p-8 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Start Solving</h2>
              <p className="text-blue-100 mb-4">Jump into a new challenge and improve your skills</p>
              <Link
                href="/problems"
                className="bg-white text-blue-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-semibold inline-flex items-center transition-colors"
              >
                Browse Problems
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
            </div>
            <div className="hidden md:block">
              <CodeBracketIcon className="h-24 w-24 text-blue-200" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recently Solved Problems */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center mb-6">
              <CheckCircleIcon className="h-6 w-6 text-green-500 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Recently Solved</h3>
            </div>
            <div className="space-y-4">
              {recentlySolved.map((problem) => (
                <div key={problem.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <Link href={`/problems/${problem.id}`} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">
                      {problem.title}
                    </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{problem.solvedAt}</p>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    problem.difficulty === 'Easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    problem.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {problem.difficulty}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href="/problems"
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
              >
                View all solved problems →
              </Link>
            </div>
          </div>

          {/* Level & XP */}
          {userLevel && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center mb-6">
                <StarIcon className="h-6 w-6 text-yellow-500 mr-2" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Level Progress</h3>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">Level {userLevel.level}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {userLevel.experiencePoints} / {userLevel.nextLevelXP} XP
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${userLevel.progressPercent}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {userLevel.xpToNext} XP to next level
                </div>
                <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                  Reputation: {userLevel.reputation} points
                </div>
              </div>
            </div>
          )}

          {/* Achievements */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center mb-6">
              <TrophyIcon className="h-6 w-6 text-purple-500 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Achievements</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {userAchievements.length > 0 ? userAchievements.map((achievement) => (
                <div key={achievement.id} className="flex flex-col items-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-lg font-bold mb-2">
                    {achievement.name.charAt(0)}
                  </div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white text-center">{achievement.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">{achievement.description}</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-2 ${
                    achievement.rarity === 'common' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                    achievement.rarity === 'rare' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                    achievement.rarity === 'epic' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {achievement.rarity}
                  </span>
                </div>
              )) : (
                <div className="col-span-2 text-center py-8">
                  <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No achievements earned yet</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Complete challenges to earn achievements!</p>
                </div>
              )}
            </div>
            {userAchievements.length > 4 && (
              <div className="mt-6 text-center">
                <button className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">
                  View all achievements →
                </button>
              </div>
            )}
          </div>

          {/* Daily Challenge */}
          {dailyChallenge && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center mb-6">
                <ClockIcon className="h-6 w-6 text-green-500 mr-2" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Daily Challenge</h3>
              </div>
              <div className="text-center">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{dailyChallenge.title}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{dailyChallenge.description}</p>
                <div className="mb-4">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {dailyChallenge.progress} / {dailyChallenge.target}
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (dailyChallenge.progress / dailyChallenge.target) * 100)}%` }}
                    ></div>
                  </div>
                </div>
                {dailyChallenge.completed && !dailyChallenge.claimed && (
                  <button className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:from-green-600 hover:to-blue-600 transition-colors">
                    Claim {dailyChallenge.rewardXP} XP + {dailyChallenge.rewardPoints} Points
                  </button>
                )}
                {dailyChallenge.claimed && (
                  <div className="text-green-600 dark:text-green-400 font-medium">✓ Completed & Claimed!</div>
                )}
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center mb-6">
              <TrophyIcon className="h-6 w-6 text-yellow-500 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Leaderboard</h3>
            </div>
            <div className="space-y-3">
              {leaderboardPreview.map((user) => (
                <div key={user.rank} className={`flex items-center justify-between p-3 rounded-lg ${
                  user.isCurrentUser ? 'bg-indigo-50 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700' : 'bg-gray-50 dark:bg-gray-700'
                }`}>
                  <div className="flex items-center">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full mr-3 ${
                      user.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                      user.rank === 2 ? 'bg-gray-100 text-gray-800' :
                      user.rank === 3 ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {user.rank <= 3 ? (
                        <TrophyIcon className="h-4 w-4" />
                      ) : (
                        <span className="text-sm font-medium">{user.rank}</span>
                      )}
                    </div>
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-medium mr-3">
                      {user.avatar}
                    </div>
                    <span className={`font-medium ${user.isCurrentUser ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                      {user.name}
                    </span>
                    {user.isCurrentUser && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 px-2 py-1 rounded-full">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600 dark:text-gray-400 font-medium">{user.score}</span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href="/leaderboard"
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
              >
                View full leaderboard →
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-lg">
                <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Problems Solved</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">42</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-lg">
                <StarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Current Streak</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">7 days</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="bg-yellow-100 dark:bg-yellow-900 p-3 rounded-lg">
                <TrophyIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Global Rank</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">#4</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}