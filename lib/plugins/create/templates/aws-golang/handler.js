'use strict';

const spawn = require('child_process').spawn;

// Your first function handler
module.exports.hello = (event, context, cb) => {
  const proc = spawn('./hello', [JSON.stringify(event)]);
  let eventData;

  proc.stdout.on('data', (data) => {
    eventData = JSON.parse(data.toString('ascii'));
    if (typeof eventData === 'string') {
      eventData = JSON.parse(eventData);
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      cb(new Error('Process exited with non-zero status code'));
    }
    cb(null, { message: 'Go Serverless v1.0! Your function executed successfully!', eventData });
  });
};

// You can add more handlers here, and reference them in serverless.yaml
