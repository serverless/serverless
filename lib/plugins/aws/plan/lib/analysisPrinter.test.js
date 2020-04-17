'use strict';
/* eslint-env mocha */
const chai = require('chai');
const printer = require('./analysisPrinter');

const expect = chai.expect;

const stack = {
  Parameters: [],
  Tags: [
    {
      Key: 'STAGE',
      Value: 'dev',
    },
  ],
};

const changeSet = {
  StackName: 'aws-sls-dev',
  Parameters: [],
  Tags: [
    {
      Key: 'STAGE',
      Value: 'dev1',
    },
  ],
  Changes: [
    {
      Type: 'Resource',
      ResourceChange: {
        Action: 'Modify',
        LogicalResourceId: 'HelloLambdaFunction',
        ResourceType: 'AWS::Lambda::Function',
        Replacement: 'False',
        Details: [
          {
            Target: {
              Attribute: 'Properties',
              Name: 'Code',
              RequiresRecreation: 'Never',
            },
            Evaluation: 'Static',
            ChangeSource: 'DirectModification',
          },
        ],
      },
    },
  ],
};

describe('AWSPlan analysis printer module', () => {
  let message = '';
  printer.print(
    {
      log: msg => {
        message += `${msg}\n`;
      },
    },
    stack,
    changeSet
  );

  it('should print code change', () => {
    expect(message).to.have.string('Code will change');
  });

  it('should print tag change', () => {
    expect(message).to.have.string('Tag Changes');
  });
});
