#!/bin/bash

rm -r serverless_sdk/vendor
mkdir serverless_sdk/vendor
docker run --rm -it -v $PWD/serverless_sdk/vendor:/var/task/vendor \
    lambci/lambda:build-python3.7 \
    pip install --target /var/task/vendor wrapt
