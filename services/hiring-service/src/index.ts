import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4005;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Auth middleware (simplified)
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// Get job postings
app.get('/jobs', async (req, res) => {
  try {
    const { category, type, remote, page = 1, limit = 20 } = req.query;

    // TODO: Fetch from database
    const jobs = [
      {
        id: '1',
        title: 'Senior Smart Contract Developer',
        company: 'DeFi Protocol Inc',
        description: 'Develop and audit smart contracts for DeFi protocols',
        category: 'Smart Contracts',
        type: 'full-time',
        remote: true,
        location: 'Remote',
        salary: {
          min: 120000,
          max: 180000,
          currency: 'USD'
        },
        requirements: [
          '3+ years Solidity experience',
          'Experience with DeFi protocols',
          'Security audit experience preferred'
        ],
        skills: ['Solidity', 'Web3.js', 'Hardhat', 'Security'],
        postedBy: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        postedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true
      },
      {
        id: '2',
        title: 'Blockchain Security Researcher',
        company: 'Security Firm',
        description: 'Research and identify vulnerabilities in blockchain systems',
        category: 'Security',
        type: 'contract',
        remote: true,
        location: 'Remote',
        salary: {
          min: 150,
          max: 250,
          currency: 'USD',
          period: 'hour'
        },
        requirements: [
          'Strong background in cryptography',
          'Experience with security research',
          'CTF competition experience'
        ],
        skills: ['Cryptography', 'Reverse Engineering', 'Solidity', 'Rust'],
        postedBy: '0x8ba1f109551bD432803012645ac136ddd64DBA72',
        postedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true
      }
    ];

    res.json({
      jobs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: jobs.length
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get specific job
app.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    const job = {
      id,
      title: 'Senior Smart Contract Developer',
      company: 'DeFi Protocol Inc',
      description: 'We are looking for an experienced smart contract developer to join our team...',
      category: 'Smart Contracts',
      type: 'full-time',
      remote: true,
      location: 'Remote',
      salary: {
        min: 120000,
        max: 180000,
        currency: 'USD'
      },
      requirements: [
        '3+ years Solidity experience',
        'Experience with DeFi protocols',
        'Security audit experience preferred',
        'Strong understanding of gas optimization'
      ],
      skills: ['Solidity', 'Web3.js', 'Hardhat', 'Security', 'DeFi'],
      benefits: ['Competitive salary', 'Remote work', 'Health insurance', 'Token allocation'],
      postedBy: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      postedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    };

    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Apply for job
app.post('/jobs/:id/apply', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { coverLetter, portfolio, expectedSalary } = req.body;

    // TODO: Process application and notify employer
    const application = {
      id: 'application_' + Date.now(),
      jobId: id,
      applicant: (req as any).user.address,
      coverLetter,
      portfolio,
      expectedSalary,
      status: 'submitted',
      appliedAt: new Date().toISOString()
    };

    res.status(201).json(application);
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Get user applications
app.get('/applications', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // TODO: Fetch from database
    const applications = [
      {
        id: 'application_123',
        jobId: '1',
        jobTitle: 'Senior Smart Contract Developer',
        company: 'DeFi Protocol Inc',
        status: 'under_review',
        appliedAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      }
    ];

    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Post a job (for employers)
app.post('/jobs', authenticateToken, async (req, res) => {
  try {
    const jobData = req.body;

    // TODO: Validate and save to database
    const newJob = {
      id: 'job_' + Date.now(),
      ...jobData,
      postedBy: (req as any).user.address,
      postedAt: new Date().toISOString(),
      isActive: true
    };

    res.status(201).json(newJob);
  } catch (error) {
    console.error('Error posting job:', error);
    res.status(500).json({ error: 'Failed to post job' });
  }
});

// Get applications for a job (for employers)
app.get('/jobs/:id/applications', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Verify employer owns the job and fetch applications
    const applications = [
      {
        id: 'application_123',
        applicant: '0x1234567890123456789012345678901234567890',
        applicantProfile: {
          username: 'talented_dev',
          skills: ['Solidity', 'DeFi', 'Security'],
          experience: '4 years',
          completedChallenges: 45
        },
        coverLetter: 'I am very interested in this position...',
        portfolio: 'https://github.com/talented_dev',
        expectedSalary: 150000,
        status: 'pending',
        appliedAt: new Date().toISOString()
      }
    ];

    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Update application status
app.put('/applications/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;

    // TODO: Update application status
    const updatedApplication = {
      id,
      status,
      feedback,
      updatedAt: new Date().toISOString()
    };

    res.json(updatedApplication);
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

// Create private challenge room
app.post('/assessment/rooms', authenticateToken, async (req, res) => {
  try {
    const { jobId, candidateId, challenges, timeLimit, proctoringEnabled = false } = req.body;
    const recruiterId = (req as any).user.id;

    // Generate unique room ID
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const assessmentRoom = {
      id: roomId,
      jobId,
      recruiterId,
      candidateId,
      challenges,
      timeLimit, // in minutes
      proctoringEnabled,
      status: 'created',
      startTime: null,
      endTime: null,
      createdAt: new Date().toISOString(),
      accessCode: generateAccessCode()
    };

    // TODO: Store in database
    console.log('Assessment room created:', assessmentRoom);

    res.json({
      success: true,
      room: assessmentRoom,
      message: 'Assessment room created successfully'
    });
  } catch (error) {
    console.error('Error creating assessment room:', error);
    res.status(500).json({ error: 'Failed to create assessment room' });
  }
});

// Start assessment session
app.post('/assessment/rooms/:roomId/start', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = (req as any).user.id;

    // TODO: Verify user has access to this room
    // TODO: Check if room is in correct state

    const startTime = new Date();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      id: sessionId,
      roomId,
      userId,
      startTime: startTime.toISOString(),
      status: 'active',
      proctoringEvents: [],
      submissions: []
    };

    // TODO: Store session in database
    // TODO: If proctoring enabled, initialize monitoring

    res.json({
      success: true,
      session,
      message: 'Assessment session started'
    });
  } catch (error) {
    console.error('Error starting assessment session:', error);
    res.status(500).json({ error: 'Failed to start assessment session' });
  }
});

// Submit assessment answer
app.post('/assessment/rooms/:roomId/submit', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { challengeId, code, language } = req.body;
    const userId = (req as any).user.id;

    // TODO: Verify session is active and within time limits
    // TODO: Submit code to grader service

    const submission = {
      id: `submission_${Date.now()}`,
      roomId,
      challengeId,
      userId,
      code,
      language,
      submittedAt: new Date().toISOString(),
      status: 'submitted'
    };

    // TODO: Store submission and trigger grading

    res.json({
      success: true,
      submission,
      message: 'Submission received and queued for grading'
    });
  } catch (error) {
    console.error('Error submitting assessment answer:', error);
    res.status(500).json({ error: 'Failed to submit assessment answer' });
  }
});

// Proctoring event webhook
app.post('/assessment/proctoring/:sessionId/event', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { eventType, data, timestamp } = req.body;

    // TODO: Verify webhook signature if proctoring service provides it

    const proctoringEvent = {
      sessionId,
      eventType, // 'tab_switch', 'window_blur', 'copy_paste', 'suspicious_activity', etc.
      data,
      timestamp: timestamp || new Date().toISOString(),
      recordedAt: new Date().toISOString()
    };

    // TODO: Store proctoring event in database
    // TODO: Analyze event for potential cheating
    // TODO: Trigger alerts if suspicious activity detected

    console.log('Proctoring event recorded:', proctoringEvent);

    res.json({ success: true, message: 'Event recorded' });
  } catch (error) {
    console.error('Error recording proctoring event:', error);
    res.status(500).json({ error: 'Failed to record proctoring event' });
  }
});

// Get assessment results
app.get('/assessment/rooms/:roomId/results', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = (req as any).user.id;

    // TODO: Verify user has access to view results
    // TODO: Fetch results from database

    const results = {
      roomId,
      candidateId: userId,
      challenges: [
        {
          challengeId: 'challenge-1',
          score: 85,
          passed: true,
          timeSpent: 1200, // seconds
          attempts: 2,
          feedback: 'Good solution, minor optimization opportunities'
        },
        {
          challengeId: 'challenge-2',
          score: 92,
          passed: true,
          timeSpent: 1800,
          attempts: 1,
          feedback: 'Excellent solution with proper error handling'
        }
      ],
      overallScore: 88.5,
      totalTime: 3000,
      proctoringFlags: 0,
      completedAt: new Date().toISOString()
    };

    res.json(results);
  } catch (error) {
    console.error('Error fetching assessment results:', error);
    res.status(500).json({ error: 'Failed to fetch assessment results' });
  }
});

// Get active assessment rooms for recruiter
app.get('/assessment/rooms', authenticateToken, async (req, res) => {
  try {
    const recruiterId = (req as any).user.id;
    const { status = 'all' } = req.query;

    // TODO: Fetch from database
    const rooms = [
      {
        id: 'room_123',
        jobId: 'job_456',
        candidateId: 'candidate_789',
        status: 'active',
        timeLimit: 120,
        challengesCount: 3,
        startTime: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
    ];

    res.json({ rooms });
  } catch (error) {
    console.error('Error fetching assessment rooms:', error);
    res.status(500).json({ error: 'Failed to fetch assessment rooms' });
  }
});

// End assessment session
app.post('/assessment/rooms/:roomId/end', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = (req as any).user.id;

    // TODO: Verify user can end this session
    // TODO: Calculate final results
    // TODO: Clean up session data

    const endTime = new Date();
    const sessionSummary = {
      roomId,
      endedBy: userId,
      endTime: endTime.toISOString(),
      duration: 3600, // seconds
      finalScore: 88.5,
      status: 'completed'
    };

    res.json({
      success: true,
      session: sessionSummary,
      message: 'Assessment session ended successfully'
    });
  } catch (error) {
    console.error('Error ending assessment session:', error);
    res.status(500).json({ error: 'Failed to end assessment session' });
  }
});

// Helper function to generate access code
function generateAccessCode(): string {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'hiring-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Hiring Service running on port ${PORT}`);
});