/**
 * Copyright 2012-2013 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

var AWS = require('./core');
var inherit = AWS.util.inherit;

/**
 * @api private
 */
AWS.ResourceWaiter = inherit({
  /**
   * Waits for a given state on a service object
   * @param service [Service] the service object to wait on
   * @param state [String] the state (defined in waiter configuration) to wait
   *   for.
   * @example Create a waiter for running EC2 instances
   *   var ec2 = new AWS.EC2;
   *   var waiter = new AWS.ResourceWaiter(ec2, 'instanceRunning');
   */
  constructor: function constructor(service, state) {
    this.service = service;
    this.state = state;

    if (typeof this.state === 'object') {
      AWS.util.each.call(this, this.state, function (key, value) {
        this.state = key;
        this.expectedValue = value;
      });
    }

    this.loadWaiterConfig(this.state);
    if (!this.expectedValue) {
      this.expectedValue = this.config.successValue;
    }
  },

  service: null,

  state: null,

  expectedValue: null,

  config: null,

  waitDone: false,

  Listeners: {
    retry: new AWS.SequentialExecutor().addNamedListeners(function(add) {
      add('RETRY_CHECK', 'retry', function(resp) {
        var waiter = resp.request._waiter;
        if (resp.error && resp.error.code === 'ResourceNotReady') {
          resp.error.retryDelay = waiter.config.interval * 1000;
        }
      });
    }),

    output: new AWS.SequentialExecutor().addNamedListeners(function(add) {
      add('CHECK_OUT_ERROR', 'extractError', function CHECK_OUT_ERROR(resp) {
        if (resp.error) {
          resp.request._waiter.setError(resp, true);
        }
      });

      add('CHECK_OUTPUT', 'extractData', function CHECK_OUTPUT(resp) {
        var waiter = resp.request._waiter;
        var success = waiter.checkSuccess(resp);
        if (!success) {
          waiter.setError(resp, success === null ? false : true);
        } else {
          resp.error = null;
        }
      });
    }),

    error: new AWS.SequentialExecutor().addNamedListeners(function(add) {
      add('CHECK_ERROR', 'extractError', function CHECK_ERROR(resp) {
        var waiter = resp.request._waiter;
        var success = waiter.checkError(resp);
        if (!success) {
          waiter.setError(resp, success === null ? false : true);
        } else {
          resp.error = null;
          resp.data = {};
          resp.request.removeAllListeners('extractData');
        }
      });

      add('CHECK_ERR_OUTPUT', 'extractData', function CHECK_ERR_OUTPUT(resp) {
        resp.request._waiter.setError(resp, true);
      });
    })
  },

  /**
   * @return [AWS.Request]
   */
  wait: function wait(params, callback) {
    if (typeof params === 'function') {
      callback = params; params = undefined;
    }

    var request = this.service.makeRequest(this.config.operation, params);
    var listeners = this.Listeners[this.config.successType];
    request._waiter = this;
    request.response.maxRetries = this.config.maxAttempts;
    request.addListeners(this.Listeners.retry);
    if (listeners) request.addListeners(listeners);

    if (callback) request.send(callback);
    return request;
  },

  setError: function setError(resp, retryable) {
    resp.data = null;
    resp.error = AWS.util.error(resp.error || new Error(), {
      code: 'ResourceNotReady',
      message: 'Resource is not in the state ' + this.state,
      retryable: retryable
    });
  },

  /**
   * Checks if the terminal expected success state has been met
   * @return [Boolean]
   */
  checkSuccess: function checkSuccess(resp) {
    if (!this.config.successPath) {
      return resp.httpResponse.statusCode < 300;
    }

    var r = AWS.util.jamespath.find(this.config.successPath, resp.data);

    if (this.config.failureValue &&
        this.config.failureValue.indexOf(r) >= 0) {
      return null; // fast fail
    }

    if (this.expectedValue) {
      return r === this.expectedValue;
    } else {
      return r ? true : false;
    }
  },

  /**
   * Checks if the terminal expected error state has been met
   * @return [Boolean]
   */
  checkError: function checkError(resp) {
    var value = this.config.successValue;
    if (typeof value === 'number') {
      return resp.httpResponse.statusCode === value;
    } else {
      return resp.error && resp.error.code === value;
    }
  },

  /**
   * Loads waiter configuration from API configuration and deals with inherited
   * properties.
   *
   * @api private
   */
  loadWaiterConfig: function loadWaiterConfig(state, noException) {
    if (!this.service.api.waiters[state]) {
      if (noException) return;
      throw new AWS.util.error(new Error(), {
        code: 'StateNotFoundError',
        message: 'State ' + state + ' not found.'
      });
    }

    this.config = this.service.api.waiters[state];
    var config = this.config;

    // inherit acceptor data
    (function () { // anonymous function to avoid max complexity count
      config.successType = config.successType || config.acceptorType;
      config.successPath = config.successPath || config.acceptorPath;
      config.successValue = config.successValue || config.acceptorValue;
      config.failureType = config.failureType || config.acceptorType;
      config.failurePath = config.failurePath || config.acceptorPath;
      config.failureValue = config.failureValue || config.acceptorValue;
    })();
  }
});
