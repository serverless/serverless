'use strict';

const Component = require('@serverless/aws-s3');
const { Context, extractInputs, extractState, handlerWrapper } = require('./utils');

function handler(event) {
  const inputs = extractInputs(event);
  // NOTE: apparently OldResourceProperties is only passed-in when dealing with Update requests
  // see: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-requests.html
  // therefore we re-use the inputs as `state` when dealing with `Delete` requests
  let state = {};
  if (event.RequestType === 'Update') {
    state = extractState(event);
  } else if (event.RequestType === 'Delete') {
    state = inputs;
  }

  const context = new Context(state, {});
  const component = new Component(undefined, context);
  return component.init().then(() => {
    if (event.RequestType === 'Create') {
      return create(component, context, inputs);
    } else if (event.RequestType === 'Update') {
      return update(component, context, inputs);
    } else if (event.RequestType === 'Delete') {
      return remove(component, context);
    }
    throw new Error(`Unhandled RequestType ${event.RequestType}`);
  });
}

function create(component, context, inputs) {
  return component.default(inputs).then(() => context.readState());
}

function update(component, context, inputs) {
  // TODO: check if the name changes in order to do a replacement
  return component.default(inputs).then(() => context.readState());
}

function remove(component, context) {
  return component.remove().then(() => context.readState());
}

module.exports = {
  handler: handlerWrapper(handler, 'ComponentsViaCustomResourceS3'),
  // TODO: remove this export since it's only used in local tests
  handlerLocalTest: handler,
};
