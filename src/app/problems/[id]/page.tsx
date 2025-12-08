'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, PlayIcon, PaperAirplaneIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import MonacoEditor from '@/components/MonacoEditor'
import { fetchChallenge, submitChallenge } from '@/lib/api'

interface ProblemPageProps {
  params: Promise<{ id: string }>
}

export default function ProblemDetails({ params }: ProblemPageProps) {
  const router = useRouter()
  const [code, setCode] = useState(`// Write your solution here`)
  const [language, setLanguage] = useState('javascript')
  const [theme, setTheme] = useState('vs-dark')
  const [activeTab, setActiveTab] = useState('description')
  const [activeConsoleTab, setActiveConsoleTab] = useState('output')
  const [inputData, setInputData] = useState('')
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [problem, setProblem] = useState(null)
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
    if (!id) return
    const loadProblem = async () => {
      try {
        const data = await fetchChallenge(id)
        setProblem(data)
      } catch (error) {
        console.error('Failed to fetch problem:', error)
        setProblem(null)
      } finally {
        setLoading(false)
      }
    }
    loadProblem()
  }, [id])

  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'solidity', label: 'Solidity' }
  ]

  const themes = [
    { value: 'vs-light', label: 'Light' },
    { value: 'vs-dark', label: 'Dark' }
  ]

  const handleRunCode = async () => {
    setIsRunning(true)
    setOutput('')

    // Execution delay
    setTimeout(() => {
      setOutput(`Running ${language} code...

Test Case 1:
Input: nums = [2,7,11,15], target = 9
Expected: [0,1]
Your Output: [0,1]
✓ Passed

Test Case 2:
Input: nums = [3,2,4], target = 6
Expected: [1,2]
Your Output: [1,2]
✓ Passed

Test Case 3:
Input: nums = [3,3], target = 6
Expected: [0,1]
Your Output: [0,1]
✓ Passed

All tests passed! 🎉

Execution time: 12ms
Memory used: 8.2MB`)
      setIsRunning(false)
    }, 2000)
  }

  const handleSubmitCode = async () => {
    try {
      const result = await submitChallenge(id, code)
      // Assuming result has submissionId or something
      router.push(`/problems/${id}/results?submission=${result.submissionId}`)
    } catch (error) {
      console.error('Submission failed:', error)
      alert('Submission failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </main>
    )
  }

  if (!problem) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Problem Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            The challenge you're looking for doesn't exist.
          </p>
          <Link
            href="/problems"
            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-3 rounded-lg font-semibold inline-flex items-center transition-all"
          >
            <ArrowLeftIcon className="ml-2 h-5 w-5 rotate-180 mr-2" />
            Back to Problems
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Link href="/problems" className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Back to Problems
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Problem Description */}
          <div className="space-y-6">
            {/* Problem Header */}
            <div>
              <div className="flex items-center gap-4 mb-4">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{problem.title}</h1>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  problem.difficulty === 'Easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  problem.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {problem.difficulty}
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">Topic: {problem.topic}</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                {['description', 'examples', 'constraints'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                      activeTab === tab
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {activeTab === 'description' && (
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{problem.description}</p>
                </div>
              )}

              {activeTab === 'examples' && (
                <div className="space-y-6">
                  {problem.examples.map((example, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Example {index + 1}:</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Input:</span>
                          <code className="ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                            {example.input}
                          </code>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Output:</span>
                          <code className="ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                            {example.output}
                          </code>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Explanation:</span>
                          <p className="ml-2 text-gray-600 dark:text-gray-400 mt-1">{example.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'constraints' && (
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Constraints:</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                    {problem.constraints.map((constraint, index) => (
                      <li key={index}>{constraint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Code Editor */}
          <div className="space-y-4">
            {/* Editor Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {languages.map(lang => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>

                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {themes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRunCode}
                  disabled={isRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md text-sm font-medium transition-colors"
                >
                  <PlayIcon className="h-4 w-4" />
                  {isRunning ? 'Running...' : 'Run'}
                </button>

                <button
                  onClick={handleSubmitCode}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Submit
                </button>
              </div>
            </div>

            {/* Code Editor */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <MonacoEditor
                value={code}
                onChange={(value) => setCode(value || '')}
                language={language}
                height="500px"
                theme={theme}
              />
            </div>

            {/* Output/Console */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Console</h3>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setActiveConsoleTab('input')}
                      className={`px-3 py-1 text-xs font-medium rounded ${
                        activeConsoleTab === 'input'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      Input
                    </button>
                    <button
                      onClick={() => setActiveConsoleTab('output')}
                      className={`px-3 py-1 text-xs font-medium rounded ${
                        activeConsoleTab === 'output'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      Output
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-black text-green-400 p-4 font-mono text-sm min-h-[200px]">
                {activeConsoleTab === 'input' ? (
                  <textarea
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                    placeholder="Enter your test input here..."
                    className="w-full h-full bg-transparent text-green-400 font-mono text-sm resize-none focus:outline-none"
                    style={{ minHeight: '200px' }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {output || 'Click "Run" to execute your code...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}