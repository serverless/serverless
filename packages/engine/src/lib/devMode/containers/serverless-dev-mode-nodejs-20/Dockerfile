FROM public.ecr.aws/lambda/nodejs:20
LABEL maintainer="Serverless, Inc. <contact@serverless.com>"

ARG PORT
COPY --from=public.ecr.aws/lambda/nodejs:20 /usr/local/bin/aws-lambda-rie /aws-lambda-rie
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter
RUN npm i -g chokidar-cli tsx
RUN mkdir /watcher
WORKDIR /watcher
RUN npm i nodemon commander
ENV AWS_LWA_PORT=${PORT}
EXPOSE 9000
EXPOSE ${PORT}
WORKDIR /shim
RUN npm i mastra @mastra/core @mastra/memory @mastra/libsql
WORKDIR /shim/app
ENV SHELL=/bin/bash
COPY ./entrypoint.sh /entrypoint.sh
COPY ./entrypoint.mjs /watcher/entrypoint.mjs
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
# ENV NODE_OPTIONS="--watch-path=/app"
# ENTRYPOINT [ "/aws-lambda-rie", "--runtime-interface-emulator-address", "0.0.0.0:9000", "node", "--watch" ]
# ENTRYPOINT [ "/aws-lambda-rie", "--runtime-interface-emulator-address", "0.0.0.0:9000", "tsx", "watch", "index.js" ]
# ENTRYPOINT ["/aws-lambda-rie", "--runtime-interface-emulator-address", "0.0.0.0:9000", "chokidar", "/app/**/*.{js,ts}", "-c", "\"npm start\""]
# ENTRYPOINT ["chokidar", "/app/**/*.{js,ts}", "-c", "\"/aws-lambda-rie --runtime-interface-emulator-address 0.0.0.0:9000 npm start\""]
