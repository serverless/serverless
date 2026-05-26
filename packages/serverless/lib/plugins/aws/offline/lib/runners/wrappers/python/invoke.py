import base64
import subprocess
import argparse
import json
import logging
import sys
import os
from time import strftime, time
from importlib import import_module


class FakeLambdaContext(object):
    def __init__(self, name='Fake', version='LATEST', timeout=6, **kwargs):
        self.name = name
        self.version = version
        self.created = time()
        self.timeout = timeout
        for key, value in kwargs.items():
            setattr(self, key, value)

    def get_remaining_time_in_millis(self):
        return int(max((self.timeout * 1000) - (int(round(time() * 1000)) - int(round(self.created * 1000))), 0))

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
        return '1024'

    @property
    def aws_request_id(self):
        return '1234567890'

    @property
    def log_group_name(self):
        return '/aws/lambda/' + self.name

    @property
    def log_stream_name(self):
        return strftime('%Y/%m/%d') + '/[$' + self.version + ']58419525dade4d17a495dceeeed44708'

    @property
    def log(self):
        return sys.stdout.write


logging.basicConfig()

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

    module = import_module(args.handler_path.replace(os.sep, '.'))
    handler = getattr(module, args.handler_name)

    # Keep a reference to the original stdin so that we can continue to receive
    # input from the parent process.
    stdin = sys.stdin

    if sys.platform != 'win32':
        try:
            if sys.platform != 'darwin':
                subprocess.check_call('tty', stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except (OSError, subprocess.CalledProcessError):
            pass
        else:
            # Replace stdin with a TTY to enable pdb usage.
            sys.stdin = open('/dev/tty')

    while True:
        input = json.loads(stdin.readline())

        context = FakeLambdaContext(**input.get('context', {}))
        result = handler(input['event'], context)

        data = {
            # identifier to distinguish the result envelope from print()/log output
            '__offline_payload__': result
        }

        if hasattr(result, 'body') and isinstance(result['body'], bytes):
            data['__offline_payload__']['body'] = base64.b64encode(result['body']).decode('utf-8')
            data['isBase64Encoded'] = True

        sys.stdout.write(json.dumps(data))
        sys.stdout.write('\n')
        sys.stdout.flush()
