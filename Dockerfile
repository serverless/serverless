FROM node:latest

# install yarn
RUN curl -o- -L https://yarnpkg.com/install.sh | bash

# install python tooling
RUN apt-get update -y && apt-get install -y python-dev python-pip && pip install --no-cache-dir --upgrade pip

# install other utils
RUN apt-get update -y && apt-get install -y screen

# install aws-cli
RUN pip install --no-cache-dir awscli
