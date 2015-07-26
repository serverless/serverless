var util = require('../util');
var property = util.property;

function ResourceWaiter(name, waiter, options) {
  options = options || {};

  function InnerResourceWaiter() {
    property(this, 'name', name);
    property(this, 'api', options.api, false);

    if (waiter.operation) {
      property(this, 'operation', util.string.lowerFirst(waiter.operation));
    }

    var self = this, map = {
      ignoreErrors: 'ignore_errors',
      successType: 'success_type',
      successValue: 'success_value',
      successPath: 'success_path',
      acceptorType: 'acceptor_type',
      acceptorValue: 'acceptor_value',
      acceptorPath: 'acceptor_path',
      failureType: 'failure_type',
      failureValue: 'failure_value',
      failurePath: 'success_path',
      interval: 'interval',
      maxAttempts: 'max_attempts'
    };
    Object.keys(map).forEach(function(key) {
      var value = waiter[map[key]];
      if (value) property(self, key, value);
    });
  }

  if (options.api) {
    var proto = null;
    if (waiter['extends']) {
      proto = options.api.waiters[waiter['extends']];
    } else if (name !== '__default__') {
      proto = options.api.waiters['__default__'];
    }

    if (proto) InnerResourceWaiter.prototype = proto;
  }

  return new InnerResourceWaiter();
}

module.exports = ResourceWaiter;
