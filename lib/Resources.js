'use strict';

const SError           = require('./Error'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

module.exports = function(S) {

  class Resources extends S.classes.Serializer {

    constructor(data, filePath) {

      super();

      this._class = 'Resources';
      this._filePath = filePath;
      this._name = 'defaultResources';

      this.AWSTemplateFormatVersion = "2010-09-09";
      this.Description = "The AWS CloudFormation template for this Serverless application's resources outside of Lambdas and Api Gateway";
      this.Resources = {
        "IamRoleLambda": {
          "Type": "AWS::IAM::Role",
          "Properties": {
            "AssumeRolePolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Principal": {
                    "Service": [
                      "lambda.amazonaws.com"
                    ]
                  },
                  "Action": [
                    "sts:AssumeRole"
                  ]
                }
              ]
            },
            "Path": "/"
          }
        },
        "IamPolicyLambda": {
          "Type": "AWS::IAM::Policy",
          "Properties": {
            "PolicyName": "${stage}-${project}-lambda",
            "PolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                  ],
                  "Resource": "arn:aws:logs:${region}:*:*"
                }
              ]
            },
            "Roles": [
              {
                "Ref": "IamRoleLambda"
              }
            ]
          }
        }
      };
      this.Outputs = {
        "IamRoleArnLambda": {
          "Description": "ARN of the lambda IAM role",
          "Value": {
            "Fn::GetAtt": [
              "IamRoleLambda",
              "Arn"
            ]
          }
        }
      };

      if (data) this.fromObject(data);

    }

    load() {
      return this.deserialize(this);
    }

    save() {
      return this.serialize(this);
    }

    getName() {
      return this._name;
    }

    getProject() {
      return S._project;
    }

    toObject() {
      return S.utils.exportObject(_.cloneDeep(this));
    }

    toObjectPopulated(options) {
      options = options || {};

      // Validate: Check project path is set
      if (!S.hasProject()) throw new SError('Resources could not be populated because no project path has been set on Serverless instance');

      // Populate
      return S.utils.populate(this.getProject(), this.getProject().getTemplates(), this.toObject(), options.stage, options.region);
    }

    fromObject(data) {
      return _.assign(this, data);
    }

    getFilePath() {
      return this._filePath;
    }

    getRootPath() {
      let args = _.toArray(arguments);
      args.unshift(path.dirname(this.getFilePath()));
      return path.join.apply(path, args);
    }
  }

  return Resources;

};