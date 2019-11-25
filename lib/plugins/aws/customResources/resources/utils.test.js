'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const { expect } = require('chai');
const { getLambdaArn, getEnvironment } = require('./utils');

describe('#getLambdaArn()', () => {
  it('should return the Lambda arn', () => {
    const partition = 'aws';
    const region = 'us-east-1';
    const accountId = '123456';
    const functionName = 'some-function';
    const arn = getLambdaArn(partition, region, accountId, functionName);

    expect(arn).to.equal('arn:aws:lambda:us-east-1:123456:function:some-function');
  });
});

describe('#getLambdaArn() govloud west', () => {
  it('should return the govcloud Lambda arn', () => {
    const partition = 'aws-us-gov';
    const region = 'us-gov-west-1';
    const accountId = '123456';
    const functionName = 'some-function';
    const arn = getLambdaArn(partition, region, accountId, functionName);

    expect(arn).to.equal('arn:aws-us-gov:lambda:us-gov-west-1:123456:function:some-function');
  });
});

describe('#getLambdaArn() govcloud east', () => {
  it('should return the govcloud Lambda arn', () => {
    const partition = 'aws-us-gov';
    const region = 'us-gov-east-1';
    const accountId = '123456';
    const functionName = 'some-function';
    const arn = getLambdaArn(partition, region, accountId, functionName);

    expect(arn).to.equal('arn:aws-us-gov:lambda:us-gov-east-1:123456:function:some-function');
  });
});

describe('#getLambdaArn() china region', () => {
  it('should return the china Lambda arn', () => {
    const partition = 'aws-cn';
    const region = 'cn-north-1';
    const accountId = '123456';
    const functionName = 'some-function';
    const arn = getLambdaArn(partition, region, accountId, functionName);

    expect(arn).to.equal('arn:aws-cn:lambda:cn-north-1:123456:function:some-function');
  });
});

describe('#getEnvironment()', () => {
  it('should return an object with information about the execution environment', () => {
    const context = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456:function:some-function',
    };
    const env = getEnvironment(context);

    expect(env).to.deep.equal({
      LambdaArn: 'arn:aws:lambda:us-east-1:123456:function:some-function',
      Partition: 'aws',
      Region: 'us-east-1',
      AccountId: '123456',
      LambdaName: 'some-function',
    });
  });
});

describe('#getEnvironment() govcloud east', () => {
  it('should return an object with information about the govcloud execution environment', () => {
    const context = {
      invokedFunctionArn: 'arn:aws-us-gov:lambda:us-gov-east-1:123456:function:some-function',
    };
    const env = getEnvironment(context);

    expect(env).to.deep.equal({
      LambdaArn: 'arn:aws-us-gov:lambda:us-gov-east-1:123456:function:some-function',
      Partition: 'aws-us-gov',
      Region: 'us-gov-east-1',
      AccountId: '123456',
      LambdaName: 'some-function',
    });
  });
});

describe('#getEnvironment() govcloud west', () => {
  it('should return an object with information about the govcloud execution environment', () => {
    const context = {
      invokedFunctionArn: 'arn:aws-us-gov:lambda:us-gov-west-1:123456:function:some-function',
    };
    const env = getEnvironment(context);

    expect(env).to.deep.equal({
      LambdaArn: 'arn:aws-us-gov:lambda:us-gov-west-1:123456:function:some-function',
      Partition: 'aws-us-gov',
      Region: 'us-gov-west-1',
      AccountId: '123456',
      LambdaName: 'some-function',
    });
  });
});

describe('#getEnvironment() china region', () => {
  it('should return an object with information about the china region execution environment', () => {
    const context = {
      invokedFunctionArn: 'arn:aws-cn:lambda:cn-north-1:123456:function:some-function',
    };
    const env = getEnvironment(context);

    expect(env).to.deep.equal({
      LambdaArn: 'arn:aws-cn:lambda:cn-north-1:123456:function:some-function',
      Partition: 'aws-cn',
      Region: 'cn-north-1',
      AccountId: '123456',
      LambdaName: 'some-function',
    });
  });
});
