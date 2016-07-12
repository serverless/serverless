'use strict';

function getTimerBindingTemplate() {
  return {
    name: 'myTimer',
    type: 'timerTrigger',
    direction: 'in',
    scheduled: '* * * * * *',
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
  const timerJSON = getTimerBindingTemplate();

  timerJSON.name = functionObject.events.timer.name;
  timerJSON.scheduled = functionObject.events.timer.scheduled;

  triggerJSON.bindings = [timerJSON];
  triggerJSON.disabled = functionObject.provider.azure.disabled;

  return triggerJSON;
}

module.exports = {
  getTimerBindingTemplate,
  getTriggerTemplate,
  buildFunctionJSON,
};
