"""Lambda handler for testing local path dependency reinstall."""
import json
from my_path_package import get_version


def hello(event, context):
    """Hello handler."""
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello", "version": get_version()}),
    }
