import { SiweMessage } from 'siwe'
import { verifySiweSignature } from './api'

export async function createSiweMessage(address: string, statement: string) {
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement,
    uri: window.location.origin,
    version: '1',
    chainId: 1,
  })
  return message.prepareMessage()
}

export async function signInWithEthereum(address: string, signMessageAsync: (args: { message: string }) => Promise<string>) {
  const message = await createSiweMessage(address, 'Sign in with Ethereum to Fathuss')

  // Request signature from wallet
  const signature = await signMessageAsync({ message })

  // Verify with backend
  const result = await verifySiweSignature(message, signature)

  return result
}