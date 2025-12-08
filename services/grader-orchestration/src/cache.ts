import AWS from 'aws-sdk';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface CacheEntry {
  cacheKey: string;
  artifact: any;
  metadata: {
    timestamp: number;
    compiler: string;
    version: string;
    [key: string]: any;
  };
}

interface CacheOptions {
  region?: string;
  bucket?: string;
  localCacheDir?: string;
  ttl?: number;
}

export class GraderCache {
  private s3: AWS.S3;
  private bucket: string;
  private localCacheDir: string;
  private ttl: number;

  constructor(options: CacheOptions = {}) {
    this.s3 = new AWS.S3({
      region: options.region || process.env.CACHE_REGION || 'us-east-1',
      maxRetries: 3
    });
    this.bucket = options.bucket || process.env.CACHE_BUCKET || '';
    this.localCacheDir = options.localCacheDir || '/app/cache';
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Generate cache key for a given source code and compilation options
   */
  generateCacheKey(sourceCode: string, compilerVersion: string, optimizationLevel: number = 0): string {
    const hash = crypto.createHash('sha256');
    hash.update(sourceCode);
    hash.update(compilerVersion);
    hash.update(optimizationLevel.toString());
    return hash.digest('hex');
  }

  /**
   * Check if artifact exists in cache
   */
  async exists(cacheKey: string): Promise<boolean> {
    try {
      await this.s3.headObject({
        Bucket: this.bucket,
        Key: `artifacts/${cacheKey}.json`
      }).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Store compiled artifact in cache
   */
  async store(cacheKey: string, artifact: any, metadata: any = {}): Promise<void> {
    const cacheEntry: CacheEntry = {
      cacheKey,
      artifact,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        compiler: metadata.compiler || 'unknown',
        version: metadata.version || 'unknown'
      }
    };

    await this.s3.putObject({
      Bucket: this.bucket,
      Key: `artifacts/${cacheKey}.json`,
      Body: JSON.stringify(cacheEntry),
      ContentType: 'application/json',
      Metadata: {
        'cache-key': cacheKey,
        'compiler': metadata.compiler || 'unknown',
        'timestamp': Date.now().toString()
      }
    }).promise();

    // Also store locally for faster access
    await this._storeLocal(cacheKey, cacheEntry);
  }

  /**
   * Retrieve compiled artifact from cache
   */
  async retrieve(cacheKey: string): Promise<any | null> {
    // Try local cache first
    try {
      const localEntry = await this._retrieveLocal(cacheKey);
      if (localEntry && this._isValid(localEntry)) {
        return localEntry.artifact;
      }
    } catch (error) {
      // Local cache miss, continue to S3
    }

    // Fetch from S3
    try {
      const response = await this.s3.getObject({
        Bucket: this.bucket,
        Key: `artifacts/${cacheKey}.json`
      }).promise();

      const cacheEntry: CacheEntry = JSON.parse(response.Body?.toString() || '{}');

      if (!this._isValid(cacheEntry)) {
        throw new Error('Cache entry expired');
      }

      // Store locally for future use
      await this._storeLocal(cacheKey, cacheEntry);

      return cacheEntry.artifact;
    } catch (error: any) {
      if (error.code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ totalArtifacts: number; cacheSize: number }> {
    try {
      const response = await this.s3.listObjectsV2({
        Bucket: this.bucket,
        Prefix: 'artifacts/'
      }).promise();

      return {
        totalArtifacts: response.KeyCount || 0,
        cacheSize: response.Contents?.reduce((size, obj) => size + (obj.Size || 0), 0) || 0
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { totalArtifacts: 0, cacheSize: 0 };
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanup(): Promise<void> {
    try {
      const response = await this.s3.listObjectsV2({
        Bucket: this.bucket,
        Prefix: 'artifacts/'
      }).promise();

      if (!response.Contents) return;

      const expiredKeys: { Key: string }[] = [];
      const now = Date.now();

      for (const obj of response.Contents) {
        try {
          const cacheEntry = await this.s3.getObject({
            Bucket: this.bucket,
            Key: obj.Key!
          }).promise();

          const entry: CacheEntry = JSON.parse(cacheEntry.Body?.toString() || '{}');
          if (!this._isValid(entry)) {
            expiredKeys.push({ Key: obj.Key! });
          }
        } catch (error) {
          // If we can't read the object, mark it for deletion
          expiredKeys.push({ Key: obj.Key! });
        }
      }

      if (expiredKeys.length > 0) {
        await this.s3.deleteObjects({
          Bucket: this.bucket,
          Delete: { Objects: expiredKeys }
        }).promise();

        console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
      }
    } catch (error) {
      console.error('Cache cleanup failed:', error);
    }
  }

  private _isValid(cacheEntry: CacheEntry): boolean {
    const now = Date.now();
    const entryTime = cacheEntry.metadata?.timestamp || 0;
    return (now - entryTime) < this.ttl;
  }

  private async _storeLocal(cacheKey: string, cacheEntry: CacheEntry): Promise<void> {
    try {
      await fs.mkdir(this.localCacheDir, { recursive: true });
      const filePath = path.join(this.localCacheDir, `${cacheKey}.json`);
      await fs.writeFile(filePath, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn('Failed to store in local cache:', (error as Error).message);
    }
  }

  private async _retrieveLocal(cacheKey: string): Promise<CacheEntry | null> {
    try {
      const filePath = path.join(this.localCacheDir, `${cacheKey}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}