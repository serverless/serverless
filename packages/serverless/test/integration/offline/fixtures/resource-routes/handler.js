'use strict'
// Dummy Lambda handler so the service has at least one function entry. The
// resourceRoutes feature under test is driven entirely by the CloudFormation
// HTTP_PROXY method below; this handler is never invoked by the test.
exports.noop = async () => ({ statusCode: 200, body: 'ok' })
