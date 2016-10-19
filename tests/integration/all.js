'use strict';

// AWS
// General
require('./aws/general/nested-handlers/tests');
require('./aws/general/custom-resources/tests');
require('./aws/general/overwrite-resources/tests');

// API Gateway
// Integration: Lambda
require('./aws/api-gateway/integration-lambda/simple-api/tests');
require('./aws/api-gateway/integration-lambda/custom-authorizers/tests');
require('./aws/api-gateway/integration-lambda/cors/tests');
require('./aws/api-gateway/integration-lambda/api-keys/tests');
// Integration: Lambda Proxy
require('./aws/api-gateway/integration-lambda-proxy/simple-api/tests');
require('./aws/api-gateway/integration-lambda-proxy/custom-authorizers/tests');
require('./aws/api-gateway/integration-lambda-proxy/cors/tests');
require('./aws/api-gateway/integration-lambda-proxy/api-keys/tests');

// Schedule
require('./aws/schedule/multiple-schedules-multiple-functions/tests');

// SNS
require('./aws/sns/single-topic-single-function/tests');
require('./aws/sns/single-topic-multiple-functions/tests');
require('./aws/sns/multiple-topics-single-function/tests');
require('./aws/sns/multiple-topics-multiple-functions/tests');

// General
require('./general/custom-plugins/tests');
