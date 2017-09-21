'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const os = require('os');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('logEventGateway', () => {
  let logStub;
  let logEventGateway;

  beforeEach(() => {
    logStub = sinon.stub();
    logEventGateway = proxyquire('./logEventGateway', {
      './log': logStub,
    });
  });

  it('format and log function added', () => {
    logEventGateway(
      JSON.stringify({
        level: 'DEBUG',
        msg: 'Function registered.',
        functionId: 's1-f1',
        type: 'http',
      })
    );
    expect(logStub.calledOnce).to.be.equal(true);
    const expected = ` Event Gateway  Function 's1-f1' registered${os.EOL}`;
    expect(logStub.getCall(0).args[0]).to.be.equal(expected);
  });

  it('format and log event received', () => {
    logEventGateway(
      JSON.stringify({
        level: 'debug',
        ts: 1502464166.8101041,
        msg: 'Event received.',
        event:
          '{"headers":{"Accept":["image/webp,image/apng,image/*,*/*;q=0.8"],"Accept-Encoding":["gzip, deflate, br"],"Accept-Language":["en-US,en;q=0.8"],"Cache-Control":["no-cache"],"Connection":["keep-alive"],"Pragma":["no-cache"],"Referer":["http://localhost:4000/"],"User-Agent":["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36"]},"query":{},"body":""}',
        path: '/favicon.ico',
        method: 'GET',
      })
    );
    expect(logStub.calledOnce).to.be.equal(true);
    const expected = [
      ' Event Gateway  Event \'undefined\' received:',
      '',
      '  {',
      '    "headers": {',
      '      "Accept": [',
      '        "image/webp,image/apng,image/*,*/*;q=0.8"',
      '      ],',
      '      "Accept-Encoding": [',
      '        "gzip, deflate, br"',
      '      ],',
      '      "Accept-Language": [',
      '        "en-US,en;q=0.8"',
      '      ],',
      '      "Cache-Control": [',
      '        "no-cache"',
      '      ],',
      '      "Connection": [',
      '        "keep-alive"',
      '      ],',
      '      "Pragma": [',
      '        "no-cache"',
      '      ],',
      '      "Referer": [',
      '        "http://localhost:4000/"',
      '      ],',
      '      "User-Agent": [', // eslint-disable-next-line max-len
      '        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36"',
      '      ]',
      '    },',
      '    "query": {},',
      '    "body": ""',
      '  }',
      '',
      '',
    ].join(os.EOL);
    expect(logStub.getCall(0).args[0]).to.be.equal(expected);
  });
});
