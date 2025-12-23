"""Lambda handler for testing."""
import json
from my_local_package import get_version


def hello(event, context):
    """Hello handler."""
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello", "version": get_version()}),
    }
