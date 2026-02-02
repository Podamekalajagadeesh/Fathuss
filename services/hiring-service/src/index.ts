import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4005;
const prisma = new PrismaClient();

// Email configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Auth middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// Get all job postings with filters
app.get('/jobs', async (req: express.Request, res: express.Response) => {
  try {
    const { category, type, remote, featured, page = '1', limit = '20', search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause for filtering
    const where: any = { isActive: true };
    
    if (category) where.category = { contains: category as string, mode: 'insensitive' };
    if (type) where.type = type as string;
    if (remote !== undefined) where.remote = remote === 'true';
    if (featured) where.featured = featured === 'true';
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { company: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.jobPosting.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.jobPosting.count({ where })
    ]);

    res.json({
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job posting
app.get('/jobs/:id', async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    const job = await prisma.jobPosting.findUnique({
      where: { id },
      include: {
        applications: {
          select: { id: true, status: true },
          take: 1
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create new job posting
app.post('/jobs', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const {
      title,
      description,
      company,
      companyLogo,
      category,
      type,
      remote,
      location,
      salaryMin,
      salaryMax,
      currency,
      requiredSkills,
      preferredSkills,
      expiresAt
    } = req.body;

    if (!title || !description || !company || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const job = await prisma.jobPosting.create({
      data: {
        title,
        description,
        company,
        companyLogo: companyLogo || null,
        category,
        type: type || 'full-time',
        remote: remote !== false,
        location: location || null,
        salaryMin: salaryMin || null,
        salaryMax: salaryMax || null,
        currency: currency || 'USD',
        requiredSkills: requiredSkills || [],
        preferredSkills: preferredSkills || [],
        employerId: (req as any).user.id,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Update job posting
app.put('/jobs/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const job = await prisma.jobPosting.findUnique({ where: { id } });
    if (!job || job.employerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = await prisma.jobPosting.update({
      where: { id },
      data: req.body
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job posting
app.delete('/jobs/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const job = await prisma.jobPosting.findUnique({ where: { id } });
    if (!job || job.employerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.jobPosting.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ success: true, message: 'Job posting deleted' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Apply for a job
app.post('/jobs/:jobId/apply', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { jobId } = req.params;
    const { email, coverLetter, resumeUrl } = req.body;
    const applicantId = (req as any).user.id;

    const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const existing = await prisma.jobApplication.findUnique({
      where: { jobId_applicantId: { jobId, applicantId } }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already applied to this job' });
    }

    const application = await prisma.jobApplication.create({
      data: {
        jobId,
        applicantId,
        applicantEmail: email,
        coverLetter: coverLetter || null,
        resumeUrl: resumeUrl || null,
        status: 'pending'
      }
    });

    // Notify employer
    console.log(`New application for job ${job.title} from ${email}`);

    res.status(201).json(application);
  } catch (error) {
    console.error('Error applying for job:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Get user's applications
app.get('/applications', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const applicantId = (req as any).user.id;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { applicantId };
    if (status) where.status = status as string;

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        skip,
        take: limitNum,
        include: { job: true },
        orderBy: { appliedAt: 'desc' }
      }),
      prisma.jobApplication.count({ where })
    ]);

    res.json({
      applications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get single application
app.get('/applications/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { job: true, interviews: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.applicantId !== userId && application.job.employerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(application);
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// Update application status
app.put('/applications/:id/status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const userId = (req as any).user.id;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { job: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.job.employerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === 'rejected' ? rejectionReason : null,
        reviewedAt: new Date()
      }
    });

    console.log(`Application status updated to: ${status}`);

    res.json(updated);
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// Get applications for a job (employer view)
app.get('/jobs/:jobId/applications', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { jobId } = req.params;
    const userId = (req as any).user.id;
    const { status, page = '1', limit = '20' } = req.query;

    const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job || job.employerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { jobId };
    if (status) where.status = status as string;

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { appliedAt: 'desc' }
      }),
      prisma.jobApplication.count({ where })
    ]);

    res.json({
      applications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching job applications:', error);
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
});

// Schedule interview
app.post('/interviews', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const {
      applicationId,
      interviewType,
      scheduledAt,
      duration,
      proctoringEnabled,
      proctoringProvider
    } = req.body;
    const interviewerId = (req as any).user.id;

    if (!applicationId || !interviewType || !scheduledAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { job: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.job.employerId !== interviewerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const interview = await prisma.interviewSession.create({
      data: {
        jobId: application.jobId,
        applicationId,
        interviewType,
        scheduledAt: new Date(scheduledAt),
        duration: duration || 60,
        interviewer: interviewerId,
        proctoringEnabled: proctoringEnabled || false,
        proctoringProvider: proctoringProvider || null,
        status: 'scheduled'
      }
    });

    console.log(`Interview scheduled for ${new Date(scheduledAt).toLocaleString()}`);

    res.status(201).json(interview);
  } catch (error) {
    console.error('Error scheduling interview:', error);
    res.status(500).json({ error: 'Failed to schedule interview' });
  }
});

// Get interviews for user
app.get('/interviews', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user.id;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      OR: [
        { interviewer: userId },
        { application: { applicantId: userId } }
      ]
    };

    if (status) where.status = status as string;

    const [interviews, total] = await Promise.all([
      prisma.interviewSession.findMany({
        where,
        skip,
        take: limitNum,
        include: { application: true, job: true },
        orderBy: { scheduledAt: 'desc' }
      }),
      prisma.interviewSession.count({ where })
    ]);

    res.json({
      interviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// Get single interview
app.get('/interviews/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const interview = await prisma.interviewSession.findUnique({
      where: { id },
      include: { application: true, submissions: true, proctoringEvents: true }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interview.interviewer !== userId && interview.application.applicantId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(interview);
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

// Update interview status
app.put('/interviews/:id/status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { status, notes, score, feedback } = req.body;
    const userId = (req as any).user.id;

    const interview = await prisma.interviewSession.findUnique({ where: { id } });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interview.interviewer !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = await prisma.interviewSession.update({
      where: { id },
      data: {
        status,
        notes: notes || null,
        score: score || null,
        feedback: feedback || null,
        updatedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// Submit code for interview challenge
app.post('/interviews/:interviewId/submissions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { interviewId } = req.params;
    const { code, language } = req.body;
    const userId = (req as any).user.id;

    const interview = await prisma.interviewSession.findUnique({
      where: { id: interviewId },
      include: { application: true }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interview.application.applicantId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const submission = await prisma.codingSubmission.create({
      data: {
        interviewSessionId: interviewId,
        code,
        language,
        status: 'submitted'
      }
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error('Error submitting code:', error);
    res.status(500).json({ error: 'Failed to submit code' });
  }
});

// Get submissions for interview
app.get('/interviews/:interviewId/submissions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { interviewId } = req.params;
    const userId = (req as any).user.id;

    const interview = await prisma.interviewSession.findUnique({
      where: { id: interviewId },
      include: { application: true }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interview.interviewer !== userId && interview.application.applicantId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const submissions = await prisma.codingSubmission.findMany({
      where: { interviewSessionId: interviewId },
      orderBy: { submittedAt: 'asc' }
    });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Record proctoring event
app.post('/interviews/:interviewId/proctoring-event', async (req: express.Request, res: express.Response) => {
  try {
    const { interviewId } = req.params;
    const { eventType, description, severity, metadata } = req.body;

    const interview = await prisma.interviewSession.findUnique({
      where: { id: interviewId }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const proctoringEvent = await prisma.proctoringEvent.create({
      data: {
        interviewSessionId: interviewId,
        eventType,
        description,
        severity: severity || 'warning',
        metadata: metadata || null,
        flaggedForReview: severity === 'critical'
      }
    });

    res.status(201).json(proctoringEvent);
  } catch (error) {
    console.error('Error recording proctoring event:', error);
    res.status(500).json({ error: 'Failed to record proctoring event' });
  }
});

// Get proctoring events for interview
app.get('/interviews/:interviewId/proctoring-events', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { interviewId } = req.params;
    const userId = (req as any).user.id;

    const interview = await prisma.interviewSession.findUnique({
      where: { id: interviewId },
      include: { application: true }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (interview.interviewer !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const events = await prisma.proctoringEvent.findMany({
      where: { interviewSessionId: interviewId },
      orderBy: { timestamp: 'asc' }
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching proctoring events:', error);
    res.status(500).json({ error: 'Failed to fetch proctoring events' });
  }
});

// Get or create candidate profile
app.get('/candidate/profile', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user.id;

    let profile = await prisma.candidateProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.candidateProfile.create({
        data: { userId }
      });
    }

    res.json(profile);
  } catch (error) {
    console.error('Error fetching candidate profile:', error);
    res.status(500).json({ error: 'Failed to fetch candidate profile' });
  }
});

// Update candidate profile
app.put('/candidate/profile', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user.id;

    let profile = await prisma.candidateProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.candidateProfile.create({
        data: { userId, ...req.body }
      });
    } else {
      profile = await prisma.candidateProfile.update({
        where: { userId },
        data: req.body
      });
    }

    res.json(profile);
  } catch (error) {
    console.error('Error updating candidate profile:', error);
    res.status(500).json({ error: 'Failed to update candidate profile' });
  }
});

// Health check
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({
    status: 'OK',
    service: 'hiring-service',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down hiring service...');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Hiring Service running on port ${PORT}`);
});