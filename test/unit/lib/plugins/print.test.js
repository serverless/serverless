'use strict';

const chai = require('chai');

const runServerless = require('../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/lib/plugins/print.test.js', () => {
  it('correctly prints config', async () => {
    const { output } = await runServerless({
      fixture: 'aws',
      command: 'print',
    });

    expect(output).to.include('name: aws');
  });
});
