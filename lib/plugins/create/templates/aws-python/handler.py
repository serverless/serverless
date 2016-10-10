import json

def hello(event, context):
    return {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "event": event
    }

    # Use this code if you're using the HTTP LAMBDA-PROXY integration
    """
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": event
    }

    response = {
        "statusCode": 200,
        "headers": {
            "custom-header": "Custom header value"
        },
        "body": json.dumps(body)
    };

    return response
    """
