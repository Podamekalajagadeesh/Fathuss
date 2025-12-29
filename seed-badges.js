# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "feat: implement badges system and hidden tests support

- Add badges table and user_badges table to database schema
- Implement badge awarding logic with XP rewards  
- Add hidden tests support to challenge versions
- Update grader to handle separate public and hidden test cases
- Add badge display to user dashboard with rarity indicators
- Create admin endpoint for seeding initial badges
- Update API endpoints for badge retrieval
- Add frontend badge fetching and display components

Completes Phase 1 MVP requirements for badges and hidden tests."

# Push to GitHub
git push origin mainconst { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedBadges() {
  console.log('🌱 Seeding badges...');

  const badges = [
    {
      id: 'first-solve',
      name: 'First Blood',
      description: 'Awarded for solving your first challenge',
      icon: '🏆',
      rarity: 'common',
      criteria: JSON.stringify({ type: 'first_solve' })
    },
    {
      id: 'speed-demon',
      name: 'Speed Demon',
      description: 'Solve a challenge in under 5 minutes',
      icon: '⚡',
      rarity: 'rare',
      criteria: JSON.stringify({ type: 'time_under', minutes: 5 })
    },
    {
      id: 'perfectionist',
      name: 'Perfectionist',
      description: 'Solve 10 challenges without any failed attempts',
      icon: '💎',
      rarity: 'epic',
      criteria: JSON.stringify({ type: 'streak_solves', count: 10 })
    },
    {
      id: 'hardcore',
      name: 'Hardcore',
      description: 'Solve 5 hard difficulty challenges',
      icon: '🔥',
      rarity: 'rare',
      criteria: JSON.stringify({ type: 'difficulty_solves', difficulty: 'hard', count: 5 })
    },
    {
      id: 'legend',
      name: 'Legend',
      description: 'Reach the top 10 on the leaderboard',
      icon: '👑',
      rarity: 'legendary',
      criteria: JSON.stringify({ type: 'leaderboard_position', position: 10 })
    }
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { id: badge.id },
      update: badge,
      create: badge
    });
  }

  console.log('✅ Badges seeded successfully!');
}

seedBadges()
  .catch(console.error)
  .finally(() => prisma.$disconnect());