import hashlib
import json
import os
import urllib.request

# The loopback credentials endpoint is never reached through a proxy.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def access_key_id():
    """The function's access key id: a variable in Lambda, served by the credentials endpoint on
    the developer's machine."""
    if os.environ.get("AWS_ACCESS_KEY_ID"):
        return os.environ["AWS_ACCESS_KEY_ID"]
    request = urllib.request.Request(
        os.environ["AWS_CONTAINER_CREDENTIALS_FULL_URI"],
        headers={"Authorization": os.environ["AWS_CONTAINER_AUTHORIZATION_TOKEN"]},
    )
    with opener.open(request, timeout=5) as response:
        return json.loads(response.read())["AccessKeyId"]


def caller_arn():
    """The identity the function's credentials carry; None where boto3 is not installed (Lambda's
    Python runtimes include it, a developer's Python may not)."""
    try:
        import boto3
    except ImportError:
        return None
    return boto3.client("sts").get_caller_identity()["Arn"]


def handler(event, context):
    return {
        "ran": "deployed" if os.environ.get("LAMBDA_TASK_ROOT") == "/var/task" else "this-machine",
        "keyDigest": hashlib.sha256(access_key_id().encode()).hexdigest(),
        "devVariables": [name for name in os.environ if name.startswith("SLS_DEV_")],
        "callerArn": caller_arn(),
    }
