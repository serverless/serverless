import hashlib
import json
import os
import urllib.request

invocations = 0
# The loopback credentials endpoint is never reached through a proxy.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def handler(event, context):
    global invocations
    event = event or {}
    if event.get("capture"):
        return {"environment": dict(os.environ)}
    invocations += 1
    request = urllib.request.Request(
        os.environ["AWS_CONTAINER_CREDENTIALS_FULL_URI"],
        headers={"Authorization": os.environ["AWS_CONTAINER_AUTHORIZATION_TOKEN"]},
    )
    with opener.open(request, timeout=5) as response:
        served = json.loads(response.read())
    return {
        "invocations": invocations,
        "keyDigest": hashlib.sha256(served["AccessKeyId"].encode()).hexdigest(),
        "greeting": os.environ.get("FIXTURE_GREETING"),
        "tz": os.environ.get("TZ"),
        "profile": os.environ.get("AWS_PROFILE"),
        "functionName": context.function_name,
        "remainingMs": context.get_remaining_time_in_millis(),
    }
