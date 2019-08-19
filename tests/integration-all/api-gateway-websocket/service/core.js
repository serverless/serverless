'use strict';

function minimal(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from API Gateway! - (websocket)',
      event,
    }),
  };
}

module.exports = {
  minimal,
};
