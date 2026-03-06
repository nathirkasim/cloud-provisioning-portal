

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_role" {
  name = "${var.ticket_number}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    ManagedBy    = "CloudPortal"
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Create a simple placeholder zip for the Lambda function
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "/tmp/${var.ticket_number}-lambda.zip"

  source {
    content  = <<-PYTHON
      import json

      def handler(event, context):
          return {
              'statusCode': 200,
              'body': json.dumps({
                  'message': 'Hello from ${var.environment_name}!',
                  'ticket': '${var.ticket_number}',
                  'owner': '${var.owner_email}'
              })
          }
    PYTHON
    filename = "handler.py"
  }
}

# Lambda function — Free Tier: 1M requests/month + 400,000 GB-seconds
resource "aws_lambda_function" "serverless" {
  function_name    = "${var.ticket_number}-fn"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handler.handler"
  runtime          = var.runtime
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  memory_size      = var.memory_mb
  timeout          = var.timeout_seconds

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
  }
}

# API Gateway to expose Lambda via HTTP
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.ticket_number}-api"
  protocol_type = "HTTP"

  tags = {
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    ManagedBy    = "CloudPortal"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.serverless.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.serverless.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
