'use strict';

const chai = require('chai');

const runServerless = require('../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/lib/plugins/print.test.js', () => {
  it('correctly prints config', async () => {
    const { stdoutData } = await runServerless({
      fixture: 'aws',
      command: 'print',
    });

    expect(stdoutData).to.include('name: aws');
  });
});
