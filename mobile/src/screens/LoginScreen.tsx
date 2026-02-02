import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [address, setAddress] = useState('');
  const [signature, setSignature] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleWalletConnect = async () => {
    if (!address.trim()) {
      Alert.alert('Error', 'Please enter your wallet address');
      return;
    }

    if (!signature.trim()) {
      Alert.alert('Error', 'Please enter your signature');
      return;
    }

    setIsConnecting(true);
    try {
      await login(address.trim(), signature.trim());
      // Navigation will be handled by the auth context
    } catch (error) {
      console.error('Login failed:', error);
      Alert.alert('Login Failed', 'Invalid credentials. Please check your address and signature.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDemoLogin = async () => {
    // Demo credentials for testing
    const demoAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const demoSignature = '0x1234567890abcdef';

    setIsConnecting(true);
    try {
      await login(demoAddress, demoSignature);
    } catch (error) {
      console.error('Demo login failed:', error);
      Alert.alert('Demo Login Failed', 'Please try manual login or check if the backend is running.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="shield-checkmark" size={64} color="#3B82F6" />
        </View>
        <Text style={styles.title}>Welcome to Fathuss</Text>
        <Text style={styles.subtitle}>Connect your wallet to start solving challenges</Text>
      </View>

      {/* Login Form */}
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Wallet Address</Text>
          <TextInput
            style={styles.input}
            placeholder="0x..."
            placeholderTextColor="#9CA3AF"
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Signature</Text>
          <TextInput
            style={styles.input}
            placeholder="Signature from wallet..."
            placeholderTextColor="#9CA3AF"
            value={signature}
            onChangeText={setSignature}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
          onPress={handleWalletConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="wallet" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.connectButtonText}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </Text>
        </TouchableOpacity>

        {/* Demo Login */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.demoButton, isConnecting && styles.demoButtonDisabled]}
          onPress={handleDemoLogin}
          disabled={isConnecting}
        >
          <Ionicons name="play-circle" size={20} color="#3B82F6" />
          <Text style={styles.demoButtonText}>Try Demo</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By connecting, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#1F2937',
    padding: 40,
    paddingTop: 80,
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  form: {
    flex: 1,
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  connectButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    paddingHorizontal: 16,
    color: '#6B7280',
    fontSize: 14,
  },
  demoButton: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  demoButtonDisabled: {
    borderColor: '#D1D5DB',
  },
  demoButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});