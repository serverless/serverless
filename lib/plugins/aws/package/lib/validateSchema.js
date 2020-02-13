'use strict';
const BbPromise = require('bluebird');

module.exports = {
  validateSchema() {
    const functions = this.serverless.service.functions;

    const serviceSchema = this.serverless.validationSchema.awsService;
    const functionSchema = this.serverless.validationSchema.awsFunction;
    const eventSchema = this.serverless.validationSchema.awsEvent;
    const awsHttpEventAsObjectSchema = this.serverless.validationSchema.awsHttpEventAsObject;

    const { error: errService } = serviceSchema.validate(this.serverless.service);
    if (errService && errService.message) {
      const errorMessage = `Invalid serverless file: ${errService.message}`;
      // TODO (BREAKING): throw error on next major
      this.serverless.cli.log(errorMessage, 'Serverless', { color: 'orange' });
    }

    const functionNames = Object.keys(functions);
    for (const functionName of functionNames) {
      const functionObject = functions[functionName];

      const { error: errFunction } = functionSchema.validate(functionObject);
      if (errFunction && errFunction.message) {
        const errorMessage = `Invalid "${functionName}" function: ${errFunction.message}`;
        // TODO (BREAKING): throw error on next major
        this.serverless.cli.log(errorMessage, 'Serverless', { color: 'orange' });
      }

      for (const eventObject of functionObject.events) {
        // This validation catches invalid event names without going deep inside
        const { error: errEvent } = eventSchema.validate(eventObject);
        if (errEvent && errEvent.message) {
          const errorMessage = `Invalid event in "${functionName}" function: ${errEvent.message}`;
          // TODO (BREAKING): throw error on next major
          this.serverless.cli.log(errorMessage, 'Serverless', { color: 'orange' });
        }

        // Validation of http event propetries
        if (eventObject.http && typeof eventObject.http === 'object') {
          const { error: errEventHttp } = awsHttpEventAsObjectSchema.validate(eventObject.http);
          if (errEventHttp && errEventHttp.message) {
            const errorMessage = `Invalid event in "${functionName}" function: ${errEventHttp.message}`;
            // TODO (BREAKING): throw error on next major
            this.serverless.cli.log(errorMessage, 'Serverless', { color: 'orange' });
          }
        }

        // TODO: add validation for other event types
      }
    }
    return BbPromise.resolve();
  },
};
