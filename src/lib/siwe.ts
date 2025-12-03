import { SiweMessage } from 'siwe'

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

export async function signInWithEthereum(address: string) {
  const message = await createSiweMessage(address, 'Sign in with Ethereum to Fathuss')
  // Here you would request the signature from the wallet
  // For now, return the message
  return message
}