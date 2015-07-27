'use strict';

var crypto = require('crypto');
var randomBytes = crypto.randomBytes;

function randomByte() {
    return randomBytes(1)[0] & 0x30;
}

module.exports = randomByte;
