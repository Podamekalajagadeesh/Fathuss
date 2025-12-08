# Cost optimization and monitoring
resource "aws_ce_cost_allocation_tag" "environment" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "Environment"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "service" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "Service"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "node_group" {
  count = var.enable_cost_allocation_tags ? 1 : 0

  tag_key = "NodeGroup"
  status  = "Active"
}

# Spot instance pricing monitoring
resource "aws_cloudwatch_dashboard" "cost_monitoring" {
  dashboard_name = "${var.environment}-fathuss-cost-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/EC2", "CPUCreditUsage", "InstanceType", "t3.medium"],
            [".", "CPUCreditBalance", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "EC2 CPU Credits (Spot Instances)"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/EC2Spot", "SpotInstanceRequests", "AvailabilityZone", "${var.aws_region}a"],
            [".", "SpotFleetRequests", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Spot Instance Usage"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6

        properties = {
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "BucketName", aws_s3_bucket.grader_cache.bucket, "StorageType", "StandardStorage"],
            [".", "NumberOfObjects", ".", ".", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "S3 Cache Usage"
          period  = 3600
        }
      }
    ]
  })
}

# Budget alerts for cost monitoring
resource "aws_budgets_budget" "monthly_budget" {
  name         = "${var.environment}-fathuss-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["Environment$${var.environment}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }
}

# Auto-scaling policies for cost optimization
resource "aws_autoscaling_policy" "spot_scale_in" {
  name                   = "${var.environment}-spot-scale-in"
  autoscaling_group_name = module.eks.eks_managed_node_groups["spot_workers"].node_group_autoscaling_group_names[0]
  adjustment_type        = "ChangeInCapacity"
  scaling_adjustment     = -1
  cooldown               = 300

  policy_type = "SimpleScaling"
}

resource "aws_cloudwatch_metric_alarm" "high_spot_price" {
  alarm_name          = "${var.environment}-high-spot-price"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "SpotPrice"
  namespace           = "AWS/EC2Spot"
  period              = "300"
  statistic           = "Maximum"
  threshold           = var.spot_price_threshold
  alarm_description   = "Spot instance price is too high"
  alarm_actions       = [aws_autoscaling_policy.spot_scale_in.arn]

  dimensions = {
    InstanceType = "t3.medium"
    AvailabilityZone = "${var.aws_region}a"
  }
}