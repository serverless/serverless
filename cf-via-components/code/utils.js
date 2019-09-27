'use strict';

const https = require('https');
const url = require('url');

// this is the Context class we pass into our component(s) upon creating
// a new instance
class Context {
  constructor(state = {}, config = {}) {
    const credentialsViaEnv = {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
      AWS_SECURITY_TOKEN: process.env.AWS_SECURITY_TOKEN,
    };

    this.credentials = config.credentials || credentialsViaEnv || {};
    this.debugMode = config.debug || false;
    // set the state we get via our constructor
    this.state = state;
    this.state.id = this.state.id ? this.state.id : +new Date();
    // set the id of our component
    this.id = this.state.id;
  }

  init() {
    this.id = this.state.id;
  }

  resourceId() {
    return `${this.id}-${+new Date()}`;
  }

  readState() {
    return this.state;
  }

  writeState() {
    // we leverage AWS to manage the state via our custom CloudFormation resource.
    // In our custom CloudFormation resource handler code we return an object
    // with a nested `Data` object which holds the state
    return this.state;
  }

  log() {
    return;
  }

  // debug is useful and available even in programmatic mode
  debug(msg) {
    if (!this.debugMode || !msg || msg === '') {
      return;
    }

    console.log(`  DEBUG: ${msg}`); // eslint-disable-line
  }

  status() {
    return;
  }
}

const logger = console;

function extractor(object, keysToIgnore = []) {
  return Object.keys(object).reduce((accum, key) => {
    if (!keysToIgnore.includes(key)) {
      const newKey = key.toLowerCase();
      const newValue = object[key];
      Object.assign(accum, { [newKey]: newValue });
    }
    return accum;
  }, {});
}

function extractInputs(event) {
  // TODO: see if `ResourceProperties` is already without `ServiceToken`
  const props = event.ResourceProperties;
  let inputs = {};
  if (props) {
    inputs = extractor(props, ['ServiceToken']);
  }
  return inputs;
}

function extractState(event) {
  // TODO: see if `OldResourceProperties` is already without `ServiceToken`
  const oldProps = event.OldResourceProperties;
  let state = {};
  if (oldProps) {
    state = extractor(oldProps, ['ServiceToken']);
  }
  return state;
}

function response(event, context, status, data = {}, err) {
  const reason = err ? err.message : '';
  const { StackId, RequestId, LogicalResourceId, PhysicalResourceId, ResponseURL } = event;

  const body = JSON.stringify({
    StackId,
    RequestId,
    LogicalResourceId,
    PhysicalResourceId,
    Status: status,
    Reason: reason && `${reason} See details in CloudWatch Log: ${context.logStreamName}`,
    Data: data,
  });

  logger.log(body);

  const parsedUrl = url.parse(ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': body.length,
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, resp => {
      logger.log(`STATUS: ${resp.statusCode}`);
      logger.log(`HEADERS: ${JSON.stringify(resp.headers)}`);
      return resolve(data);
    });

    request.on('error', error => {
      logger.log(`sendResponse Error:\n${error}`);
      return reject(error);
    });

    request.on('end', () => {
      logger.log('end');
      return resolve();
    });

    request.write(body);
    request.end();
  });
}

// everything which is returned in the `handlerWrapper` call will be put inside the
// `Data` object which in turn is persistent on AWS end in an S3 bucket AWS manages
function handlerWrapper(handler, PhysicalResourceId) {
  return (event, context, callback) => {
    // extend the `event` object to include the PhysicalResourceId
    event = Object.assign({}, event, { PhysicalResourceId });
    return Promise.resolve(handler(event, context, callback))
      .then(
        result => response(event, context, 'SUCCESS', result),
        error => response(event, context, 'FAILED', {}, error)
      )
      .then(result => callback(null, result), callback);
  };
}

module.exports = {
  Context,
  logger,
  extractInputs,
  extractState,
  response,
  handlerWrapper,
};
