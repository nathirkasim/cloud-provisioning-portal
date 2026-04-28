import json
import requests
import urllib.parse
import boto3
import logging

logger = logging.getLogger(__name__)

SCOPED_POLICIES = {
    "serverless": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "lambda:GetFunction",
                "lambda:GetFunctionConfiguration",
                "lambda:InvokeFunction",
                "lambda:ListFunctions",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:GetLogEvents"
            ],
            "Resource": "*"
        }]
    },
    "database": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "rds:DescribeDBInstances",
                "rds:DescribeDBClusters",
                "rds:ListTagsForResource",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics"
            ],
            "Resource": "*"
        }]
    },
    "web_app": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
                "logs:DescribeLogGroups",
                "logs:GetLogEvents"
            ],
            "Resource": "*"
        }]
    },
    "s3_storage": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "s3:ListAllMyBuckets",
                "s3:GetBucketLocation",
                "s3:ListBucket",
                "s3:GetObject"
            ],
            "Resource": "*"
        }]
    },
    "s3_static_site": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "s3:ListAllMyBuckets",
                "s3:GetBucketLocation",
                "s3:ListBucket",
                "s3:GetObject"
            ],
            "Resource": "*"
        }]
    },
    "dynamodb": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "dynamodb:DescribeTable",
                "dynamodb:ListTables",
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:GetItem"
            ],
            "Resource": "*"
        }]
    },
    "sns_topic": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "sns:ListTopics",
                "sns:GetTopicAttributes",
                "sns:ListSubscriptionsByTopic"
            ],
            "Resource": "*"
        }]
    },
    "ecr_repository": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages"
            ],
            "Resource": "*"
        }]
    },
    "ecs_container": {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "ecs:ListClusters",
                "ecs:DescribeClusters",
                "ecs:ListServices",
                "ecs:DescribeServices",
                "ecs:ListTasks",
                "ecs:DescribeTasks"
            ],
            "Resource": "*"
        }]
    }
}

def generate_federated_console_url(access_key, secret_key, region="ap-south-1", template_type=None, resource_id=None):
    """
    Exchanges IAM keys for a scoped federated session token and returns
    a deep link to the specific AWS resource in the console.
    """
    try:
        session = boto3.Session(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
        sts = session.client('sts')

        # Use scoped policy for the template type, fallback to read-only
        policy = SCOPED_POLICIES.get(template_type, {
            "Version": "2012-10-17",
            "Statement": [{"Effect": "Allow", "Action": ["resource-explorer-2:List*"], "Resource": "*"}]
        })

        federated_user = sts.get_federation_token(
            Name="PortalFederatedSession",
            Policy=json.dumps(policy)
        )

        credentials = federated_user['Credentials']
        session_json = json.dumps({
            'sessionId': credentials['AccessKeyId'],
            'sessionKey': credentials['SecretAccessKey'],
            'sessionToken': credentials['SessionToken']
        })

        fed_url = "https://signin.aws.amazon.com/federation"
        response = requests.get(fed_url, params={
            "Action": "getSigninToken",
            "Session": session_json
        })
        signin_token = response.json().get("SigninToken")

        if template_type == 'serverless' and resource_id:
            destination = f"https://{region}.console.aws.amazon.com/lambda/home?region={region}#/functions/{resource_id}?tab=code"
        elif template_type == 'database' and resource_id:
            destination = f"https://{region}.console.aws.amazon.com/rds/home?region={region}#database:id={resource_id};is-cluster=false"
        elif template_type == 'web_app' and resource_id:
            destination = f"https://{region}.console.aws.amazon.com/ec2/v2/home?region={region}#Instances:instanceId={resource_id}"
        elif template_type in ['s3_storage', 's3_static_site'] and resource_id:
            destination = f"https://s3.console.aws.amazon.com/s3/buckets/{resource_id}?region={region}"
        elif template_type == 'dynamodb' and resource_id:
            destination = f"https://{region}.console.aws.amazon.com/dynamodbv2/home?region={region}#item-explorer?table={resource_id}"
        else:
            destination = f"https://{region}.console.aws.amazon.com/console/home?region={region}" 

        login_url = (
            f"{fed_url}?Action=login"
            f"&Issuer=CloudPortal"
            f"&Destination={urllib.parse.quote(destination)}"
            f"&SigninToken={signin_token}"
        )
        return login_url

    except Exception as e:
        logger.error("Console federation failed: %s", str(e))
        return None
