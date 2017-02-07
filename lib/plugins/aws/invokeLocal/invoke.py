#!/usr/bin/env python2.7

import argparse
import json
import sys
from time import time
from importlib import import_module

class FakeLambdaContext(object):
    def __init__(self, name='Fake', version='LATEST', timeout=6):
        self.name = name
        self.version = version
        self.created = time()

    def get_remaining_time_in_millis(self):
        return (self.created - time()) * 1000

    @property
    def function_name(self):
        return self.name

    @property
    def function_version(self):
        return self.version

    @property
    def invoked_function_arn(self):
        return 'arn:aws:lambda:serverless:' + self.name

    @property
    def memory_limit_in_mb(self):
        return 1024

    @property
    def aws_request_id(self):
        return '1234567890'


parser = argparse.ArgumentParser(
    prog='invoke',
    description='Runs a Lambda entry point (handler) with an optional event',
)

parser.add_argument('handler_path',
                    help=('Path to the module containing the handler function,'
                          ' omitting ".py". IE: "path/to/module"'))

parser.add_argument('handler_name', help='Name of the handler function')

if __name__ == '__main__':
    args = parser.parse_args()

    # this is needed because you need to import from where you've executed sls
    sys.path.append('.')

    module = import_module(args.handler_path.replace('/', '.'))
    handler = getattr(module, args.handler_name)

    event = json.load(sys.stdin)
    result = handler(event, FakeLambdaContext())
    sys.stdout.write(json.dumps(result, indent=4))
