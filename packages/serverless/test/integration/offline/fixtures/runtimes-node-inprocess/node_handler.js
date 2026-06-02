'use strict'
// Returns a runtime-identifying payload plus a couple of the Lambda runtime
// env vars the runner injects, so the integration test can assert the Node
// runner served the request and that IS_OFFLINE / AWS_LAMBDA_FUNCTION_NAME are
// present in the handler env. The same handler backs both runner modes
// (worker-thread default + the in-process fixture); the test distinguishes
// them by which boot served the request, not by the body.
exports.hello = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    runtime: 'node',
    nodeVersion: process.version,
    isOffline: process.env.IS_OFFLINE,
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
  }),
})
