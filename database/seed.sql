-- Fathuss Database Seed Data
-- Basic challenges for Phase 1 MVP
-- Updated to match Prisma schemas

-- Insert sample users (matching user-service Prisma schema)
INSERT INTO users (id, address, username, email, level, experience_points, total_score, challenges_completed, reputation, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440000', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'alice_dev', 'alice@example.com', 2, 150, 285.5, 3, 95, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440001', '0x742d35Cc6634C0532925a3b844Bc454e4438f44f', 'bob_coder', 'bob@example.com', 3, 200, 412.25, 5, 120, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440002', '0x742d35Cc6634C0532925a3b844Bc454e4438f44a', 'charlie_hacker', 'charlie@example.com', 1, 75, 87.25, 1, 45, NOW(), NOW());

-- Insert sample challenges (matching challenge-service Prisma schema)
INSERT INTO challenges (id, slug, title, description, short_description, category, difficulty, points, time_limit, memory_limit, tags, is_active, created_by, created_at, updated_at) VALUES
('660e8400-e29b-41d4-a716-446655440000', 'two-sum', 'Two Sum', 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.', 'Find two numbers that add up to target', 'Algorithms', 'beginner', 100, 30, 128, ARRAY['array', 'hash-table'], true, '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440001', 'reverse-string', 'Reverse String', 'Write a function that reverses a string. The input string is given as an array of characters s. You must do this by modifying the input array in-place with O(1) extra memory.', 'Reverse the input string in-place', 'Algorithms', 'beginner', 100, 30, 128, ARRAY['string', 'two-pointers'], true, '0x742d35Cc6634C0532925a3b844Bc454e4438f44f', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440002', 'fibonacci', 'Fibonacci Number', 'The Fibonacci numbers, commonly denoted F(n) form a sequence, called the Fibonacci sequence, such that each number is the sum of the two preceding ones, starting from F(0) = 0 and F(1) = 1.', 'Calculate the nth Fibonacci number', 'Algorithms', 'intermediate', 150, 30, 128, ARRAY['math', 'dynamic-programming', 'recursion'], true, '0x742d35Cc6634C0532925a3b844Bc454e4438f44a', NOW(), NOW());

-- Insert challenge versions (matching challenge-service Prisma schema)
INSERT INTO challenge_versions (id, challenge_id, version, title, description, starter_code, is_published, published_at, created_by, created_at, updated_at) VALUES
('770e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 1, 'Two Sum', 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.', 'function twoSum(nums, target) {
    // Your code here
    // return [index1, index2];
}', true, NOW(), '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 1, 'Reverse String', 'Write a function that reverses a string. The input string is given as an array of characters s.', 'function reverseString(s) {
    // Your code here - modify s in-place
}', true, NOW(), '0x742d35Cc6634C0532925a3b844Bc454e4438f44f', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440002', 1, 'Fibonacci Number', 'The Fibonacci numbers, commonly denoted F(n) form a sequence, called the Fibonacci sequence, such that each number is the sum of the two preceding ones.', 'function fib(n) {
    // Your code here
    // return the nth fibonacci number
}', true, NOW(), '0x742d35Cc6634C0532925a3b844Bc454e4438f44a', NOW(), NOW());

-- Insert sample submissions (matching challenge-service Prisma schema)
INSERT INTO submissions (id, challenge_id, version_id, user_id, code, language, status, score, max_score, execution_time, memory_used, submitted_at, completed_at) VALUES
('880e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440000', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'function twoSum(nums, target) { const map = new Map(); for (let i = 0; i < nums.length; i++) { const complement = target - nums[i]; if (map.has(complement)) return [map.get(complement), i]; map.set(nums[i], i); } return []; }', 'javascript', 'completed', 100.0, 100, 15, 24576, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
('880e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', '0x742d35Cc6634C0532925a3b844Bc454e4438f44f', 'function reverseString(s) { let left = 0, right = s.length - 1; while (left < right) { [s[left], s[right]] = [s[right], s[left]]; left++; right--; } }', 'javascript', 'completed', 95.0, 100, 12, 20480, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
('880e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', '0x742d35Cc6634C0532925a3b844Bc454e4438f44a', 'function fib(n) { if (n <= 1) return n; let prev = 0, curr = 1; for (let i = 2; i <= n; i++) { const next = prev + curr; prev = curr; curr = next; } return curr; }', 'javascript', 'completed', 142.5, 150, 8, 18432, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours');