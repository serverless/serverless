'use strict';

const download = require('download');
const os = require('os');
const path = require('path');

function installEventGateway() {
  const eventGatewayDownloadUrl = 'https://github.com/serverless/event-gateway/releases/download/0.2.0/event-gateway_0.2.0_darwin_amd64.tar.gz';
  const eventGatewayDownloadPath = path.join(os.homedir(), '.serverless', 'event-gateway');

  return download(
    eventGatewayDownloadUrl,
    eventGatewayDownloadPath,
    { timeout: 30000, extract: true, strip: 1, mode: '755' }
  );
}

module.exports = installEventGateway;
