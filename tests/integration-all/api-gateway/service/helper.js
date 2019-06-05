'use strict';

// custom authorizer
function generatePolicy(principalId, effect, resource) {
  const authResponse = {};
  authResponse.principalId = principalId;

  if (effect && resource) {
    const policyDocument = {};
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];

    const statementOne = {};
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }

  return authResponse;
}

async function auth(event, context) {
  const token = event.authorizationToken.split(' ');

  if (token[0] === 'Bearer' && token[1] === 'ShouldBeAuthorized') {
    return context.succeed(generatePolicy('SomeRandomId', 'Allow', '*'));
  }

  return context.fail('Unauthorized');
}

module.exports = {
  auth,
};
