exports.handler = function(event, context) {

  console.log('Running custom authorizer at ', new Date().toISOString() );

  var token = event.authorizationToken;
  token = 'allow'; // Auto-pass token for Serverless test

  // Call oauth provider, crack jwt token, etc.
  // In this example, the token is treated as the status for simplicity.

  switch (token) {
    case 'allow':
      context.succeed(generatePolicy('user', 'Allow', event.methodArn));
      break;
    case 'deny':
      context.succeed(generatePolicy('user', 'Deny', event.methodArn));
      break;
    case 'unauthorized':
      context.fail("Unauthorized");
      break;
    default:
      context.fail("error");
  }
};

var generatePolicy = function(principalId, effect, resource) {
  var authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    var policyDocument = {};
    policyDocument.Version = '2012-10-17'; // default version
    policyDocument.Statement = [];
    var statementOne = {};
    statementOne.Action = 'execute-api:Invoke'; // default action
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  return authResponse;
};
