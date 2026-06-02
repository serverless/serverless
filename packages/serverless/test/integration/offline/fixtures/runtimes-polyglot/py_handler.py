import json
import os
import sys


def hello(event, context):
    body = {
        "runtime": "python",
        # major.minor identifies the host python3 child-process runner.
        "pyVersion": "%d.%d" % (sys.version_info[0], sys.version_info[1]),
        "isOffline": os.environ.get("IS_OFFLINE"),
        "functionName": os.environ.get("AWS_LAMBDA_FUNCTION_NAME"),
    }
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }
