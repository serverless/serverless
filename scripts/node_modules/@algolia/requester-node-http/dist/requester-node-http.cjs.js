'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var http = require('http');
var https = require('https');
var URL = require('url');

/* eslint functional/prefer-readonly-type: 0 */
const agentOptions = { keepAlive: true };
const defaultHttpAgent = new http.Agent(agentOptions);
const defaultHttpsAgent = new https.Agent(agentOptions);
function createNodeHttpRequester({ agent: userGlobalAgent, httpAgent: userHttpAgent, httpsAgent: userHttpsAgent, requesterOptions = {}, } = {}) {
    const httpAgent = userHttpAgent || userGlobalAgent || defaultHttpAgent;
    const httpsAgent = userHttpsAgent || userGlobalAgent || defaultHttpsAgent;
    return {
        send(request) {
            return new Promise(resolve => {
                const url = URL.parse(request.url);
                const path = url.query === null ? url.pathname : `${url.pathname}?${url.query}`;
                const options = {
                    ...requesterOptions,
                    agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
                    hostname: url.hostname,
                    path,
                    method: request.method,
                    headers: {
                        ...(requesterOptions && requesterOptions.headers ? requesterOptions.headers : {}),
                        ...request.headers,
                    },
                    ...(url.port !== undefined ? { port: url.port || '' } : {}),
                };
                const req = (url.protocol === 'https:' ? https : http).request(options, response => {
                    // eslint-disable-next-line functional/no-let
                    let contentBuffers = [];
                    response.on('data', chunk => {
                        contentBuffers = contentBuffers.concat(chunk);
                    });
                    response.on('end', () => {
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define
                        clearTimeout(connectTimeout);
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define
                        clearTimeout(responseTimeout);
                        resolve({
                            status: response.statusCode || 0,
                            content: Buffer.concat(contentBuffers).toString(),
                            isTimedOut: false,
                        });
                    });
                });
                const createTimeout = (timeout, content) => {
                    return setTimeout(() => {
                        req.abort();
                        resolve({
                            status: 0,
                            content,
                            isTimedOut: true,
                        });
                    }, timeout * 1000);
                };
                const connectTimeout = createTimeout(request.connectTimeout, 'Connection timeout');
                // eslint-disable-next-line functional/no-let
                let responseTimeout;
                req.on('error', error => {
                    clearTimeout(connectTimeout);
                    clearTimeout(responseTimeout);
                    resolve({ status: 0, content: error.message, isTimedOut: false });
                });
                req.once('response', () => {
                    clearTimeout(connectTimeout);
                    responseTimeout = createTimeout(request.responseTimeout, 'Socket timeout');
                });
                if (request.data !== undefined) {
                    req.write(request.data);
                }
                req.end();
            });
        },
        destroy() {
            httpAgent.destroy();
            httpsAgent.destroy();
            return Promise.resolve();
        },
    };
}

exports.createNodeHttpRequester = createNodeHttpRequester;
