# Fathuss Mobile App

A cross-platform React Native mobile application for the Fathuss Web3 challenge platform, built with Expo.

## Features

- **User Authentication**: Wallet-based login with signature verification
- **Challenge Discovery**: Browse and filter coding challenges by category and difficulty
- **Real-time Leaderboard**: View global rankings and user statistics
- **Challenge Submission**: Submit solutions with detailed explanations
- **User Profile**: Track progress, achievements, and personal stats
- **Daily Challenges**: Complete daily challenges for bonus rewards

## Tech Stack

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and build tools
- **TypeScript**: Type-safe development
- **React Navigation**: App navigation and routing
- **Axios**: HTTP client for API communication
- **AsyncStorage**: Local data persistence

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g @expo/cli`
- iOS Simulator (macOS) or Android Emulator

### Installation

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on device/emulator:
   - For iOS: Press `i` in the terminal or scan QR code with Camera app
   - For Android: Press `a` in the terminal or scan QR code with Expo Go app

## Project Structure

```
mobile/
├── src/
│   ├── contexts/
│   │   └── AuthContext.tsx      # Authentication state management
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Wallet connection screen
│   │   ├── HomeScreen.tsx       # Dashboard with user stats
│   │   ├── ChallengesScreen.tsx # Challenge browsing
│   │   ├── ChallengeDetailScreen.tsx # Individual challenge view
│   │   ├── SubmissionScreen.tsx # Solution submission
│   │   ├── LeaderboardScreen.tsx # Global rankings
│   │   └── ProfileScreen.tsx    # User profile and achievements
│   ├── services/
│   │   └── api.ts               # API integration layer
│   └── types/
│       └── index.ts             # TypeScript type definitions
├── App.tsx                      # Main app component with navigation
└── package.json
```

## API Integration

The app integrates with the Fathuss backend API for:

- User authentication and profile management
- Challenge data and submissions
- Leaderboard and statistics
- Achievement tracking

Configure the API base URL in `src/services/api.ts`.

## Authentication

The app uses wallet-based authentication:

1. User enters their wallet address
2. Signs a message to prove ownership
3. Receives JWT token for API access
4. Token stored securely in AsyncStorage

## Navigation

- **Tab Navigation**: Home, Challenges, Leaderboard, Profile
- **Stack Navigation**: Challenge details, submission forms
- **Authentication Flow**: Login screen when not authenticated

## Development

### Available Scripts

- `npm start`: Start Expo development server
- `npm run android`: Run on Android emulator
- `npm run ios`: Run on iOS simulator
- `npm run web`: Run in web browser (limited functionality)

### Code Style

- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- React Hooks for state management

## Deployment

### Build for Production

1. Configure `app.json` with your app details
2. Build for platforms:
   ```bash
   expo build:android
   expo build:ios
   ```

3. Submit to app stores:
   - Google Play Store for Android
   - Apple App Store for iOS

### Environment Variables

Create a `.env` file for environment-specific configuration:

```
API_BASE_URL=https://api.fathuss.com
```

## Contributing

1. Follow the existing code style
2. Write TypeScript types for new data structures
3. Test on both iOS and Android
4. Update documentation for new features

## Troubleshooting

### Common Issues

- **Metro bundler issues**: Clear cache with `expo r -c`
- **iOS build fails**: Ensure Xcode is up to date
- **Android build fails**: Check Android SDK versions
- **API connection issues**: Verify backend is running and accessible

### Performance

- Use FlatList for large lists
- Implement proper key props
- Optimize image loading
- Minimize bridge communication

## License

This project is part of the Fathuss platform. See main project license for details.