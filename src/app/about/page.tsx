'use client'

import Link from 'next/link'
import {
  CodeBracketIcon,
  GlobeAltIcon,
  CpuChipIcon,
  TrophyIcon,
  ShieldCheckIcon,
  UsersIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'

export default function About() {
  const features = [
    {
      icon: CodeBracketIcon,
      title: 'Smart Contract Mastery',
      description: 'Master Solidity and Web3 development through hands-on coding challenges across multiple blockchain networks.'
    },
    {
      icon: TrophyIcon,
      title: 'NFT Rewards',
      description: 'Earn unique NFT certificates for completed challenges. Showcase your Web3 expertise with verifiable on-chain credentials.'
    },
    {
      icon: ShieldCheckIcon,
      title: 'Secure & Decentralized',
      description: 'Built on decentralized principles with secure smart contracts and transparent reward systems.'
    },
    {
      icon: UsersIcon,
      title: 'Community Driven',
      description: 'Join a thriving community of Web3 developers, share knowledge, and collaborate on cutting-edge projects.'
    }
  ]

  const stats = [
    { label: 'Active Developers', value: '10,000+', icon: UsersIcon },
    { label: 'Challenges Solved', value: '500,000+', icon: CheckCircleIcon },
    { label: 'NFTs Minted', value: '25,000+', icon: TrophyIcon },
    { label: 'Supported Chains', value: '5+', icon: GlobeAltIcon }
  ]

  const roadmap = [
    {
      phase: 'Phase 1',
      title: 'Foundation',
      status: 'completed',
      items: [
        'Core platform development',
        'Basic challenge system',
        'User authentication with SIWE',
        'Initial NFT reward system'
      ]
    },
    {
      phase: 'Phase 2',
      title: 'Expansion',
      status: 'completed',
      items: [
        'Multi-chain support',
        'Advanced challenge types',
        'Community features',
        'Enhanced UI/UX'
      ]
    },
    {
      phase: 'Phase 3',
      title: 'Innovation',
      status: 'in-progress',
      items: [
        'AI-powered code analysis',
        'Real-time collaboration',
        'Advanced gamification',
        'Cross-platform mobile app'
      ]
    },
    {
      phase: 'Phase 4',
      title: 'Ecosystem',
      status: 'planned',
      items: [
        'Decentralized governance',
        'Plugin ecosystem',
        'Enterprise solutions',
        'Global education partnerships'
      ]
    }
  ]

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
              <Link href="/leaderboard" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                Leaderboard
              </Link>
              <Link href="/about" className="text-indigo-600 border-b-2 border-indigo-600 pb-1">
                About
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center bg-blue-100 border border-blue-200 rounded-full px-4 py-2 mb-6">
            <SparklesIcon className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-blue-700 font-medium">About Fathuss</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent">
              Building the Future
            </span>
            <br />
            <span className="text-gray-900 dark:text-white">of Web3 Development</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Fathuss is the premier platform for Web3 developers to master smart contract development,
            earn NFT rewards, and join a thriving decentralized community.
          </p>
        </div>

        {/* Mission Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 md:p-12 mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                To democratize Web3 development education and create a meritocratic ecosystem where
                developers are rewarded for their skills and contributions to the decentralized future.
              </p>
              <div className="space-y-4">
                <div className="flex items-start">
                  <CheckCircleIcon className="h-6 w-6 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Free access to high-quality coding challenges</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="h-6 w-6 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Real-world blockchain development experience</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="h-6 w-6 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Verifiable credentials through NFT rewards</span>
                </div>
                <div className="flex items-start">
                  <CheckCircleIcon className="h-6 w-6 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Community-driven platform governance</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-8">
                <div className="grid grid-cols-2 gap-6">
                  {stats.map((stat, index) => (
                    <div key={index} className="text-center">
                      <stat.icon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why Choose Fathuss?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Experience the most comprehensive Web3 development platform
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 hover:shadow-xl transition-shadow">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-lg w-fit mb-6">
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Roadmap */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Our Roadmap
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Building the future of Web3 development, one milestone at a time
            </p>
          </div>
          <div className="space-y-8">
            {roadmap.map((phase, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                      phase.status === 'completed' ? 'bg-green-500' :
                      phase.status === 'in-progress' ? 'bg-blue-500' :
                      'bg-gray-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {phase.phase}: {phase.title}
                      </h3>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        phase.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        phase.status === 'in-progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {phase.status === 'completed' ? '✅ Completed' :
                         phase.status === 'in-progress' ? '🚧 In Progress' :
                         '📋 Planned'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {phase.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex items-center">
                      <CheckCircleIcon className={`h-5 w-5 mr-3 flex-shrink-0 ${
                        phase.status === 'completed' ? 'text-green-500' :
                        phase.status === 'in-progress' ? 'text-blue-500' :
                        'text-gray-400'
                      }`} />
                      <span className={`${
                        phase.status === 'completed' ? 'text-gray-700 dark:text-gray-300' :
                        phase.status === 'in-progress' ? 'text-gray-700 dark:text-gray-300' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 md:p-12 text-center text-white mb-16">
          <h2 className="text-4xl font-bold mb-6">
            Join Our Community
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Be part of the revolution in Web3 education. Whether you're a beginner or an expert,
            Fathuss has a place for you in building the decentralized future.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/problems"
              className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center shadow-lg"
            >
              Start Learning
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/leaderboard"
              className="border border-white/30 hover:border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-semibold text-lg transition-all"
            >
              View Leaderboard
            </Link>
          </div>
        </div>

        {/* Contact/Support */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Need Help?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Have questions about the platform or need support? We're here to help!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
            >
              📖 Documentation
            </a>
            <span className="text-gray-400 hidden sm:block">•</span>
            <a
              href="#"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
            >
              💬 Discord Community
            </a>
            <span className="text-gray-400 hidden sm:block">•</span>
            <a
              href="#"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
            >
              🐛 Report Issues
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}