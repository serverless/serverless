'use strict';

// class wide constants
const recommendedList = require('./index');

let lastGroupName = null;
let result = '';
let lineCount = 0;
const templateGroupRe = /^([a-z0-9]+)(-|$)/;
for (const templateName of recommendedList) {
  const groupName = templateName.match(templateGroupRe)[1];
  if (groupName !== lastGroupName || lineCount === 8) {
    result += `\n${' '.repeat(45)}"${templateName}"`;
    lastGroupName = groupName;
    lineCount = 1;
  } else {
    result += `, "${templateName}"`;
    ++lineCount;
  }
}

module.exports = result;
