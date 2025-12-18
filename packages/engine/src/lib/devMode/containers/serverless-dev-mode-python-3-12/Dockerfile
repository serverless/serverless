FROM public.ecr.aws/lambda/python:3.12
LABEL maintainer="Serverless, Inc. <contact@serverless.com>"

ARG PORT
COPY --from=public.ecr.aws/lambda/python:3.12 /usr/local/bin/aws-lambda-rie /aws-lambda-rie
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter
RUN dnf install -y nodejs
RUN pip install watchdog
RUN npm install -g nodemon
ENV AWS_LWA_PORT=${PORT}
EXPOSE 9000
EXPOSE ${PORT}
WORKDIR /app
ENV SHELL=/bin/bash
# ENV NODE_OPTIONS="--watch-path=/app"
# TODO: DEFINITELY CHANGE THIS
RUN pip install flask
COPY ./entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
# ENTRYPOINT [ "/aws-lambda-rie", "--runtime-interface-emulator-address", "0.0.0.0:9000", "python"]
# "nodemon", "--exec", "python" ]
# "watchmedo", "shell-command", "--patterns", "*.py", "--recursive", "--command", "python"]
