import json
import os


def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Invoked",
            "env": dict(os.environ)
        })
    }
