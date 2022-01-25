'use strict';

const dayjs = require('dayjs');
const { style } = require('@serverless/utils/log');

module.exports = (msgParam) => {
  let msg = msgParam;
  const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS';

  if (!msg.startsWith('REPORT')) msg = msg.trimRight();

  if (msg.startsWith('START')) {
    msg = 'START';
    return style.aside(msg);
  }

  if (msg.startsWith('REPORT')) {
    const splitted = msg.split('\t');
    // Replace REPORT with END and filter out RequestId
    msg = `END ${splitted.slice(1).join('\t')}`;
    return style.aside(msg);
  }

  if (msg.trim() === 'Process exited before completing request') {
    return style.error(msg);
  }

  const splitted = msg.split('\t');

  if (splitted.length < 3) {
    return msg;
  }

  let date = '';
  let reqId = '';
  let level = '';
  if (!isNaN(new Date(splitted[0]).getTime())) {
    date = splitted[0];
    reqId = splitted[1];
  } else if (!isNaN(new Date(splitted[1]).getTime())) {
    date = splitted[1];
    reqId = splitted[2];
    level = `${splitted[0]}\t`;
  } else {
    return msg;
  }
  const text = msg.split(`${reqId}\t`)[1];
  const time = dayjs(date).format(dateFormat);

  return `${style.aside(`${time}\t`)}${level}${text}`;
};
