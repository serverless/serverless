import hashlib
import os


def handler(event, context):
    print("agent-loop fixture handled", context.aws_request_id)
    return {
        "ran": "deployed" if os.environ.get("LAMBDA_TASK_ROOT") == "/var/task" else "this-machine",
        "language": "python",
        "requestId": context.aws_request_id,
        "secretDigest": hashlib.sha256(os.environ.get("FIXTURE_SECRET", "").encode()).hexdigest(),
    }
