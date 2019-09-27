'use strict'; // eslint-disable-line consistent-return

/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

const handler = require('./code/handler').handlerLocalTest;

const ServiceToken = 'the-custom-resource-lambda-function';
const Name = 'components-via-cf-s3-bucket';
const Region = 'eu-central-1';
const Accelerated = false;

// AWS mock events
const eventMockCreate = {
  RequestType: 'Create',
  ResourceProperties: {
    ServiceToken,
    Name,
    Region,
    Accelerated,
  },
};

const eventMockUpdate = {
  RequestType: 'Update',
  OldResourceProperties: eventMockCreate.ResourceProperties,
  ResourceProperties: {
    ServiceToken,
    Name,
    Region,
    Accelerated: true,
  },
};

const eventMockDelete = {
  RequestType: 'Delete',
  ResourceProperties: eventMockCreate.ResourceProperties,
};

const operation = process.argv[2];
const validOperations = ['Create', 'Update', 'Delete'];

if (!operation || !validOperations.includes(operation)) {
  console.log('Please provide an operation like "Create", "Update", "Delete"');
} else {
  if (operation === 'Create') {
    return handler(eventMockCreate).then(res => console.log(res));
  } else if (operation === 'Update') {
    return handler(eventMockUpdate).then(res => console.log(res));
  }
  return handler(eventMockDelete).then(res => console.log(res));
}
