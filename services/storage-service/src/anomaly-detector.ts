import { createClient as createClickHouseClient } from '@clickhouse/client';

export interface AnomalyDetectionResult {
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedUsers: string[];
  timestamp: Date;
  confidence: number;
  details: Record<string, any>;
}

export interface SubmissionPattern {
  userId: string;
  challengeId: string;
  language: string;
  score: number;
  timeTaken: number;
  attempts: number;
  submittedAt: Date;
}

export class AnomalyDetector {
  private clickhouse: ReturnType<typeof createClickHouseClient>;

  constructor(clickhouseClient: ReturnType<typeof createClickHouseClient>) {
    this.clickhouse = clickhouseClient;
  }

  /**
   * Detects suspicious submission patterns that may indicate cheating
   */
  async detectSubmissionAnomalies(
    timeWindowHours: number = 24,
    minConfidence: number = 0.7
  ): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];

    // 1. Detect rapid-fire submissions (too many submissions in short time)
    const rapidSubmissions = await this.detectRapidSubmissions(timeWindowHours);
    anomalies.push(...rapidSubmissions.filter(a => a.confidence >= minConfidence));

    // 2. Detect perfect scores with minimal time (suspiciously fast completion)
    const perfectScores = await this.detectPerfectScores(timeWindowHours);
    anomalies.push(...perfectScores.filter(a => a.confidence >= minConfidence));

    // 3. Detect identical submission patterns across users
    const identicalPatterns = await this.detectIdenticalPatterns(timeWindowHours);
    anomalies.push(...identicalPatterns.filter(a => a.confidence >= minConfidence));

    // 4. Detect unusual timing patterns (submissions at odd hours)
    const timingAnomalies = await this.detectTimingAnomalies(timeWindowHours);
    anomalies.push(...timingAnomalies.filter(a => a.confidence >= minConfidence));

    // 5. Detect coordinated submissions (multiple users submitting same challenge simultaneously)
    const coordinatedSubmissions = await this.detectCoordinatedSubmissions(timeWindowHours);
    anomalies.push(...coordinatedSubmissions.filter(a => a.confidence >= minConfidence));

    return anomalies;
  }

  private async detectRapidSubmissions(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        challenge_id,
        count() as submission_count,
        min(completed_at) as first_submission,
        max(completed_at) as last_submission,
        arrayDistinct(groupArray(language)) as languages_used
      FROM challenge_completions
      WHERE completed_at >= now() - INTERVAL ${timeWindowHours} HOUR
      GROUP BY user_id, challenge_id
      HAVING submission_count > 10
      ORDER BY submission_count DESC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    return data.map((row: any) => ({
      anomalyType: 'rapid_submissions',
      severity: row.submission_count > 50 ? 'critical' : row.submission_count > 20 ? 'high' : 'medium',
      description: `User ${row.user_id} made ${row.submission_count} submissions for challenge ${row.challenge_id} in ${timeWindowHours} hours`,
      affectedUsers: [row.user_id],
      timestamp: new Date(),
      confidence: Math.min(0.95, row.submission_count / 20), // Higher count = higher confidence
      details: {
        challengeId: row.challenge_id,
        submissionCount: row.submission_count,
        timeWindow: `${timeWindowHours}h`,
        languagesUsed: row.languages_used,
        firstSubmission: row.first_submission,
        lastSubmission: row.last_submission
      }
    }));
  }

  private async detectPerfectScores(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        challenge_id,
        score,
        time_taken,
        attempts,
        completed_at,
        language
      FROM challenge_completions
      WHERE completed_at >= now() - INTERVAL ${timeWindowHours} HOUR
        AND score >= 99.9
        AND time_taken < 60  -- Less than 1 minute
      ORDER BY time_taken ASC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    return data.map((row: any) => ({
      anomalyType: 'perfect_score_suspicious_timing',
      severity: row.time_taken < 30 ? 'critical' : 'high',
      description: `User ${row.user_id} achieved ${row.score}% score in ${row.time_taken}s for challenge ${row.challenge_id}`,
      affectedUsers: [row.user_id],
      timestamp: new Date(),
      confidence: row.time_taken < 30 ? 0.95 : row.time_taken < 60 ? 0.85 : 0.75,
      details: {
        challengeId: row.challenge_id,
        score: row.score,
        timeTaken: row.time_taken,
        attempts: row.attempts,
        language: row.language,
        completedAt: row.completed_at
      }
    }));
  }

  private async detectIdenticalPatterns(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];

    // Get recent submissions
    const query = `
      SELECT
        user_id,
        challenge_id,
        score,
        time_taken,
        attempts,
        language,
        completed_at
      FROM challenge_completions
      WHERE completed_at >= now() - INTERVAL ${timeWindowHours} HOUR
      ORDER BY completed_at DESC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const submissions = await result.json() as any[];

    // Group by challenge and find similar patterns
    const challengeGroups = new Map<string, any[]>();

    submissions.forEach((sub: any) => {
      if (!challengeGroups.has(sub.challenge_id)) {
        challengeGroups.set(sub.challenge_id, []);
      }
      challengeGroups.get(sub.challenge_id)!.push(sub);
    });

    for (const [challengeId, subs] of challengeGroups) {
      if (subs.length < 2) continue;

      // Find submissions with identical scores and timing
      const patternGroups = new Map<string, any[]>();

      subs.forEach(sub => {
        const pattern = `${sub.score}_${sub.time_taken}_${sub.attempts}_${sub.language}`;
        if (!patternGroups.has(pattern)) {
          patternGroups.set(pattern, []);
        }
        patternGroups.get(pattern)!.push(sub);
      });

      for (const [pattern, group] of patternGroups) {
        if (group.length >= 3) { // At least 3 users with identical pattern
          const users = group.map((g: any) => g.user_id);
          const avgTime = group.reduce((sum: number, g: any) => sum + g.time_taken, 0) / group.length;

          anomalies.push({
            anomalyType: 'identical_submission_patterns',
            severity: group.length > 5 ? 'critical' : 'high',
            description: `${group.length} users submitted identical patterns for challenge ${challengeId}`,
            affectedUsers: users,
            timestamp: new Date(),
            confidence: Math.min(0.9, group.length / 5),
            details: {
              challengeId,
              patternCount: group.length,
              averageTime: avgTime,
              score: group[0].score,
              attempts: group[0].attempts,
              language: group[0].language
            }
          });
        }
      }
    }

    return anomalies;
  }

  private async detectTimingAnomalies(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        count() as submission_count,
        arrayDistinct(arrayMap(x -> toHour(x), groupArray(completed_at))) as submission_hours,
        min(completed_at) as first_submission,
        max(completed_at) as last_submission
      FROM challenge_completions
      WHERE completed_at >= now() - INTERVAL ${timeWindowHours} HOUR
      GROUP BY user_id
      HAVING submission_count >= 5
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    const anomalies: AnomalyDetectionResult[] = [];

    data.forEach((row: any) => {
      const hours = row.submission_hours;
      const unusualHours = hours.filter((h: number) => h < 6 || h > 22); // Outside 6 AM - 10 PM

      if (unusualHours.length > hours.length * 0.7) { // 70% of submissions at unusual hours
        anomalies.push({
          anomalyType: 'unusual_timing_pattern',
          severity: 'medium',
          description: `User ${row.user_id} submitted ${row.submission_count} challenges mostly at unusual hours`,
          affectedUsers: [row.user_id],
          timestamp: new Date(),
          confidence: unusualHours.length / hours.length,
          details: {
            submissionCount: row.submission_count,
            unusualHours: unusualHours,
            allHours: hours,
            unusualPercentage: (unusualHours.length / hours.length) * 100
          }
        });
      }
    });

    return anomalies;
  }

  private async detectCoordinatedSubmissions(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        challenge_id,
        toStartOfMinute(completed_at) as minute_bucket,
        groupArray(user_id) as users,
        count() as submission_count
      FROM challenge_completions
      WHERE completed_at >= now() - INTERVAL ${timeWindowHours} HOUR
      GROUP BY challenge_id, minute_bucket
      HAVING submission_count >= 5  -- 5 or more submissions in same minute
      ORDER BY submission_count DESC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    return data.map((row: any) => ({
      anomalyType: 'coordinated_submissions',
      severity: row.submission_count > 10 ? 'critical' : 'high',
      description: `${row.submission_count} users submitted challenge ${row.challenge_id} within the same minute`,
      affectedUsers: row.users,
      timestamp: new Date(),
      confidence: Math.min(0.95, row.submission_count / 10),
      details: {
        challengeId: row.challenge_id,
        submissionCount: row.submission_count,
        minuteBucket: row.minute_bucket,
        users: row.users
      }
    }));
  }

  /**
   * Analyzes file upload patterns for suspicious activity
   */
  async detectFileUploadAnomalies(timeWindowHours: number = 24): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];

    // Detect unusually large files
    const largeFileAnomalies = await this.detectLargeFileUploads();
    anomalies.push(...largeFileAnomalies);

    // Detect rapid file uploads
    const rapidUploads = await this.detectRapidFileUploads(timeWindowHours);
    anomalies.push(...rapidUploads);

    // Detect suspicious file types
    const maliciousFiles = await this.detectSuspiciousFileTypes();
    anomalies.push(...maliciousFiles);

    // Detect potential IPFS abuse
    const ipfsAbuse = await this.detectIpfsAbusePatterns();
    anomalies.push(...ipfsAbuse);

    return anomalies;
  }

  private async detectLargeFileUploads(): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        file_name,
        file_size,
        upload_timestamp,
        content_hash
      FROM file_uploads
      WHERE file_size > 104857600  -- > 100MB
      ORDER BY file_size DESC
      LIMIT 100
    `;

    try {
      const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
      const data = await result.json() as any[];

      return data.map((row: any) => ({
        anomalyType: 'unusually_large_file',
        severity: row.file_size > 524288000 ? 'critical' : 'medium', // > 500MB = critical
        description: `User ${row.user_id} uploaded file ${row.file_name} (${(row.file_size / 1024 / 1024).toFixed(2)}MB)`,
        affectedUsers: [row.user_id],
        timestamp: new Date(),
        confidence: Math.min(0.85, (row.file_size / 1048576000) * 0.9), // Normalize to 1000MB
        details: {
          fileName: row.file_name,
          fileSize: row.file_size,
          fileSizeMb: (row.file_size / 1024 / 1024).toFixed(2),
          uploadTime: row.upload_timestamp,
          contentHash: row.content_hash
        }
      }));
    } catch (error) {
      console.error('Error detecting large files:', error);
      return [];
    }
  }

  private async detectRapidFileUploads(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        count() as upload_count,
        sum(file_size) as total_size,
        min(upload_timestamp) as first_upload,
        max(upload_timestamp) as last_upload,
        arrayDistinct(arrayMap(x -> splitByString('.', x)[-1], groupArray(file_name))) as file_types
      FROM file_uploads
      WHERE upload_timestamp >= now() - INTERVAL ${timeWindowHours} HOUR
      GROUP BY user_id
      HAVING upload_count > 20
      ORDER BY upload_count DESC
    `;

    try {
      const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
      const data = await result.json() as any[];

      return data.map((row: any) => ({
        anomalyType: 'rapid_file_uploads',
        severity: row.upload_count > 100 ? 'critical' : row.upload_count > 50 ? 'high' : 'medium',
        description: `User ${row.user_id} uploaded ${row.upload_count} files in ${timeWindowHours} hours (${(row.total_size / 1024 / 1024).toFixed(2)}MB total)`,
        affectedUsers: [row.user_id],
        timestamp: new Date(),
        confidence: Math.min(0.95, row.upload_count / 30),
        details: {
          uploadCount: row.upload_count,
          totalSize: row.total_size,
          totalSizeMb: (row.total_size / 1024 / 1024).toFixed(2),
          timeWindow: `${timeWindowHours}h`,
          fileTypes: row.file_types,
          uploadDuration: row.last_upload - row.first_upload
        }
      }));
    } catch (error) {
      console.error('Error detecting rapid uploads:', error);
      return [];
    }
  }

  private async detectSuspiciousFileTypes(): Promise<AnomalyDetectionResult[]> {
    const suspiciousExtensions = [
      'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'ps1',
      'zip', 'rar', '7z', 'iso', 'dmg',
      'php', 'jsp', 'asp', 'aspx', 'cfm'
    ];

    const query = `
      SELECT
        user_id,
        file_name,
        upload_timestamp,
        file_size,
        splitByString('.', file_name)[-1] as extension
      FROM file_uploads
      WHERE extension IN (${suspiciousExtensions.map(e => `'${e}'`).join(',')})
      ORDER BY upload_timestamp DESC
      LIMIT 100
    `;

    try {
      const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
      const data = await result.json() as any[];

      return data.map((row: any) => ({
        anomalyType: 'suspicious_file_type',
        severity: 'high',
        description: `User ${row.user_id} uploaded potentially malicious file: ${row.file_name}`,
        affectedUsers: [row.user_id],
        timestamp: new Date(),
        confidence: 0.9,
        details: {
          fileName: row.file_name,
          extension: row.extension,
          fileSize: row.file_size,
          uploadTime: row.upload_timestamp
        }
      }));
    } catch (error) {
      console.error('Error detecting suspicious files:', error);
      return [];
    }
  }

  private async detectIpfsAbusePatterns(): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        user_id,
        count() as ipfs_upload_count,
        count(distinct content_hash) as unique_hashes,
        sum(file_size) as total_bandwidth,
        min(upload_timestamp) as first_upload,
        max(upload_timestamp) as last_upload
      FROM ipfs_uploads
      WHERE upload_timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY user_id
      HAVING ipfs_upload_count > 50  -- More than 50 IPFS uploads per day
      ORDER BY total_bandwidth DESC
    `;

    try {
      const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
      const data = await result.json() as any[];

      return data.map((row: any) => ({
        anomalyType: 'ipfs_abuse_pattern',
        severity: row.total_bandwidth > 1073741824 ? 'critical' : 'high', // > 1GB
        description: `User ${row.user_id} performed ${row.ipfs_upload_count} IPFS uploads (${(row.total_bandwidth / 1024 / 1024).toFixed(2)}MB)`,
        affectedUsers: [row.user_id],
        timestamp: new Date(),
        confidence: Math.min(0.90, row.ipfs_upload_count / 100),
        details: {
          uploadCount: row.ipfs_upload_count,
          uniqueHashes: row.unique_hashes,
          totalBandwidth: row.total_bandwidth,
          totalBandwidthMb: (row.total_bandwidth / 1024 / 1024).toFixed(2),
          uploadDuration: row.last_upload - row.first_upload
        }
      }));
    } catch (error) {
      console.error('Error detecting IPFS abuse:', error);
      return [];
    }
  }

  private async detectIpApiAbuse(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        ip_address,
        count() as request_count,
        count(distinct user_id) as unique_users,
        arrayDistinct(groupArray(endpoint)) as endpoints_hit,
        min(timestamp) as first_request,
        max(timestamp) as last_request
      FROM api_metrics
      WHERE timestamp >= now() - INTERVAL ${timeWindowHours} HOUR
      GROUP BY ip_address
      HAVING request_count > 1000  -- More than 1000 requests per hour
      ORDER BY request_count DESC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    return data.map((row: any) => ({
      anomalyType: 'high_frequency_api_calls',
      severity: row.request_count > 5000 ? 'critical' : 'high',
      description: `IP ${row.ip_address} made ${row.request_count} API calls in ${timeWindowHours} hours`,
      affectedUsers: [], // IP-based, not user-based
      timestamp: new Date(),
      confidence: Math.min(0.95, row.request_count / 2000),
      details: {
        ipAddress: row.ip_address,
        requestCount: row.request_count,
        uniqueUsers: row.unique_users,
        endpoints: row.endpoints_hit,
        timeWindow: `${timeWindowHours}h`
      }
    }));
  }

  private async detectEndpointAbuse(timeWindowHours: number): Promise<AnomalyDetectionResult[]> {
    const query = `
      SELECT
        endpoint,
        method,
        status_code,
        count() as request_count,
        count(distinct ip_address) as unique_ips,
        avg(response_time) as avg_response_time,
        min(timestamp) as first_request,
        max(timestamp) as last_request
      FROM api_metrics
      WHERE timestamp >= now() - INTERVAL ${timeWindowHours} HOUR
        AND status_code >= 400  -- Error responses
      GROUP BY endpoint, method, status_code
      HAVING request_count > 50  -- Many errors for same endpoint
      ORDER BY request_count DESC
    `;

    const result = await this.clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json() as any[];

    return data.map((row: any) => ({
      anomalyType: 'endpoint_abuse_pattern',
      severity: row.status_code === 429 ? 'high' : 'medium',
      description: `${row.request_count} error responses (${row.status_code}) for ${row.method} ${row.endpoint}`,
      affectedUsers: [],
      timestamp: new Date(),
      confidence: Math.min(0.85, row.request_count / 100),
      details: {
        endpoint: row.endpoint,
        method: row.method,
        statusCode: row.status_code,
        requestCount: row.request_count,
        uniqueIps: row.unique_ips,
        avgResponseTime: row.avg_response_time
      }
    }));
  }

  /**
   * Generates a comprehensive anti-cheat report
   */
  async generateAntiCheatReport(timeWindowHours: number = 24): Promise<{
    summary: Record<string, number>;
    anomalies: AnomalyDetectionResult[];
    recommendations: string[];
  }> {
    const anomalies = await this.detectSubmissionAnomalies(timeWindowHours);

    // Count anomalies by type and severity
    const summary = anomalies.reduce((acc, anomaly) => {
      acc[`${anomaly.anomalyType}_${anomaly.severity}`] = (acc[`${anomaly.anomalyType}_${anomaly.severity}`] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate recommendations based on findings
    const recommendations = this.generateRecommendations(anomalies, summary);

    return {
      summary,
      anomalies,
      recommendations
    };
  }

  private generateRecommendations(anomalies: AnomalyDetectionResult[], summary: Record<string, number>): string[] {
    const recommendations: string[] = [];

    const criticalCount = Object.keys(summary).filter(k => k.endsWith('_critical')).reduce((sum, k) => sum + summary[k], 0);
    const highCount = Object.keys(summary).filter(k => k.endsWith('_high')).reduce((sum, k) => sum + summary[k], 0);

    if (criticalCount > 0) {
      recommendations.push('🚨 CRITICAL: Immediate investigation required for high-severity anomalies');
    }

    if (highCount > 5) {
      recommendations.push('⚠️  HIGH PRIORITY: Multiple high-severity anomalies detected - consider temporary restrictions');
    }

    if (summary.rapid_submissions_high || summary.rapid_submissions_critical) {
      recommendations.push('Implement progressive delays between submissions for affected users');
    }

    if (summary.perfect_score_suspicious_timing_high || summary.perfect_score_suspicious_timing_critical) {
      recommendations.push('Add minimum time requirements for challenge completion');
    }

    if (summary.identical_submission_patterns_high || summary.identical_submission_patterns_critical) {
      recommendations.push('Enable plagiarism detection for affected challenges');
    }

    if (summary.coordinated_submissions_high || summary.coordinated_submissions_critical) {
      recommendations.push('Monitor IP addresses and user sessions for coordinated cheating attempts');
    }

    if (Object.keys(summary).length === 0) {
      recommendations.push('✅ No significant anomalies detected - system operating normally');
    }

    return recommendations;
  }

  /**
   * Detects API abuse anomalies
   */
  async detectApiAbuseAnomalies(timeWindowHours: number = 1): Promise<AnomalyDetectionResult[]> {
    // TODO: Implement API abuse detection
    return [];
  }
}