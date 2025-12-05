'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrophyIcon, ClockIcon, ArrowRightIcon, SparklesIcon, CpuChipIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import MonacoEditor from '../components/MonacoEditor'
import Logo from '../components/Logo'

export default function Home() {
  const sampleCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleToken {
    string public name = "Fathuss Token";
    string public symbol = "FTS";
    uint256 public totalSupply = 1000000;
    mapping(address => uint256) public balanceOf;

    constructor() {
        balanceOf[msg.sender] = totalSupply;
    }

    function transfer(address to, uint256 amount) public {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white text-gray-900">
      <header className="bg-gradient-to-br from-blue-50/50 to-white/80 backdrop-blur-sm border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <Logo />
              </Link>
            </div>
            <nav className="hidden md:flex space-x-8">
              <Link href="/problems" className="text-gray-700 hover:text-indigo-600">
                Problems
              </Link>
              <Link href="/leaderboard" className="text-gray-700 hover:text-indigo-600">
                Leaderboard
              </Link>
              <Link href="/about" className="text-gray-700 hover:text-indigo-600">
                About
              </Link>
            </nav>
          </div>
        </div>
      </header>
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100/50 to-cyan-100/50"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
              <MonacoEditor
                value={sampleCode}
                onChange={() => {}}
                language="sol"
                height="400px"
                theme="vs-light"
              />
            </div>
            <div>
              <div className="inline-flex items-center bg-blue-100 border border-blue-200 rounded-full px-4 py-2 mb-6">
                <SparklesIcon className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-blue-700 font-medium">Web3 Practice Platform</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-bold mb-6">
                <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent">
                  Code the Future
                </span>
                <br />
                <span className="text-gray-900">of Blockchain</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl leading-relaxed">
                Master Web3 development through interactive coding challenges. Build smart contracts, earn NFTs, and join the decentralized revolution.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/problems"
                  className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center shadow-lg"
                >
                  Start Coding
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  href="/about"
                  className="border border-blue-400/50 hover:border-blue-400 text-blue-600 hover:text-blue-700 px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
                >
                  Explore Platform
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Developers Choose Fathuss</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Experience cutting-edge Web3 development with our comprehensive challenge platform.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-8 hover:bg-white transition-all shadow-lg">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-lg w-fit mb-6">
                <CpuChipIcon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">Smart Contract Mastery</h3>
              <p className="text-gray-600 leading-relaxed">
                Write, test, and deploy smart contracts across multiple blockchains. From ERC-20 to complex DeFi protocols.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-8 hover:bg-white transition-all shadow-lg">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-lg w-fit mb-6">
                <TrophyIcon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">NFT Rewards</h3>
              <p className="text-gray-600 leading-relaxed">
                Earn unique NFT certificates for completed challenges. Showcase your Web3 expertise on-chain.
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-8 hover:bg-white transition-all shadow-lg">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-lg w-fit mb-6">
                <ClockIcon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">Real-Time Feedback</h3>
              <p className="text-gray-600 leading-relaxed">
                Instant code analysis and automated testing. Learn from mistakes with detailed explanations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Code the Future?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join the Web3 revolution. Start solving challenges and build your blockchain expertise today.
          </p>
          <Link
            href="/problems"
            className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center shadow-lg"
          >
            Begin Your Journey
            <ArrowRightIcon className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 backdrop-blur-sm border-t border-gray-200 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Logo />
              </div>
              <p className="text-gray-600">The ultimate Web3 coding practice platform for blockchain developers.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform</h3>
              <ul className="space-y-2">
                <li><Link href="/problems" className="text-gray-600 hover:text-blue-600 transition-colors">Challenges</Link></li>
                <li><Link href="/leaderboard" className="text-gray-600 hover:text-blue-600 transition-colors">Leaderboard</Link></li>
                <li><Link href="/about" className="text-gray-600 hover:text-blue-600 transition-colors">About</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">Documentation</a></li>
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">API Reference</a></li>
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Community</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">Discord</a></li>
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">Twitter</a></li>
                <li><a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 mt-8 pt-8 text-center">
            <p className="text-gray-600">© 2025 Fathuss. Building the future of Web3 development.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}