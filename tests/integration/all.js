'use strict';

// AWS
// General
require('./aws/general/nested-handlers/tests');
require('./aws/general/custom-resources/tests');

// API Gateway
// Integration: Lambda
require('./aws/api-gateway/integration-lambda/simple-api/tests');
require('./aws/api-gateway/integration-lambda/custom-authorizers/tests');
require('./aws/api-gateway/integration-lambda/cors/tests');
require('./aws/api-gateway/integration-lambda/api-keys/tests');
// Integration: Lambda Proxy
require('./aws/api-gateway/integration-lambda-proxy/simple-api/tests');

// Schedule
require('./aws/schedule/multiple-schedules-multiple-functions/tests');

// General
require('./general/custom-plugins/tests');
