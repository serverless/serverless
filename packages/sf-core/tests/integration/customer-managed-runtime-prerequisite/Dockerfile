# The runtime image behind the customer-managed-runtimes integration suite: the
# Lambda Node.js 24 base image plus a marker file the suite's function reads.
FROM public.ecr.aws/lambda/nodejs:24
RUN mkdir -p /var/runtime-opt && echo "sls-integration-runtime v1" > /var/runtime-opt/sls-integration-runtime
