import os


def handler(event, context):
    return {"marker": "deployed", "runtimeApi": os.environ.get("AWS_LAMBDA_RUNTIME_API")}
