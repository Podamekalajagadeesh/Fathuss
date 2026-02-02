'use client'

import { useState, useEffect } from 'react'
import { fetchSubmissionResult } from '@/lib/api'
import { XCircleIcon, CheckCircleIcon, ClockIcon, ArrowLeftIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface SubmissionResult {
  submissionId: string
  status: 'accepted' | 'wrong_answer' | 'time_limit_exceeded' | 'runtime_error' | 'pending'
  testCasesPassed: number
  totalTestCases: number
  executionTime: number
  memoryUsed: number
  errorMessage?: string
  testCaseResults: {
    input: string
    expectedOutput: string
    actualOutput: string
    passed: boolean
  }[]
}

interface ProblemResultsProps {
  params: Promise<{ id: string }>
}

export default function ProblemResults({ params }: ProblemResultsProps) {
  const searchParams = useSearchParams()
  const submissionId = searchParams.get('submission')
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [id, setId] = useState<string>('')

  useEffect(() => {
    const getId = async () => {
      const resolvedParams = await params
      setId(resolvedParams.id)
    }
    getId()
  }, [params])

  useEffect(() => {
    if (!submissionId) return

    const fetchResult = async () => {
      try {
        const result = await fetchSubmissionResult(submissionId)

        // Transform the API result to match the expected format
        const transformedResult: SubmissionResult = {
          submissionId: result.id,
          status: result.status === 'completed' ? (result.score >= 70 ? 'accepted' : 'wrong_answer') : result.status,
          testCasesPassed: result.score ? Math.floor((result.score / result.maxScore) * 10) : 0,
          totalTestCases: 10, // Default assumption
          executionTime: result.executionTime || 0,
          memoryUsed: result.memoryUsed || 0,
          testCaseResults: result.testResults ? result.testResults.map((test: any, index: number) => ({
            input: test.input || `Test Case ${index + 1}`,
            expectedOutput: test.expectedOutput || 'Expected output',
            actualOutput: test.actualOutput || 'Your output',
            passed: test.passed || false
          })) : []
        }

        setResult(transformedResult)
      } catch (error) {
        console.error('Failed to fetch result:', error)
        // If API fails, show error state
        setResult(null)
      } finally {
        setLoading(false)
      }
    }

    fetchResult()

    // Poll for updates if submission is still pending
    const pollInterval = setInterval(() => {
      if (result?.status === 'pending') {
        fetchResult()
      } else {
        clearInterval(pollInterval)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [submissionId, result?.status])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Evaluating your submission...</p>
        </div>
      </main>
    )
  }

  if (!result) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Result Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Unable to load submission results.</p>
          <Link
            href={`/problems/${id}`}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Back to Problem
          </Link>
        </div>
      </main>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200'
      case 'wrong_answer':
        return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200'
      case 'time_limit_exceeded':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200'
      case 'runtime_error':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-200'
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircleIcon className="h-6 w-6" />
      case 'wrong_answer':
      case 'time_limit_exceeded':
      case 'runtime_error':
        return <XCircleIcon className="h-6 w-6" />
      default:
        return <ClockIcon className="h-6 w-6" />
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Link href={`/problems/${id}`} className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Back to Problem
              </Link>
            </div>
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-2 rounded-lg">
                  <CodeBracketIcon className="h-6 w-6 text-white" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Result Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Submission Result</h1>
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(result.status)}`}>
              {getStatusIcon(result.status)}
              <span className="ml-2 capitalize">{result.status.replace('_', ' ')}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{result.testCasesPassed}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Tests Passed</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">out of {result.totalTestCases}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{result.executionTime}ms</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Execution Time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{result.memoryUsed}MB</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Memory Used</div>
            </div>
          </div>
        </div>

        {/* Test Case Results */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Test Case Results</h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {result.testCaseResults.map((testCase, index) => (
              <div key={index} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    {testCase.passed ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-red-500 mr-2" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">Test Case {index + 1}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    testCase.passed
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {testCase.passed ? 'Passed' : 'Failed'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Input</h4>
                    <code className="block bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm font-mono text-gray-900 dark:text-gray-100">
                      {testCase.input}
                    </code>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Expected Output</h4>
                    <code className="block bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm font-mono text-gray-900 dark:text-gray-100">
                      {testCase.expectedOutput}
                    </code>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Output</h4>
                    <code className={`block px-3 py-2 rounded text-sm font-mono ${
                      testCase.passed
                        ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {testCase.actualOutput}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 mt-8">
          <Link
            href={`/problems/${id}`}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Try Again
          </Link>
          <Link
            href="/problems"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Next Problem
          </Link>
        </div>
      </div>
    </main>
  )
}