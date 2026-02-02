# AI Code Analyzer Service

Intelligent code analysis and feedback service powered by OpenAI GPT-4. Provides comprehensive code reviews, security audits, optimization suggestions, and learning-focused feedback.

## Port
4008

## Features

### Code Analysis
- **Comprehensive Reviews**: Analyzes code quality, security, performance, best practices, and readability
- **Overall Scoring**: Provides numeric scores (0-100) for each aspect
- **Detailed Feedback**: Specific, actionable feedback for improvements

### Security Audits
- **Vulnerability Detection**: Identifies security issues and vulnerabilities
- **Severity Levels**: Critical, High, Medium, Low
- **Remediation Guidance**: Specific fixes and security recommendations

### Performance Optimization
- **Algorithm Analysis**: Time/space complexity assessment
- **Gas Optimization**: Specific for smart contracts
- **Code Examples**: Demonstrates optimized approaches

### Learning-Focused Feedback
- **Conceptual Explanations**: Teaches why certain approaches are better
- **Next Level Skills**: Suggests areas for growth
- **Encouraging Tone**: Positive, constructive feedback

### Batch Analysis
- **Bulk Processing**: Analyze multiple submissions simultaneously
- **Error Handling**: Graceful failure handling for individual submissions
- **Performance**: Optimized for processing many files

## API Endpoints

### POST /analyze
Comprehensive code analysis with all metrics.

**Request:**
```json
{
  "code": "function sum(arr) { return arr.reduce((a, b) => a + b, 0); }",
  "language": "javascript",
  "context": "Optional context about the challenge"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "overallScore": 85,
    "codeQuality": { "score": 88, "feedback": [...] },
    "security": { "score": 90, "issues": [], "recommendations": [...] },
    "performance": { "score": 80, "suggestions": [...] },
    "bestPractices": { "score": 82, "violations": [], "recommendations": [...] },
    "readability": { "score": 90, "issues": [] },
    "summary": "Well-written functional code...",
    "improvements": [...]
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### POST /quick-check
Fast quality assessment without detailed analysis.

**Request:**
```json
{
  "code": "...",
  "language": "solidity"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "score": 75,
    "issues": ["Missing error handling", "Gas optimization opportunity"],
    "fixPriority": "high"
  }
}
```

### POST /security-audit
Focused security vulnerability analysis.

**Request:**
```json
{
  "code": "...",
  "language": "solidity"
}
```

**Response:**
```json
{
  "success": true,
  "vulnerabilities": {
    "vulnerabilities": [
      {
        "severity": "critical",
        "type": "Reentrancy",
        "description": "...",
        "location": "line 45",
        "fix": "Use checks-effects-interactions pattern"
      }
    ],
    "safetyScore": 65,
    "overallRisk": "high",
    "recommendations": [...]
  }
}
```

### POST /optimize
Performance and efficiency optimization suggestions.

**Request:**
```json
{
  "code": "...",
  "language": "javascript"
}
```

**Response:**
```json
{
  "success": true,
  "optimizations": {
    "optimizations": [
      {
        "category": "performance",
        "priority": "high",
        "current": "nested loop O(n²)",
        "suggested": "use Map for O(n) complexity",
        "benefit": "10x faster for large inputs",
        "example": "..."
      }
    ],
    "complexityAnalysis": {
      "timeComplexity": "O(n)",
      "spaceComplexity": "O(n)"
    },
    "estimatedImprovement": "85%"
  }
}
```

### POST /test-code
Execute code with tests and get AI feedback.

**Request:**
```json
{
  "code": "...",
  "language": "javascript",
  "testCases": [...]
}
```

**Response:**
```json
{
  "success": true,
  "testResults": { "passed": 8, "failed": 1, "output": "..." },
  "aiFeedback": {
    "feedback": [...],
    "nextSteps": [...],
    "successRate": 88.9
  }
}
```

### POST /batch-analyze
Analyze multiple code submissions at once.

**Request:**
```json
{
  "submissions": [
    { "id": "sub1", "code": "...", "language": "solidity" },
    { "id": "sub2", "code": "...", "language": "javascript" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "totalSubmissions": 2,
  "completedAnalyses": 2,
  "analyses": [
    { "id": "sub1", "analysis": {...}, "status": "completed" },
    { "id": "sub2", "analysis": {...}, "status": "completed" }
  ]
}
```

### POST /suggest-improvements
Learning-focused suggestions for code improvement.

**Request:**
```json
{
  "code": "...",
  "language": "solidity",
  "challengeLevel": "intermediate"
}
```

**Response:**
```json
{
  "success": true,
  "suggestions": {
    "currentUnderstanding": "Good grasp of basic patterns...",
    "improvements": [
      {
        "concept": "Gas Optimization",
        "currentCode": "for (uint i = 0; i < arr.length; i++)",
        "betterApproach": "uint len = arr.length; for (uint i = 0; i < len; i++)",
        "explanation": "Caching length saves gas by avoiding repeated SLOAD operations",
        "resources": ["EIP-2929", "Solidity Gas Optimization Guide"]
      }
    ],
    "nextLevelSkills": ["Advanced gas optimization", "Security patterns"],
    "encouragement": "Great progress! Your code shows solid understanding..."
  }
}
```

### GET /health
Service health check.

## Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...

# Optional
PORT=4008
GRADER_SERVICE_URL=http://localhost:4006
```

## Installation

```bash
npm install
```

## Running

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## Supported Languages

- Solidity (smart contracts)
- JavaScript/TypeScript
- Python
- Rust
- Go
- Java
- C++
- Any language OpenAI supports

## Features by Language

### Solidity Specific
- Gas optimization detection
- Security vulnerability patterns (reentrancy, overflow, underflow)
- EIP compliance checks
- DeFi best practices

### General Languages
- Algorithmic optimization
- Readability improvements
- Design pattern suggestions
- Error handling improvements

## Integration with Grader Service

The AI analyzer integrates with the grader service for:
- Running test cases on submitted code
- Providing feedback based on test results
- Correlating code quality with actual execution results

## Rate Limiting

- Standard rate limit: 50 requests per 15 minutes per user
- Batch endpoint: Counted per submission in batch

## Authentication

Requires JWT token in Authorization header:
```
Authorization: Bearer <token>
```

## Performance Considerations

- Large code submissions (>10KB) may take longer
- Batch analysis is optimized for parallel processing
- Results are not cached (each request analyzed fresh)

## Cost Considerations

Uses OpenAI GPT-4 API which incurs costs. Monitor usage to manage expenses.

## Future Enhancements

- Code similarity detection (plagiarism detection)
- Caching of frequently analyzed patterns
- Custom analysis templates per challenge
- Multilingual code comments
- Code refactoring suggestions with examples
- Architecture analysis for larger codebases
