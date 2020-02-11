'use strict';

const awsService = require('../validationSchemas/awsService');
const awsEvent = require('../validationSchemas/awsEvent');
const awsFunction = require('../validationSchemas/awsFunction');
const awsHttpEventAsObject = require('../validationSchemas/awsHttpEventAsObject');

class ValidationSchema {
  constructor() {
    this.awsService = awsService;
    this.awsEvent = awsEvent;
    this.awsFunction = awsFunction;
    this.awsHttpEventAsObject = awsHttpEventAsObject;
  }
}

module.exports = ValidationSchema;
