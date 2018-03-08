'use strict';

const download = require('download');
const os = require('os');
const path = require('path');

function installEventGateway(eventGatewayVersion) {
  let arch = '386';
  if (process.arch === 'x64') {
    arch = 'amd64';
  }

  let eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_darwin_${arch}.tar.gz`;

  if (os.platform() === 'linux') {
    eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_linux_${arch}.tar.gz`;
  } else if (os.platform() === 'win32') {
    eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_windows_${arch}.tar.gz`;
  }
  const eventGatewayDownloadPath = path.join(os.homedir(), '.serverless', 'event-gateway');

  return download(
    eventGatewayDownloadUrl,
    eventGatewayDownloadPath,
    { timeout: 30000, extract: true, strip: 1, mode: '755' }
  );
}

module.exports = installEventGateway;
