-- Create analytics database and tables for Fathuss platform

-- User activity events
CREATE TABLE IF NOT EXISTS user_events (
    event_id UUID DEFAULT generateUUIDv4(),
    user_id String,
    event_type String,
    event_data String,
    timestamp DateTime DEFAULT now(),
    user_agent String,
    ip_address String,
    session_id String
) ENGINE = MergeTree()
ORDER BY (user_id, timestamp)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- Challenge completion analytics
CREATE TABLE IF NOT EXISTS challenge_completions (
    completion_id UUID DEFAULT generateUUIDv4(),
    challenge_id String,
    user_id String,
    language String,
    score Float64,
    time_taken UInt32,
    attempts UInt32,
    completed_at DateTime DEFAULT now(),
    difficulty String,
    category String
) ENGINE = MergeTree()
ORDER BY (challenge_id, user_id, completed_at)
PARTITION BY toYYYYMM(completed_at)
TTL completed_at + INTERVAL 2 YEAR;

-- Grading job analytics
CREATE TABLE IF NOT EXISTS grading_jobs (
    job_id String,
    user_id String,
    challenge_id String,
    language String,
    worker_type String,
    status String,
    score Float64,
    execution_time UInt32,
    error_message String,
    submitted_at DateTime,
    completed_at DateTime,
    worker_id String
) ENGINE = MergeTree()
ORDER BY (submitted_at, user_id)
PARTITION BY toYYYYMM(submitted_at)
TTL submitted_at + INTERVAL 6 MONTH;

-- API usage metrics
CREATE TABLE IF NOT EXISTS api_metrics (
    metric_id UUID DEFAULT generateUUIDv4(),
    endpoint String,
    method String,
    status_code UInt16,
    response_time UInt32,
    user_id String,
    ip_address String,
    user_agent String,
    timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (endpoint, timestamp)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 3 MONTH;

-- Leaderboard snapshots
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    snapshot_id UUID DEFAULT generateUUIDv4(),
    user_id String,
    total_score Float64,
    challenges_completed UInt32,
    rank UInt32,
    snapshot_date Date,
    category String
) ENGINE = MergeTree()
ORDER BY (snapshot_date, category, rank)
PARTITION BY snapshot_date
TTL snapshot_date + INTERVAL 1 YEAR;

-- Marketplace transactions
CREATE TABLE IF NOT EXISTS marketplace_transactions (
    transaction_id UUID DEFAULT generateUUIDv4(),
    buyer_id String,
    seller_id String,
    item_id String,
    item_type String,
    price Float64,
    currency String,
    transaction_date DateTime DEFAULT now(),
    status String
) ENGINE = MergeTree()
ORDER BY (transaction_date, buyer_id)
PARTITION BY toYYYYMM(transaction_date)
TTL transaction_date + INTERVAL 2 YEAR;

-- File upload analytics
CREATE TABLE IF NOT EXISTS file_uploads (
    upload_id UUID DEFAULT generateUUIDv4(),
    user_id String,
    filename String,
    ipfs_hash String,
    file_type String,
    size UInt64,
    uploaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, uploaded_at)
PARTITION BY toYYYYMM(uploaded_at)
TTL uploaded_at + INTERVAL 1 YEAR;

-- File download analytics
CREATE TABLE IF NOT EXISTS file_downloads (
    download_id UUID DEFAULT generateUUIDv4(),
    ipfs_hash String,
    filename String,
    downloaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (downloaded_at, ipfs_hash)
PARTITION BY toYYYYMM(downloaded_at)
TTL downloaded_at + INTERVAL 6 MONTH;