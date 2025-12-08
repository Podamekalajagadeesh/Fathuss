'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { signInWithEthereum, logout } from '@/lib/api'

export default function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const [isSigning, setIsSigning] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleConnect = async (connector: any) => {
    try {
      await connect({ connector })
    } catch (error) {
      console.error('Connection failed:', error)
    }
  }

  const handleSignIn = async () => {
    if (!address) return
    setIsSigning(true)
    try {
      await signInWithEthereum(address, signMessageAsync)
      setIsAuthenticated(true)
      console.log('Successfully signed in!')
    } catch (error) {
      console.error('SIWE failed:', error)
    } finally {
      setIsSigning(false)
    }
  }

  const handleLogout = () => {
    logout()
    setIsAuthenticated(false)
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <span>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
        {!isAuthenticated ? (
          <button
            onClick={handleSignIn}
            disabled={isSigning}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isSigning ? 'Signing...' : 'Sign In with Ethereum'}
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Signed In
          </button>
        )}
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => handleConnect(connector)}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Connect {connector.name}
        </button>
      ))}
    </div>
  )
}