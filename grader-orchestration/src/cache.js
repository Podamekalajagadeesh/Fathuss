const AWS = require('aws-sdk');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class GraderCache {
  constructor(options = {}) {
    this.s3 = new AWS.S3({
      region: options.region || process.env.CACHE_REGION || 'us-east-1',
      maxRetries: 3
    });
    this.bucket = options.bucket || process.env.CACHE_BUCKET;
    this.localCacheDir = options.localCacheDir || '/app/cache';
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Generate cache key for a given source code and compilation options
   */
  generateCacheKey(sourceCode, compilerVersion, optimizationLevel = 0) {
    const hash = crypto.createHash('sha256');
    hash.update(sourceCode);
    hash.update(compilerVersion);
    hash.update(optimizationLevel.toString());
    return hash.digest('hex');
  }

  /**
   * Check if artifact exists in cache
   */
  async exists(cacheKey) {
    try {
      await this.s3.headObject({
        Bucket: this.bucket,
        Key: `artifacts/${cacheKey}.json`
      }).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Store compiled artifact in cache
   */
  async store(cacheKey, artifact, metadata = {}) {
    const cacheEntry = {
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
  async retrieve(cacheKey) {
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

      const cacheEntry = JSON.parse(response.Body.toString());

      if (!this._isValid(cacheEntry)) {
        throw new Error('Cache entry expired');
      }

      // Store locally for future use
      await this._storeLocal(cacheKey, cacheEntry);

      return cacheEntry.artifact;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
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
  async cleanup() {
    try {
      const response = await this.s3.listObjectsV2({
        Bucket: this.bucket,
        Prefix: 'artifacts/'
      }).promise();

      if (!response.Contents) return;

      const expiredKeys = [];
      const now = Date.now();

      for (const obj of response.Contents) {
        try {
          const cacheEntry = await this.s3.getObject({
            Bucket: this.bucket,
            Key: obj.Key
          }).promise();

          const entry = JSON.parse(cacheEntry.Body.toString());
          if (!this._isValid(entry)) {
            expiredKeys.push({ Key: obj.Key });
          }
        } catch (error) {
          // If we can't read the object, mark it for deletion
          expiredKeys.push({ Key: obj.Key });
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

  _isValid(cacheEntry) {
    const now = Date.now();
    const entryTime = cacheEntry.metadata?.timestamp || 0;
    return (now - entryTime) < this.ttl;
  }

  async _storeLocal(cacheKey, cacheEntry) {
    try {
      await fs.mkdir(this.localCacheDir, { recursive: true });
      const filePath = path.join(this.localCacheDir, `${cacheKey}.json`);
      await fs.writeFile(filePath, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn('Failed to store in local cache:', error.message);
    }
  }

  async _retrieveLocal(cacheKey) {
    try {
      const filePath = path.join(this.localCacheDir, `${cacheKey}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}

module.exports = GraderCache;