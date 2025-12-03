'use client'

import { useState } from 'react'
import MonacoEditor from '@/components/MonacoEditor'
import WalletConnect from '@/components/WalletConnect'

export default function Home() {
  const [code, setCode] = useState('// Write your code here\nconsole.log("Hello, Fathuss!");')

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Fathuss Challenge Platform</h1>

        <div className="mb-8">
          <WalletConnect />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">Code Editor</h2>
            <MonacoEditor
              value={code}
              onChange={(value) => setCode(value || '')}
              language="javascript"
              height="500px"
            />
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4">Challenge Info</h2>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
              <p>Write JavaScript code to solve the challenge.</p>
              <p>Connect your wallet and submit your solution.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}