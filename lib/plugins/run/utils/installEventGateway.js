'use strict';

const download = require('download');
const os = require('os');
const path = require('path');

function installEventGateway(eventGatewayVersion) {
  let eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_darwin_386.tar.gz`;

  if (os.platform() === 'linux') {
    eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_linux_386.tar.gz`;
  } else if (os.platform() === 'win32') {
    eventGatewayDownloadUrl = `https://github.com/serverless/event-gateway/releases/download/${eventGatewayVersion}/event-gateway_${eventGatewayVersion}_windows_386.tar.gz`;
  }
  const eventGatewayDownloadPath = path.join(os.homedir(), '.serverless', 'event-gateway');

  return download(
    eventGatewayDownloadUrl,
    eventGatewayDownloadPath,
    { timeout: 30000, extract: true, strip: 1, mode: '755' }
  );
}

module.exports = installEventGateway;
