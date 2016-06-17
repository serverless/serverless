'use strict';

function getTimerBindingTemplate () {
  return {
    "name": "myTimer",
    "type": "timerTrigger",
    "direction": "in",
    "scheduled": "* * * * * *"
  };
};

function getTriggerTemplate () {
  return {
    "bindings": [],
    "disabled": false
  }
};

function buildFunctionJSON (functionObject) {
  var triggerJSON = getTriggerTemplate();
  var timerJSON = getTimerBindingTemplate();

  timerJSON["name"] = functionObject.events.azure.timer.name;
  timerJSON["scheduled"] = functionObject.events.azure.timer.scheduled;

  triggerJSON["bindings"] = [timerJSON];
  triggerJSON["disabled"] = functionObject.provider.azure.disabled;

  return triggerJSON;
};

module.exports = {
  getTimerBindingTemplate: getTimerBindingTemplate,
  getTriggerTemplate: getTriggerTemplate,
  buildFunctionJSON: buildFunctionJSON
};