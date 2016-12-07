'use strict';

// AWS
// General
require('./aws/general/nested-handlers/tests');
require('./aws/general/custom-resources/tests');
require('./aws/general/overwrite-resources/tests');
require('./aws/general/environment-variables/tests');
require('./aws/general/package/tests');

// API Gateway
// Integration: Lambda
require('./aws/api-gateway/integration-lambda/simple-api/tests');
require('./aws/api-gateway/integration-lambda/custom-authorizers/tests');
require('./aws/api-gateway/integration-lambda/cors/tests');
// Integration: Lambda Proxy
require('./aws/api-gateway/integration-lambda-proxy/simple-api/tests');
require('./aws/api-gateway/integration-lambda-proxy/custom-authorizers/tests');
require('./aws/api-gateway/integration-lambda-proxy/cors/tests');

// Schedule
require('./aws/schedule/multiple-schedules-multiple-functions/tests');

// SNS
require('./aws/sns/single-topic-single-function/tests');
require('./aws/sns/single-topic-multiple-functions/tests');
require('./aws/sns/multiple-topics-single-function/tests');
require('./aws/sns/multiple-topics-multiple-functions/tests');

// S3
require('./aws/s3/single-event-single-function-single-bucket/tests');
require('./aws/s3/multiple-events-single-function-single-bucket/tests');
require('./aws/s3/multiple-events-multiple-functions-single-bucket/tests');
require('./aws/s3/multiple-events-multiple-functions-multiple-buckets/tests');

// General
require('./general/custom-plugins/tests');
require('./general/local-plugins/tests');
