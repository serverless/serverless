'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCodeCommitEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileCodeCommitEvents', () => {
  let serverless;
  let awsCompileCodeCommitEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileCodeCommitEvents = new AwsCompileCodeCommitEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
			expect(awsCompileCodeCommitEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileCodeCommitEvents()', () => {
    it('does nothing if lambda has no events', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {},
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(0);
    });

    it('does nothing if lambda has non git events', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              foo: 42,
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(0);
    });

    it('should create corresponding resources when CodeCommit events are given', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'Repo 1',
                repositoryDescription: 'my first CodeCommit repository',
                triggers: [
                  {
                    name: 'repo1Trigger',
                    events: [
                      'createReference',
                    ],
                    branches: [
                      'repo1Branch',
                    ],
                  },
                ],
              },
            },
            {
              git: {
                repositoryName: 'Repo 2',
              },
            },
            {
              git: 'Repo 3',
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo1.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo2.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo3.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo1GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo2GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo3GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate
				.Resources.GitRepositoryRepo1.Properties
			).to.eql({
  RepositoryName: 'Repo 1',
  RepositoryDescription: 'my first CodeCommit repository',
  Triggers: [
    {
      Name: 'repo1Trigger',
      Events: [
        'createReference',
      ],
      Branches: [
        'repo1Branch',
      ],
      DestinationArn: {
        'Fn::GetAtt': [
          'FirstLambdaFunction',
          'Arn',
        ],
      },
    },
  ],
});
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate
				.Resources.GitRepositoryRepo2.Properties
			).to.eql({
  RepositoryName: 'Repo 2',
  RepositoryDescription: ' ',
  Triggers: [
    {
      Name: 'FirstGitRepositoryRepo2Trigger',
      DestinationArn: {
        'Fn::GetAtt': [
          'FirstLambdaFunction',
          'Arn',
        ],
      },
      Events: [
        'all',
      ],
    },
  ],
});
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate
				.Resources.GitRepositoryRepo3.Properties
			).to.eql({
  RepositoryName: 'Repo 3',
  RepositoryDescription: ' ',
  Triggers: [
    {
      Name: 'FirstGitRepositoryRepo3Trigger',
      DestinationArn: {
        'Fn::GetAtt': [
          'FirstLambdaFunction',
          'Arn',
        ],
      },
      Events: [
        'all',
      ],
    },
  ],
});
    });

    it('should create corresponding resources when repository is defined in resources', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'Repo 1',
                triggers: [
                  {
                    name: 'repo1Trigger',
                    events: [
                      'createReference',
                    ],
                    branches: [
                      'repo1Branch',
                    ],
                    customData: 'newBranch',
                  },
                ],
              },
            },
            {
              git: 'Repo 2',
            },
          ],
        },
      };

      Object.assign(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources, {
  GitRepositoryRepo2: {
    Type: 'AWS::CodeCommit::Repository',
    Properties: {
      RepositoryName: 'Repo 2',
      RepositoryDescription: '',
      Triggers: [
        {
          Name: 'FirstGitRepositoryRepo3Trigger',
          DestinationArn: {
            'Fn::GetAtt': [
              'FirstLambdaFunction',
              'Arn',
            ],
          },
        },
      ],
    },
  },
});

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo1.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo2.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo1GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo2GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate
				.Resources.GitRepositoryRepo1.Properties
			).to.eql({
  RepositoryName: 'Repo 1',
  RepositoryDescription: ' ',
  Triggers: [
    {
      Name: 'repo1Trigger',
      Events: [
        'createReference',
      ],
      Branches: [
        'repo1Branch',
      ],
      CustomData: 'newBranch',
      DestinationArn: {
        'Fn::GetAtt': [
          'FirstLambdaFunction',
          'Arn',
        ],
      },
    },
  ],
});
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate
				.Resources.GitRepositoryRepo2.Properties
			).to.eql({
  RepositoryName: 'Repo 2',
  RepositoryDescription: ' ',
  Triggers: [
    {
      Name: 'FirstGitRepositoryRepo2Trigger',
      DestinationArn: {
        'Fn::GetAtt': [
          'FirstLambdaFunction',
          'Arn',
        ],
      },
      Events: [
        'all',
      ],
    },
  ],
});
    });

    it('should expose the repository in the CloudFormation Outputs', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: 'Repo 1',
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Outputs.GitRepositoryRepo1Arn.Value
			).to.eql({
  'Fn::Join': ['',
    [
      'arn:',
      { Ref: 'AWS::Partition' },
      ':codecommit:',
      { Ref: 'AWS::Region' },
      ':',
      { Ref: 'AWS::AccountId' },
      ':',
      'Repo 1',
    ],
  ],
});
    });

    it(['should create single CodeCommit repository when same repository',
      'is referenced repeatedly'].join(''), () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'Repo 1',
                triggers: [
                  {
                    name: 'repo1Trigger',
                    events: [
                      'createReference',
                    ],
                    branches: [
                      'repo1Branch',
                    ],
                    customData: 'newBranch',
                  },
                ],
              },
            },
            {
              git: 'Repo 1',
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(2);
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources.GitRepositoryRepo1.Type
			).to.equal('AWS::CodeCommit::Repository');
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionRepo1GitRepository.Type
			).to.equal('AWS::Lambda::Permission');
    });

    it('should not create corresponding resources when CodeCommit events are not given', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(
				awsCompileCodeCommitEvents.serverless.service.provider.compiledCloudFormationTemplate
					.Resources
			).to.deep.equal({});
    });

    it('should not create CodeCommit repository when arn is given as a string', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: 'arn:aws:foo',
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(1);
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionFooGitRepository.Type
			).to.equal('AWS::Lambda::Permission');
    });

    it('should not create CodeCommit repository when arn is given as an object property', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                arn: 'arn:aws:codecommit:region:accountid:foo',
              },
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(1);
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionFooGitRepository.Type
			).to.equal('AWS::Lambda::Permission');
    });

    it(['should not create CodeCommit repository when arn, repositoryName',
      'are given as object properties'].join(''), () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'bar',
                arn: 'arn:aws:codecommit:region:accountid:bar',
              },
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(1);
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionBarGitRepository.Type
			).to.equal('AWS::Lambda::Permission');
    });

    it(['should not create CodeCommit repository when arn, repositoryName,',
      'triggers are given as object properties'].join(''), () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'bar',
                arn: 'arn:aws:codecommit:region:accountid:bar',
                triggers: [
                  {
                    name: 'barTrigger',
                    events: [
                      'createReference',
                    ],
                    branches: [
                      'barBranch',
                    ],
                    customData: 'newBranch',
                  },
                ],
              },
            },
          ],
        },
      };

      awsCompileCodeCommitEvents.compileCodeCommitEvents();

      expect(Object.keys(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources)
			).to.have.length(1);
      expect(awsCompileCodeCommitEvents.serverless.service
				.provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionBarGitRepository.Type
			).to.equal('AWS::Lambda::Permission');
    });

    it('should throw an error if CodeCommit event type is not a string or an object', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: 42,
            },
          ],
        },
      };

      expect(() => awsCompileCodeCommitEvents.compileCodeCommitEvents()).to.throw(Error);
    });

    it('should throw an error when event is an object and the repositoryName is not given', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                triggers: [
                  {
                    name: 'repo1Trigger',
                    events: [
                      'createReference',
                    ],
                    branches: [
                      'repo1Branch',
                    ],
                    customData: 'newBranch',
                  },
                ],
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event is an object and the arn is not a string', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                arn: 123,
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event is an object and the arn is malformed', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                arn: 'ooops',
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event repositoryDescription property is not a string', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                repositoryDescription: 123,
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event triggers property is not an array', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                triggers: 123,
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event trigger name property is not a string', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                triggers: [
                  {
                    name: 123,
                  },
                ],
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event trigger customData property is not a string', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                triggers: [
                  {
                    name: 'fooTrigger',
                    customData: 123,
                  },
                ],
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event trigger events property is not an array', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                triggers: [
                  {
                    name: 'fooTrigger',
                    events: 123,
                  },
                ],
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });

    it('should throw an error when event trigger branches property is not an array', () => {
      awsCompileCodeCommitEvents.serverless.service.functions = {
        first: {
          events: [
            {
              git: {
                repositoryName: 'foo',
                triggers: [
                  {
                    name: 'fooTrigger',
                    branches: 123,
                  },
                ],
              },
            },
          ],
        },
      };

      expect(() => { awsCompileCodeCommitEvents.compileCodeCommitEvents(); }).to.throw(Error);
    });
  });
});
