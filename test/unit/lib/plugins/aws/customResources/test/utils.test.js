'use strict';

const { expect } = require('chai');
const {
  getLambdaArn,
  getEnvironment,
} = require('../../../../../../../lib/plugins/aws/customResources/resources/utils');

[
  { partition: 'aws', region: 'us-east-1' },
  { partition: 'aws-us-gov', region: 'us-gov-west-1' },
  { partition: 'aws-cn', region: 'cn-north-1' },
].forEach(({ partition, region }) => {
  describe(`#getLambdaArn() (${partition} ${region})`, () => {
    it('should return the Lambda arn', () => {
      const accountId = '123456';
      const functionName = 'some-function';
      const arn = getLambdaArn(partition, region, accountId, functionName);

      expect(arn).to.equal(`arn:${partition}:lambda:${region}:123456:function:some-function`);
    });
    it('should return the Lambda arn for version', () => {
      const accountId = '123456';
      const functionName = 'some-function';
      const functionVersion = '1';
      const arn = getLambdaArn(partition, region, accountId, functionName, functionVersion);

      expect(arn).to.equal(`arn:${partition}:lambda:${region}:123456:function:some-function:1`);
    });
    it('should return the Lambda arn for alias', () => {
      const accountId = '123456';
      const functionName = 'some-function';
      const functionVersion = 'provisioned';
      const arn = getLambdaArn(partition, region, accountId, functionName, functionVersion);

      expect(arn).to.equal(
        `arn:${partition}:lambda:${region}:123456:function:some-function:provisioned`
      );
    });
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
