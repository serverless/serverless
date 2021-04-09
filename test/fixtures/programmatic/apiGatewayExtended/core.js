'use strict';

async function minimal(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from API Gateway! - (minimal)',
      event,
    }),
  };
}

async function cors(event) {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      message: 'Hello from API Gateway! - (cors)',
      event,
    }),
  };
}

async function customAuthorizers(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from API Gateway! - (customAuthorizers)',
      event,
    }),
  };
}

async function apiKeys(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from API Gateway! - (apiKeys)',
      event,
    }),
  };
}

async function timeout(event) {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          statusCode: 200,
          body: JSON.stringify({
            message: 'Should not happen (timeout expected)',
            event,
          }),
        }),
      2000
    )
  );
}

module.exports = {
  minimal,
  cors,
  customAuthorizers,
  apiKeys,
  timeout,
};
