'use strict';

/**
 * JAWS Services: AWS: API Gateway
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    JawsError = require('../jaws-error/index'),
    JawsUtils = require('../utils'),
    async     = require('async'),
    fs        = require('fs');

// Require configured AWS-SDK
const AWS = require('./aws').aws;


