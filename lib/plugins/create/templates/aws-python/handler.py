import json

def hello(event, context):
    # This code is used so that your function can repond to HTTP events
    # which use the LAMBDA-PROXY integration
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

    # Use the following code if you're not using the LAMBDA-PROXY integration
    """
    return {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "event": event
    }
    """
