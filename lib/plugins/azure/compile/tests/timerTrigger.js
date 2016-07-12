'use strict';

const expect = require('chai').expect;
const timerTrigger = require('../lib/timerTrigger');

const mockFunctionObject = {
  provider: {
    azure: {
      disabled: false,
    },
  },
  events: {
    timer: {
      name: 'testTimer',
      scheduled: '* * * * * *',
    },
  },
};

describe('#timerTrigger', () => {
  it('builds a timer binding template', () => {
    const timerBindingTemplate = timerTrigger.getTimerBindingTemplate();
    const timerBindingKeys = Object.keys(timerBindingTemplate);

    expect(timerBindingKeys).to.include.members([
      'name',
      'type',
      'direction',
      'scheduled',
    ]);

    expect(timerBindingTemplate.type).to.equal('timerTrigger');
    expect(timerBindingTemplate.direction).to.equal('in');
    expect(timerBindingTemplate.scheduled).to.equal('* * * * * *');
  });

  it('builds a trigger template', () => {
    const triggerTemplate = timerTrigger.getTriggerTemplate();
    /* eslint-disable no-unused-expressions */
    expect(triggerTemplate.bindings).to.be.empty;
    expect(triggerTemplate.disabled).to.be.false;
    /* eslint-enable no-unused-expressions */
  });

  it('builds a templated timer trigger', () => {
    const timerTriggerJSON = timerTrigger.buildFunctionJSON(mockFunctionObject);
    expect(timerTriggerJSON.disabled).to.equal(mockFunctionObject.provider.azure.disabled);
    expect(timerTriggerJSON.bindings.length).to.equal(1);
  });
});
