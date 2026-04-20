def get_aws_console_url(template_type: str, resource_id: str, region: str = "ap-south-1"):
    """
    Generates a deep link to the AWS Console based on the resource type and ID.
    """
    if not resource_id:
        return None

    base = f"https://{region}.console.aws.amazon.com"

    if template_type == "web_app":
        # Direct link to the EC2 Instance detail page
        return f"{base}/ec2/v2/home?region={region}#InstanceDetails:instanceId={resource_id}"
    
    elif template_type == "database":
        # Direct link to the RDS Database detail page
        return f"{base}/rds/home?region={region}#database:id={resource_id};is-cluster=false"
    
    elif template_type == "serverless":
        # Direct link to the Lambda function
        return f"{base}/lambda/home?region={region}#/functions/{resource_id}"

    return f"{base}/home?region={region}"
