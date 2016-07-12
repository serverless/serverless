'use strict';

function getInboundBindingTemplate() {
  return {
    type: 'httpTrigger',
    webHookType: '',
    name: 'req',
    direction: 'in',
    authLevel: 'anonymous',
  };
}

function getOutboundBindingTemplate() {
  return {
    name: 'res',
    type: 'http',
    direction: 'out',
  };
}

function getTriggerTemplate() {
  return {
    bindings: [],
    disabled: false,
  };
}

function buildFunctionJSON(functionObject) {
  const triggerJSON = getTriggerTemplate();
  const inboundJSON = getInboundBindingTemplate();
  const outboundJSON = getOutboundBindingTemplate();

  if (functionObject.events.azure.http.direction === 'out') {
      // TODO: handle functions with *only* outbound directions.
  }

  inboundJSON.name = functionObject.events.azure.http.name;
  inboundJSON.authLevel = functionObject.events.azure.http.authLevel;

  triggerJSON.disabled = functionObject.provider.azure.disabled;

  triggerJSON.bindings = [
    inboundJSON,
    outboundJSON,
  ];

  return triggerJSON;
}

module.exports = {
  getTriggerTemplate,
  getInboundBindingTemplate,
  getOutboundBindingTemplate,
  buildFunctionJSON,
};
