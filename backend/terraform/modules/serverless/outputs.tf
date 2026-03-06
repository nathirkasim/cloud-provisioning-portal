output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.serverless.function_name
}

output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.serverless.arn
}

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  description = "API Gateway ID"
  value       = aws_apigatewayv2_api.api.id
}
