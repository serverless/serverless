import json


def hello(event, context):
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": event['data']
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response
