# S3 Buckets for caching compiled dependencies
resource "aws_s3_bucket" "grader_cache" {
  bucket = "${var.environment}-fathuss-grader-cache-${random_string.bucket_suffix.result}"

  tags = {
    Name        = "${var.environment}-fathuss-grader-cache"
    Environment = var.environment
    Purpose     = "Grader compiled dependencies cache"
  }
}

resource "aws_s3_bucket_versioning" "grader_cache" {
  bucket = aws_s3_bucket.grader_cache.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "grader_cache" {
  bucket = aws_s3_bucket.grader_cache.id

  rule {
    id     = "cache_lifecycle"
    status = "Enabled"

    # Move objects to IA after 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Move objects to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Delete objects after 1 year
    expiration {
      days = 365
    }

    # Clean up incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "grader_cache" {
  bucket = aws_s3_bucket.grader_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "grader_cache" {
  bucket = aws_s3_bucket.grader_cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM Policy for S3 cache access
resource "aws_iam_policy" "grader_cache_access" {
  name = "${var.environment}-grader-cache-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.grader_cache.arn,
          "${aws_s3_bucket.grader_cache.arn}/*"
        ]
      }
    ]
  })
}

# IAM Role for grader workers to access cache
resource "aws_iam_role" "grader_worker" {
  name = "${local.cluster_name}-grader-worker"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:sub" = "system:serviceaccount:fathuss-${var.environment}:grader-worker"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "grader_worker_cache" {
  policy_arn = aws_iam_policy.grader_cache_access.arn
  role       = aws_iam_role.grader_worker.name
}

# Random suffix for bucket names
resource "random_string" "bucket_suffix" {
  length  = 8
  lower   = true
  upper   = false
  numeric = true
  special = false
}

# CloudFront distribution for cache access (optional, for global distribution)
resource "aws_cloudfront_distribution" "grader_cache" {
  count = var.enable_cloudfront_cache ? 1 : 0

  origin {
    domain_name = aws_s3_bucket.grader_cache.bucket_regional_domain_name
    origin_id   = "grader-cache-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.grader_cache[0].cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "grader-cache-origin"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.environment}-grader-cache"
    Environment = var.environment
  }
}

resource "aws_cloudfront_origin_access_identity" "grader_cache" {
  count = var.enable_cloudfront_cache ? 1 : 0

  comment = "Origin Access Identity for grader cache"
}