from __future__ import print_function
import logging

log = logging.getLogger()
log.setLevel(logging.DEBUG)

import json

def handler(event, context):
    log.debug("Received event {}".format(json.dumps(event)))
    return {}
