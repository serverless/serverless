'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileIoTEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileIoTEvents', () => {
  let serverless;
  let awsCompileIoTEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileIoTEvents = new AwsCompileIoTEvents(serverless);
    awsCompileIoTEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileIoTEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#awsCompileIoTEvents()', () => {
    it('should throw an error if iot event type is not an object', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: 'iot',
            },
          ],
        },
      };

      expect(() => awsCompileIoTEvents.compileIoTEvents()).to.throw(Error);
    });

    it('should create corresponding resources when iot events are given', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
            {
              iot: {
                sql: "SELECT * FROM 'topic_2'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Type
      ).to.equal('AWS::IoT::TopicRule');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule2.Type
      ).to.equal('AWS::IoT::TopicRule');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.Sql
      ).to.equal("SELECT * FROM 'topic_1'");
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule2.Properties.TopicRulePayload.Sql
      ).to.equal("SELECT * FROM 'topic_2'");
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.RuleDisabled
      ).to.equal('false');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule2.Properties.TopicRulePayload.RuleDisabled
      ).to.equal('false');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionIotTopicRule1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionIotTopicRule2.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect "name" variable', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                name: 'iotEventName',
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.RuleName
      ).to.equal('iotEventName');
    });

    it('should respect "enabled" variable', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                enabled: false,
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
        second: {
          events: [
            {
              iot: {
                enabled: true,
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.RuleDisabled
      ).to.equal('true');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SecondIotTopicRule1.Properties.TopicRulePayload.RuleDisabled
      ).to.equal('false');
    });

    it('should respect "sqlVersion" variable', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sqlVersion: '2016-03-23',
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.AwsIotSqlVersion
      ).to.equal('2016-03-23');
    });

    it('should respect "description" variable', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                description: 'iot event description',
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.Description
      ).to.equal('iot event description');
    });

    it('should respect enabled variable if the "enabled" property is not given', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.RuleDisabled
      ).to.equal('false');
    });

    it('should respect variables if multi-line variables is given', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                description: 'iot event description\n with newline',
                sql: "SELECT * FROM 'topic_1'\n WHERE value = 2",
                sqlVersion: 'beta\n',
                name: 'iotEventName\n',
              },
            },
          ],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.Sql
      ).to.equal("SELECT * FROM 'topic_1' WHERE value = 2");
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.AwsIotSqlVersion
      ).to.equal('beta');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.TopicRulePayload.Description
      ).to.equal('iot event description with newline');
      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstIotTopicRule1.Properties.RuleName
      ).to.equal('iotEventName');
    });

    it('should not create corresponding resources when iot events are not given', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileIoTEvents.compileIoTEvents();

      expect(
        awsCompileIoTEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
