import json
import os


def hello(event, context):
    # A layer is mounted read-only at /opt inside the container. Read the
    # mounted tree so the test can assert the handler actually sees layer
    # content delivered through a booted `sls offline` (not just the
    # module-level downloader). We list the top-level /opt entries rather than
    # a fixed filename so the assertion holds for any published layer ARN the
    # operator points OFFLINE_LAYER_ARN at.
    opt_entries = []
    try:
        opt_entries = sorted(os.listdir("/opt"))
    except OSError:
        opt_entries = []
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(
            {
                "runtime": "python",
                "optExists": os.path.isdir("/opt"),
                "optEntries": opt_entries,
                "isOffline": os.environ.get("IS_OFFLINE"),
            }
        ),
    }
