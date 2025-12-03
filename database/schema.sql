-- Fathuss Database Schema
-- This file contains the core database schema for the Fathuss platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    level INTEGER DEFAULT 1,
    experience_points INTEGER DEFAULT 0,
    total_score DECIMAL(10,2) DEFAULT 0,
    challenges_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
    category VARCHAR(50),
    language VARCHAR(50),
    time_limit INTEGER, -- in seconds
    memory_limit INTEGER, -- in MB
    test_cases JSONB,
    solution_template TEXT,
    hints JSONB,
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID REFERENCES challenges(id),
    user_id UUID REFERENCES users(id),
    code TEXT NOT NULL,
    language VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    score DECIMAL(5,2),
    execution_time INTEGER, -- in milliseconds
    memory_used INTEGER, -- in KB
    error_message TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    challenge_id UUID REFERENCES challenges(id),
    score DECIMAL(5,2) NOT NULL,
    rank INTEGER,
    category VARCHAR(50),
    period VARCHAR(20) CHECK (period IN ('daily', 'weekly', 'monthly', 'all_time')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Marketplace items table
CREATE TABLE IF NOT EXISTS marketplace_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'ETH',
    item_type VARCHAR(50) CHECK (item_type IN ('nft', 'template', 'tool', 'service')),
    metadata JSONB,
    seller_id UUID REFERENCES users(id),
    buyer_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Jobs table (for hiring service)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    description TEXT,
    requirements TEXT[],
    salary_range VARCHAR(50),
    location VARCHAR(100),
    job_type VARCHAR(20) CHECK (job_type IN ('full_time', 'part_time', 'contract', 'freelance')),
    experience_level VARCHAR(20) CHECK (experience_level IN ('entry', 'mid', 'senior', 'expert')),
    tags TEXT[],
    poster_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job applications table
CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    applicant_id UUID REFERENCES users(id),
    cover_letter TEXT,
    resume_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected')),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- File metadata table (for IPFS storage)
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    ipfs_hash VARCHAR(100) UNIQUE NOT NULL,
    file_type VARCHAR(50), -- testcase, fixture, binary, etc.
    mime_type VARCHAR(100),
    size BIGINT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table (for additional session data if needed)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_challenges_difficulty ON challenges(difficulty);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);
CREATE INDEX IF NOT EXISTS idx_challenges_language ON challenges(language);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge_user ON submissions(challenge_id, user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_challenge ON leaderboard(challenge_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller ON marketplace_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX IF NOT EXISTS idx_jobs_poster ON jobs(poster_id);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant ON job_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_hash ON file_metadata(ipfs_hash);
CREATE INDEX IF NOT EXISTS idx_file_metadata_type ON file_metadata(file_type);