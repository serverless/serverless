# Copyright 2019 Google LLC
# SPDX-License-Identifier: Apache-2.0

import os

from flask import Flask

app = Flask(__name__)


@app.route('/')
def hello_world():
    target = os.environ.get('TARGET', 'World')
    return f'Hello {target}\n'


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
