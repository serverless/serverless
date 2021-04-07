'use strict';

module.exports.simpleAuthorizer = async (event) => {
  if (event.headers.authorization === 'secretToken') {
    return { isAuthorized: true };
  }

  return { isAuthorized: false };
};

module.exports.standardAuthorizer = async (event) => {
  if (event.headers.authorization === 'secretToken') {
    return {
      principalId: 'userId',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.routeArn,
          },
        ],
      },
    };
  }

  return {
    principalId: 'userId',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: event.routeArn,
        },
      ],
    },
  };
};
