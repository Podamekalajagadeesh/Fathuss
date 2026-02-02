import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import axios from 'axios';
import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4008;

// Initialize Redis for caching
let redisClient: RedisClientType | null = null;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '86400'); // 24 hours default

// Initialize Redis connection
async function initializeRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('✅ Redis connected for caching');
  } catch (error) {
    console.warn('⚠️  Redis connection failed, proceeding without cache:', error);
    redisClient = null;
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});
app.use(limiter);

// Auth middleware
const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  (req as any).user = { id: 'user-123', address: '0x...' };
  next();
};

// Interface for analysis response
interface CodeAnalysis {
  overallScore: number;
  codeQuality: {
    score: number;
    feedback: string[];
  };
  security: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
  performance: {
    score: number;
    suggestions: string[];
  };
  bestPractices: {
    score: number;
    violations: string[];
    recommendations: string[];
  };
  readability: {
    score: number;
    issues: string[];
  };
  summary: string;
  improvements: string[];
}

// ============ CACHING FUNCTIONS ============

/**
 * Generate cache key from code and parameters
 */
function generateCacheKey(code: string, language: string, analysisType: string = 'full'): string {
  const hash = crypto.createHash('sha256').update(code + language + analysisType).digest('hex');
  return `analysis:${language}:${analysisType}:${hash}`;
}

/**
 * Get cached analysis result
 */
async function getCachedAnalysis(cacheKey: string): Promise<CodeAnalysis | null> {
  if (!redisClient) return null;
  
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log('✅ Cache hit for:', cacheKey.substring(0, 50));
      return JSON.parse(cached) as CodeAnalysis;
    }
  } catch (error) {
    console.warn('⚠️  Cache retrieval error:', error);
  }
  
  return null;
}

/**
 * Store analysis result in cache
 */
async function cacheAnalysis(cacheKey: string, analysis: CodeAnalysis): Promise<void> {
  if (!redisClient) return;
  
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(analysis));
    console.log('💾 Cached analysis:', cacheKey.substring(0, 50));
  } catch (error) {
    console.warn('⚠️  Cache storage error:', error);
  }
}

/**
 * Invalidate cache for a specific code snippet
 */
async function invalidateCache(cacheKey: string): Promise<void> {
  if (!redisClient) return;
  
  try {
    await redisClient.del(cacheKey);
    console.log('🗑️  Invalidated cache:', cacheKey.substring(0, 50));
  } catch (error) {
    console.warn('⚠️  Cache invalidation error:', error);
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats(): Promise<{ hits: number; misses: number; size: string }> {
  if (!redisClient) {
    return { hits: 0, misses: 0, size: '0B' };
  }

  try {
    const info = await redisClient.info('stats');
    const keyCount = await redisClient.dbSize();
    
    return {
      hits: 0, // Would need to track separately
      misses: 0,
      size: `${keyCount} keys`
    };
  } catch (error) {
    return { hits: 0, misses: 0, size: 'N/A' };
  }
}

/**
 * Analyze code and provide detailed feedback using OpenAI
 */
async function analyzeCode(code: string, language: string, context?: string): Promise<CodeAnalysis> {
  try {
    // Check cache first
    const cacheKey = generateCacheKey(code, language, 'full');
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `You are an expert code reviewer. Analyze the following ${language} code and provide detailed feedback.

Code:
\`\`\`${language}
${code}
\`\`\`

${context ? `Context: ${context}` : ''}

Please provide a comprehensive analysis in JSON format with the following structure:
{
  "overallScore": <number 0-100>,
  "codeQuality": {
    "score": <number 0-100>,
    "feedback": [<list of specific feedback points>]
  },
  "security": {
    "score": <number 0-100>,
    "issues": [<list of security vulnerabilities>],
    "recommendations": [<list of security fixes>]
  },
  "performance": {
    "score": <number 0-100>,
    "suggestions": [<list of performance improvements>]
  },
  "bestPractices": {
    "score": <number 0-100>,
    "violations": [<list of best practice violations>],
    "recommendations": [<list of recommendations>]
  },
  "readability": {
    "score": <number 0-100>,
    "issues": [<list of readability issues>]
  },
  "summary": "<brief overall summary>",
  "improvements": [<top 3-5 actionable improvements>]
}

Focus on:
1. Code correctness and logic
2. Security vulnerabilities (especially for smart contracts)
3. Performance and gas optimization
4. Adherence to language conventions
5. Code clarity and maintainability`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : content) as CodeAnalysis;

    // Cache the result for future requests
    await cacheAnalysis(cacheKey, analysis);

    return analysis;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to analyze code');
  }
}

/**
 * Analyze code for specific vulnerabilities
 */
async function analyzeSecurityVulnerabilities(code: string, language: string): Promise<any> {
  try {
    const prompt = `Analyze the following ${language} code for security vulnerabilities. Focus on:
- Input validation issues
- Access control problems
- Cryptographic weaknesses
- Resource management issues
- Common vulnerability patterns (for smart contracts: reentrancy, overflow, underflow, etc.)

Code:
\`\`\`${language}
${code}
\`\`\`

Return a JSON object with:
{
  "vulnerabilities": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "type": "<vulnerability type>",
      "description": "<detailed description>",
      "location": "<code location>",
      "fix": "<suggested fix>"
    }
  ],
  "safetyScore": <number 0-100>,
  "overallRisk": "critical" | "high" | "medium" | "low",
  "recommendations": [<list of security recommendations>]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Security analysis error:', error);
    throw new Error('Failed to analyze security');
  }
}

/**
 * Generate optimization suggestions for code
 */
async function generateOptimizations(code: string, language: string): Promise<any> {
  try {
    const prompt = `Review the following ${language} code and suggest optimizations:

Code:
\`\`\`${language}
${code}
\`\`\`

Provide optimization suggestions in JSON format:
{
  "optimizations": [
    {
      "category": "performance" | "readability" | "maintainability" | "gas",
      "priority": "high" | "medium" | "low",
      "current": "<current approach>",
      "suggested": "<optimized approach>",
      "benefit": "<expected improvement>",
      "example": "<code example of optimization>"
    }
  ],
  "complexityAnalysis": {
    "timeComplexity": "<Big O notation>",
    "spaceComplexity": "<Big O notation>",
    "gasEstimate": "<if applicable>"
  },
  "estimatedImprovement": "<percentage improvement possible>"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Optimization analysis error:', error);
    throw new Error('Failed to generate optimizations');
  }
}

// ENDPOINTS

/**
 * Analyze code and get detailed feedback
 */
app.post('/analyze', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language, context } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    const analysis = await analyzeCode(code, language, context);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error analyzing code:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze code' });
  }
});

/**
 * Quick code quality check
 */
app.post('/quick-check', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Check cache first
    const cacheKey = generateCacheKey(code, language, 'quick-check');
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        result: {
          score: cached.overallScore,
          issues: cached.codeQuality.feedback,
          fixPriority: cached.overallScore >= 80 ? 'low' : cached.overallScore >= 60 ? 'medium' : 'high'
        },
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    // Quick analysis using a simpler prompt
    const prompt = `Give a quick quality score (0-100) and 3-5 key issues for this ${language} code:
\`\`\`${language}
${code}
\`\`\`

Return: { "score": <number>, "issues": [<string>], "fixPriority": "critical" | "high" | "medium" | "low" }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    // Cache the result
    const cacheData: CodeAnalysis = {
      overallScore: result.score,
      codeQuality: { score: result.score, feedback: result.issues },
      security: { score: 0, issues: [], recommendations: [] },
      performance: { score: 0, suggestions: [] },
      bestPractices: { score: 0, violations: [], recommendations: [] },
      readability: { score: 0, issues: [] },
      summary: `Quick check score: ${result.score}`,
      improvements: result.issues
    };
    await cacheAnalysis(cacheKey, cacheData);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error in quick check:', error);
    res.status(500).json({ error: error.message || 'Quick check failed' });
  }
});

/**
 * Security audit for code
 */
app.post('/security-audit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Check cache first
    const cacheKey = generateCacheKey(code, language, 'security-audit');
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        vulnerabilities: {
          vulnerabilities: cached.security.issues.map((issue, i) => ({
            severity: 'medium',
            type: 'detected',
            description: issue,
            location: 'unknown',
            fix: cached.security.recommendations[i] || 'Review code'
          })),
          safetyScore: cached.security.score,
          overallRisk: cached.security.score >= 80 ? 'low' : cached.security.score >= 60 ? 'medium' : 'high',
          recommendations: cached.security.recommendations
        },
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    const vulnerabilities = await analyzeSecurityVulnerabilities(code, language);

    // Cache the result
    const cacheData: CodeAnalysis = {
      overallScore: vulnerabilities.safetyScore,
      codeQuality: { score: 0, feedback: [] },
      security: {
        score: vulnerabilities.safetyScore,
        issues: vulnerabilities.vulnerabilities.map((v: any) => v.description),
        recommendations: vulnerabilities.recommendations
      },
      performance: { score: 0, suggestions: [] },
      bestPractices: { score: 0, violations: [], recommendations: [] },
      readability: { score: 0, issues: [] },
      summary: `Security audit completed: ${vulnerabilities.overallRisk} risk`,
      improvements: vulnerabilities.recommendations
    };
    await cacheAnalysis(cacheKey, cacheData);

    res.json({
      success: true,
      vulnerabilities,
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error in security audit:', error);
    res.status(500).json({ error: error.message || 'Security audit failed' });
  }
});

/**
 * Get optimization suggestions
 */
app.post('/optimize', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Check cache first
    const cacheKey = generateCacheKey(code, language, 'optimize');
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        optimizations: {
          optimizations: cached.performance.suggestions.map((s, i) => ({
            category: 'performance',
            priority: 'high',
            current: 'current implementation',
            suggested: s,
            benefit: 'improved performance',
            example: 'optimized code'
          })),
          complexityAnalysis: {
            timeComplexity: 'unknown',
            spaceComplexity: 'unknown',
            gasEstimate: 'N/A'
          },
          estimatedImprovement: '10-20%'
        },
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    const optimizations = await generateOptimizations(code, language);

    // Cache the result
    const cacheData: CodeAnalysis = {
      overallScore: 0,
      codeQuality: { score: 0, feedback: [] },
      security: { score: 0, issues: [], recommendations: [] },
      performance: {
        score: 0,
        suggestions: optimizations.optimizations.map((o: any) => o.suggested)
      },
      bestPractices: { score: 0, violations: [], recommendations: [] },
      readability: { score: 0, issues: [] },
      summary: `Optimization suggestions: ${optimizations.estimatedImprovement}`,
      improvements: optimizations.optimizations.map((o: any) => o.suggested)
    };
    await cacheAnalysis(cacheKey, cacheData);

    res.json({
      success: true,
      optimizations,
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error generating optimizations:', error);
    res.status(500).json({ error: error.message || 'Optimization generation failed' });
  }
});

/**
 * Test code and get execution feedback
 */
app.post('/test-code', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language, testCases } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Call grader service to execute and test code
    const graderResponse = await axios.post(
      `${process.env.GRADER_SERVICE_URL || 'http://localhost:4006'}/grade`,
      {
        code,
        language,
        testCases: testCases || []
      },
      {
        headers: {
          Authorization: req.headers.authorization
        }
      }
    );

    // Get AI feedback on test results
    const feedbackPrompt = `Based on these test results for ${language} code, provide constructive feedback:
Test Results: ${JSON.stringify(graderResponse.data)}

Give feedback in JSON: { "feedback": [<string>], "nextSteps": [<string>], "successRate": <percentage> }`;

    const feedbackResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: feedbackPrompt }],
      temperature: 0.6,
      max_tokens: 500
    });

    const content = feedbackResponse.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const feedback = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    res.json({
      success: true,
      testResults: graderResponse.data,
      aiFeedback: feedback,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing code:', error);
    res.status(500).json({ error: error.message || 'Code testing failed' });
  }
});

/**
 * Batch analyze multiple code submissions
 */
app.post('/batch-analyze', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { submissions } = req.body; // Array of { code, language, id }

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return res.status(400).json({ error: 'Submissions array is required' });
    }

    const results = await Promise.allSettled(
      submissions.map(async (submission: any) => {
        const analysis = await analyzeCode(submission.code, submission.language);
        return {
          id: submission.id,
          analysis,
          status: 'completed'
        };
      })
    );

    const analyses = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          id: submissions[index].id,
          status: 'failed',
          error: (result as PromiseRejectedResult).reason.message
        };
      }
    });

    res.json({
      success: true,
      totalSubmissions: submissions.length,
      completedAnalyses: analyses.filter((a: any) => a.status === 'completed').length,
      analyses,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in batch analysis:', error);
    res.status(500).json({ error: error.message || 'Batch analysis failed' });
  }
});

/**
 * Get code suggestions for learning
 */
app.post('/suggest-improvements', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { code, language, challengeLevel = 'intermediate' } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Check cache first
    const cacheKey = generateCacheKey(code, language, `suggest-${challengeLevel}`);
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        suggestions: {
          currentUnderstanding: `Code analysis for ${challengeLevel} level`,
          improvements: cached.improvements.map(imp => ({
            concept: 'improvement',
            currentCode: 'current implementation',
            betterApproach: imp,
            explanation: 'improved approach',
            resources: []
          })),
          nextLevelSkills: cached.improvements.slice(0, 3),
          encouragement: 'Great effort! Keep improving.'
        },
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    const prompt = `You are a coding mentor. Provide learning-focused improvement suggestions for this ${language} code (${challengeLevel} level):

Code:
\`\`\`${language}
${code}
\`\`\`

Suggest improvements as a mentor would, focusing on teaching better practices. Return JSON:
{
  "currentUnderstanding": "<assessment of code>",
  "improvements": [
    {
      "concept": "<programming concept>",
      "currentCode": "<example from submission>",
      "betterApproach": "<improved approach>",
      "explanation": "<why this is better>",
      "resources": [<learning resources>]
    }
  ],
  "nextLevelSkills": [<skills to develop next>],
  "encouragement": "<positive feedback>"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    // Cache the result
    const cacheData: CodeAnalysis = {
      overallScore: 0,
      codeQuality: { score: 0, feedback: suggestions.improvements.map((i: any) => i.explanation) },
      security: { score: 0, issues: [], recommendations: [] },
      performance: { score: 0, suggestions: [] },
      bestPractices: { score: 0, violations: [], recommendations: [] },
      readability: { score: 0, issues: [] },
      summary: suggestions.currentUnderstanding,
      improvements: suggestions.improvements.map((i: any) => i.betterApproach)
    };
    await cacheAnalysis(cacheKey, cacheData);

    res.json({
      success: true,
      suggestions,
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error: any) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'ai-code-analyzer',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    openaiConfigured: !!process.env.OPENAI_API_KEY
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down AI Code Analyzer...');
  process.exit(0);
});

// Add cache stats endpoint
app.get('/cache-stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await getCacheStats();
    res.json({
      status: 'ok',
      cache: {
        enabled: redisClient !== null,
        ttl: CACHE_TTL,
        ...stats
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'AI Code Analyzer',
    cache: redisClient !== null ? 'connected' : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Start server and initialize Redis
async function startServer() {
  await initializeRedis();
  
  app.listen(PORT, () => {
    console.log(`AI Code Analyzer Service running on port ${PORT}`);
    console.log(`Cache: ${redisClient ? 'Enabled' : 'Disabled'}`);
    if (!process.env.OPENAI_API_KEY) {
      console.warn('Warning: OPENAI_API_KEY not configured');
    }
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
