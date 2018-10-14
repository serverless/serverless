'use strict';

const _ = require('lodash');

class AwsCompileCodeCommitEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileCodeCommitEvents.bind(this),
    };
  }

  compileCodeCommitEvents() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.git) {
            let repositoryArn;
            let repositoryName;
            let repositoryDescription = ' ';
            let repositoryTriggers;

            const lambdaLogicalId = this.provider.naming
							.getLambdaLogicalId(functionName);

            const endpoint = {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            };

            if (typeof event.git === 'object') {
              if (event.git.arn) {
                if (typeof event.git.arn === 'object' ||
                  typeof event.git.arn === 'string') {
                  if (event.git.repositoryName && typeof event.git.repositoryName === 'string') {
                    repositoryArn = event.git.arn;
                    repositoryName = event.git.repositoryName;
                  } else if (event.git.arn.indexOf('arn:') === 0) {
                    repositoryArn = event.git.arn;
                    const splitArn = repositoryArn.split(':');
                    repositoryName = splitArn[splitArn.length - 1];
                  } else {
                    const errorMessage = [
                      'Missing or invalid repositoryName property for git event',
                      ` in function "${functionName}"`,
                      ' The correct syntax is: git: repository-name-or-arn',
                      ' OR an object with "repositoryName" property.',
                      ' Please check the docs for more info.',
                    ].join('');
                    throw new this.serverless.classes
											.Error(errorMessage);
                  }
                } else {
                  const errorMessage = [
                    'Invalid value type provided .arn property for git event',
                    ` in function ${functionName}`,
                    ' The correct types are: object, string.',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
										.Error(errorMessage);
                }
              } else if (typeof event.git.repositoryName === 'string') {
                repositoryName = event.git.repositoryName;
              } else {
                const errorMessage = [
                  'Missing or invalid repositoryName property for git event',
                  ` in function "${functionName}"`,
                  ' The correct syntax is: git: repository-name-or-arn',
                  ' OR an object with "repositoryName" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
										.Error(errorMessage);
              }

              if (event.git.repositoryDescription) {
                if (typeof event.git.repositoryDescription === 'string') {
                  repositoryDescription = event.git.repositoryDescription;
                } else {
                  const errorMessage = [
                    'Invalid repositoryDescription property for git event',
                    ` in function "${functionName}"`,
                    ' The correct syntax is an object with "repositoryDescription" property.',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
										.Error(errorMessage);
                }
              }

              if (event.git.triggers) {
                if (_.isArray(event.git.triggers)) {
                  repositoryTriggers = [];
                  event.git.triggers.forEach((trigger) => {
                    const repositoryTrigger = {
                      DestinationArn: endpoint,
                    };

                    if (trigger.name && typeof trigger.name === 'string') {
                      repositoryTrigger.Name = trigger.name;
                    } else {
                      const errorMessage = [
                        'Missing or invalid trigger name property for git event',
                        ` in function "${functionName}"`,
                        ' The correct syntax is an object with "triggers" array',
                        ' and "name" property.',
                        ' Please check the docs for more info.',
                      ].join('');
                      throw new this.serverless.classes
												.Error(errorMessage);
                    }

                    if (trigger.branches) {
                      if (_.isArray(trigger.branches)) {
                        repositoryTrigger.Branches = trigger.branches;
                      } else {
                        const errorMessage = [
                          'Invalid trigger branches property for git event',
                          ` in function "${functionName}"`,
                          ' The correct syntax is an object with "triggers" array',
                          ' and "branches" array.',
                          ' Please check the docs for more info.',
                        ].join('');
                        throw new this.serverless.classes
													.Error(errorMessage);
                      }
                    }

                    if (trigger.events) {
                      if (_.isArray(trigger.events)) {
                        repositoryTrigger.Events = trigger.events;
                      } else {
                        const errorMessage = [
                          'Invalid trigger events property for git event',
                          ` in function "${functionName}"`,
                          ' The correct syntax is an object with "triggers" array',
                          ' and "events" array.',
                          ' Please check the docs for more info.',
                        ].join('');
                        throw new this.serverless.classes
													.Error(errorMessage);
                      }
                    }

                    if (trigger.customData) {
                      if (typeof trigger.customData === 'string') {
                        repositoryTrigger.CustomData = trigger.customData;
                      } else {
                        const errorMessage = [
                          'Invalid trigger customData property for git event',
                          ` in function "${functionName}"`,
                          ' The correct syntax is an object with "triggers" array',
                          ' and "customData" property.',
                          ' Please check the docs for more info.',
                        ].join('');
                        throw new this.serverless.classes
													.Error(errorMessage);
                      }
                    }

                    repositoryTriggers.push(repositoryTrigger);
                  });
                } else {
                  const errorMessage = [
                    'Invalid triggers property for git event',
                    ` in function "${functionName}"`,
                    ' The correct syntax is an object with array "triggers" property.',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
										.Error(errorMessage);
                }
              } else {
                const repositoryTriggerLogicalId = this.provider.naming
									.getLambdaGitTriggerLogicalId(functionName, repositoryName);

                repositoryTriggers = [
                  {
                    DestinationArn: endpoint,
                    Name: repositoryTriggerLogicalId,
                    Events: ['all'],
                  },
                ];
              }
            } else if (typeof event.git === 'string') {
              if (event.git.indexOf('arn:') === 0) {
                repositoryArn = event.git;
                const splitArn = repositoryArn.split(':');
                repositoryName = splitArn[splitArn.length - 1];
              } else {
                repositoryName = event.git;
              }
              const repositoryTriggerLogicalId = this.provider.naming
								.getLambdaGitTriggerLogicalId(functionName, repositoryName);

              repositoryTriggers = [
                {
                  DestinationArn: endpoint,
                  Name: repositoryTriggerLogicalId,
                  Events: ['all'],
                },
              ];
            } else {
              const errorMessage = [
                `CodeCommit event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: git: repository-name-or-arn',
                ' OR an object with "repositoryName" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
								.Error(errorMessage);
            }

            const repositoryLogicalId = this.provider.naming
							.getGitRepositoryId(repositoryName);

            if (!repositoryArn) {
              _.merge(template.Resources, {
                [repositoryLogicalId]: {
                  Type: 'AWS::CodeCommit::Repository',
                  Properties: {
                    RepositoryName: repositoryName,
                    RepositoryDescription: repositoryDescription,
                    Triggers: repositoryTriggers,
                  },
                },
              });
              repositoryArn = {
                'Fn::Join': ['',
                  [
                    'arn:',
										{ Ref: 'AWS::Partition' },
                    ':codecommit:',
										{ Ref: 'AWS::Region' },
                    ':',
										{ Ref: 'AWS::AccountId' },
                    ':',
                    repositoryName,
                  ],
                ],
              };

              const repositoryLogicalArn = this.provider.naming
								.getGitRepositoryArn(repositoryName);

              _.merge(template.Outputs, {
                [repositoryLogicalArn]: {
                  Value: repositoryArn,
                },
              });
            }

            const lambdaPermissionLogicalId = this.provider.naming
							.getLambdaGitPermissionLogicalId(functionName, repositoryName);

            _.merge(template.Resources, {
              [lambdaPermissionLogicalId]: {
                Type: 'AWS::Lambda::Permission',
                Properties: {
                  FunctionName: endpoint,
                  Action: 'lambda:InvokeFunction',
                  Principal: { 'Fn::Join': ['', ['codecommit.', { Ref: 'AWS::URLSuffix' }]] },
                  SourceArn: repositoryArn,
                },
              },
            });
          }
        });
      }
    });
  }
}

module.exports = AwsCompileCodeCommitEvents;
