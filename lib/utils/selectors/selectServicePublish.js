'use strict';

const _ = require('lodash');

const selectServicePublish = (service) => _.get(service, 'serviceObject.publish', true);

module.exports = selectServicePublish;
