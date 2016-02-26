'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

class Resources extends SerializerFileSystem {

  constructor(S, data) {
    super(S);
    this._S        = S;
    this._class    = 'Resources';
    this._config   = config;
    this._partials = [];

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
  }

  load() {
    return this.deserialize(this);
  }

  save() {
    return this.serialize(this);
  }

  getName() {
    return this.name;
  }

  getProject() {
    return this._S._project;
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Resources could not be populated because no project path has been set on Serverless instance');

    // Populate
    return SUtils.populate(this.getProject(), {}, this.toObject(), options.stage, options.region);
  }

  fromObject(data) {
    return _.assign(this, data);
  }

  /**
   * Set Partials
   * - Optional: For file system serializer
   * Format: { filePath: "", partial: {} }
   */

  // TODO: Backwards Compatibility support.  Move to SerializerFileSystem and remove eventually

  _setPartial(p) {
    this._partials.push(p);
  }
}

module.exports = Resources;
