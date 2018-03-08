import json


def hello(request):
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": request.json
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response
