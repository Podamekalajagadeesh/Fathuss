# RDS PostgreSQL
resource "aws_db_subnet_group" "postgresql" {
  name       = "${var.environment}-postgresql"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "${var.environment}-postgresql"
  }
}

resource "aws_db_parameter_group" "postgresql" {
  family = "postgres15"
  name   = "${var.environment}-postgresql15"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "postgresql" {
  identifier = "${var.environment}-fathuss-postgresql"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.database_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"

  db_name  = "fathuss"
  username = "fathuss"
  password = random_password.postgresql.result

  db_subnet_group_name   = aws_db_subnet_group.postgresql.name
  parameter_group_name   = aws_db_parameter_group.postgresql.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period = var.environment == "prod" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  multi_az               = var.environment == "prod"
  publicly_accessible    = false
  skip_final_snapshot    = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.environment}-fathuss-postgresql-final" : null

  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn         = aws_iam_role.rds_enhanced_monitoring.arn

  tags = {
    Name = "${var.environment}-fathuss-postgresql"
  }
}

resource "random_password" "postgresql" {
  length  = 32
  special = false
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.environment}-redis"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "${var.environment}-redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.environment}-fathuss-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  maintenance_window = "sun:05:00-sun:06:00"
  snapshot_window    = "04:00-05:00"

  tags = {
    Name = "${var.environment}-fathuss-redis"
  }
}

# ClickHouse EC2 instance
resource "aws_instance" "clickhouse" {
  ami           = data.aws_ami.amazon_linux_2.id
  instance_type = var.clickhouse_instance_type

  subnet_id              = module.vpc.private_subnets[0]
  vpc_security_group_ids = [aws_security_group.clickhouse.id]

  user_data = templatefile("${path.module}/templates/clickhouse-init.sh", {
    environment = var.environment
  })

  root_block_device {
    volume_size = 50
    volume_type = "gp3"
  }

  tags = {
    Name = "${var.environment}-fathuss-clickhouse"
  }
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.environment}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  role       = aws_iam_role.rds_enhanced_monitoring.name
}