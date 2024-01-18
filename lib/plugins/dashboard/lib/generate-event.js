'use strict';

const createEvent = require('@serverless/event-mocks').default;
const zlib = require('zlib');

const { writeText } = require('@serverless/utils/log');

const hasOwnProperty = Object.prototype.hasOwnProperty;

function recordWrapper(event) {
  return {
    Records: [event],
  };
}

function encodeBody(body) {
  if (!body) return body;
  return Buffer.from(body).toString('base64');
}

async function gzipBody(body) {
  return new Promise((res, rej) => {
    zlib.gzip(body, (error, result) => {
      if (error) {
        rej(error);
      } else {
        res(result);
      }
    });
  });
}

function parsedBody(body) {
  return JSON.parse(body);
}

const eventDict = {
  'aws:apiGateway': (body) => ({ body }),
  'aws:sns': (body) => recordWrapper({ Sns: { Message: body } }),
  'aws:sqs': (body) => recordWrapper({ body }),
  'aws:dynamo': (body) => recordWrapper({ dynamodb: body }),
  'aws:kinesis': (body) =>
    recordWrapper({
      kinesis: { data: encodeBody(body) },
    }),
  'aws:cloudWatchLog': async (body) => ({
    awslogs: { data: encodeBody(await gzipBody(body)) },
  }),
  'aws:s3': () => ({}),
  'aws:alexaSmartHome': (body) => parsedBody(body),
  'aws:alexaSkill': (body) => parsedBody(body),
  'aws:cloudWatch': (body) => parsedBody(body),
  'aws:iot': (body) => parsedBody(body),
  'aws:cognitoUserPool': (body) => parsedBody(body),
  'aws:websocket': (body) => ({ body }),
};

async function wrapEvent(eventType, body, ctx) {
  if (hasOwnProperty.call(eventDict, eventType)) {
    return createEvent(eventType, await eventDict[eventType](body));
  }

  throw new ctx.sls.classes.Error('Invalid event specified', 'INVALID_EVENT_TYPE');
}

const generate = async function (ctx) {
  const { options } = ctx.sls.processedInput;
  const body = options.body === undefined ? '{}' : options.body;
  const event = await wrapEvent(options.type, body, ctx);
  writeText(JSON.stringify(event));
  return event;
};

module.exports = {
  generate,
  eventDict,
};
