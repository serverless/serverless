'use strict';

function getInboundBindingTemplate () {
  return {
    "type": "httpTrigger",
    "webHookType": "",
    "name": "req",
    "direction": "in",
    "authLevel": "anonymous"
  };
};

function getOutboundBindingTemplate () {
  return {
    "name": "res",
    "type": "http",
    "direction": "out"
  };
};

function getTriggerTemplate () {
  return {
    "bindings": [],
    "disabled": false
  };
};

function buildFunctionJSON (functionObject) {
  var triggerJSON = getTriggerTemplate();
  var inboundJSON = getInboundBindingTemplate();
  var outboundJSON = getOutboundBindingTemplate();

  if (functionObject.events.azure.http_endpoint.direction === "out") {
      // TODO: handle functions with *only* outbound directions.
  }

  inboundJSON["name"] = functionObject.events.azure.http_endpoint.name;
  inboundJSON["authLevel"] = functionObject.events.azure.http_endpoint.authLevel;

  triggerJSON["disabled"] = functionObject.provider.azure.disabled;

  triggerJSON["bindings"] = [
    inboundJSON,
    outboundJSON
  ];

  return triggerJSON;
};

module.exports = {
  getTriggerTemplate: getTriggerTemplate,
  getInboundBindingTemplate: getInboundBindingTemplate,
  getOutboundBindingTemplate: getOutboundBindingTemplate,
  buildFunctionJSON: buildFunctionJSON
};