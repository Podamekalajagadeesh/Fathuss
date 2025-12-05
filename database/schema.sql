-- Fathuss Database Schema
-- This file contains the core database schema for the Fathuss platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255),
    display_name VARCHAR(50) UNIQUE,
    xp INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 1,
    github_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
    tags TEXT[],
    author_id UUID REFERENCES users(id),
    version INTEGER DEFAULT 1,
    ipfs_manifest_cid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge versions table
CREATE TABLE IF NOT EXISTS challenge_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID REFERENCES challenges(id),
    content_cid VARCHAR(100),
    tests_cid VARCHAR(100),
    fixtures_cid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'))
);

-- Jobs (submissions) table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    challenge_id UUID REFERENCES challenges(id),
    language VARCHAR(50),
    code_blob_uri VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    score DECIMAL(5,2),
    gas_used INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Leaderboard entries table
CREATE TABLE IF NOT EXISTS leaderboard_entries (
    user_id UUID REFERENCES users(id),
    challenge_id UUID REFERENCES challenges(id),
    best_score DECIMAL(5,2),
    fastest_time INTEGER, -- in milliseconds
    best_gas INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, challenge_id)
);

-- Audit traces table
CREATE TABLE IF NOT EXISTS audit_traces (
    job_id UUID PRIMARY KEY REFERENCES jobs(id),
    trace_uri VARCHAR(255),
    replayable_bundle_uri VARCHAR(255)
);

-- Payments / marketplace table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES users(id),
    amount DECIMAL(10,2),
    split DECIMAL(5,2), -- percentage or something
    minted_nft_contract VARCHAR(42),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_challenges_slug ON challenges(slug);
CREATE INDEX IF NOT EXISTS idx_challenges_difficulty ON challenges(difficulty);
CREATE INDEX IF NOT EXISTS idx_challenges_author_id ON challenges(author_id);
CREATE INDEX IF NOT EXISTS idx_challenge_versions_challenge_id ON challenge_versions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_versions_status ON challenge_versions(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_challenge_id ON jobs(challenge_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user_id ON leaderboard_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_challenge_id ON leaderboard_entries(challenge_id);
CREATE INDEX IF NOT EXISTS idx_audit_traces_job_id ON audit_traces(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_author_id ON payments(author_id);
CREATE INDEX IF NOT EXISTS idx_jobs_poster ON jobs(poster_id);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant ON job_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_hash ON file_metadata(ipfs_hash);
CREATE INDEX IF NOT EXISTS idx_file_metadata_type ON file_metadata(file_type);