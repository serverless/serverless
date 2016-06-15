'use strict';

/**
 * Action: Event Remove
 * - Removes Event Sources from a lambda function
 * - Loops sequentially through each Region in specified Stage
 *
 * Options:
 * - stage:              (String)  The stage to remove from
 * - region:             (String)  The region in the stage to remove from
 * - paths:              (Array)   Array of event paths to remove.  Format: ['users/show#eventName']
 * - all:                (Boolean) Indicates whether all Events in the project should be removed.
 */

module.exports = function(S) {

  const path   = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash');

  class EventRemove extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventRemove.bind(this), {
        handler:       'eventRemove',
        description:   'Removes event sources from lambdas',
        context:       'event',
        contextAction: 'remove',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Target one region to remove from'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Remove all Events'
          }
        ],
        parameters: [
          {
            parameter: 'names',
            description: 'One or multiple event names',
            position: '0->'
          }
        ]
      });

      return BbPromise.resolve();
    }

    eventRemove(evt) {
      return EventRemover.run(evt);
    }
  }


class EventRemover extends S.classes.Plugin {

    constructor(evt) {
      super();
      this.evt = evt;

      // Instantiate Classes
      this.project = S.getProject();
      this.aws     = S.getProvider('aws');
    }

    static run(evt) {
      let remover = new this(evt);
      return remover.eventRemove();
    }

    eventRemove() {
      return BbPromise.try(() => {
          // Prompt: Stage
          if (!S.config.interactive || this.evt.options.stage) return;

          return this.cliPromptSelectStage('Event Remover - Choose a stage: ', this.evt.options.stage, false)
            .then(stage => this.evt.options.stage = stage)
        })
        .bind(this)
        .then(this._validateAndPrepare)
        .then(this._processRemoval)
        .then(function() {
          this._displaySuccessful();
          this._displayFailed();

          /**
           * Return EVT
           */

          this.evt.data.removed = this.removed;
          this.evt.data.failed   = this.failed;
          return this.evt;
        });
    }

    _displayFailed() {
      if(!this.failed) return;

      SCli.log(`Failed to remove events in "${this.evt.options.stage}" from the following regions:`);

      _.each(this.failed, (failed, region) => {
        SCli.log(region + ' ------------------------');
        _.each(failed, (fail) => SCli.log(`  ${fail.name}: ${fail.message}`));
      });

      SCli.log('');
      SCli.log('Run this again with --debug to get more error information...');
    }

    _displaySuccessful() {
      if (!this.removed) return;

      SCli.log(`Successfully removed events in "${this.evt.options.stage}" from the following regions:`);

      _.each(this.removed, (removed, region) => {
        SCli.log(region + ' ------------------------');
        _.each(removed, (event) => SCli.log(`  ${event.name}`));
      });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {
      let _this = this;
      // Set defaults
      this.evt.options.names  = this.evt.options.names || [];
      this.regions            = this.evt.options.region ? [this.evt.options.region] : this.project.getAllRegionNames(this.evt.options.stage);

      this.events = _.map(this.evt.options.names, (name) => this.project.getEvent(name));

      // If CLI and no event names targeted, remove by CWD
      if (S.cli && !this.evt.options.names.length && !this.evt.options.all) {
        let functionsByCwd = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

        functionsByCwd.forEach(function(func) {
          func.getAllEvents().forEach(function(event) {
            _this.events.push(event);
          });
        });
      }

      // If --all is selected, load all paths
      if (this.evt.options.all) {
        this.events = this.project.getAllEvents();
      }

      // Validate Stage
      if (!this.evt.options.stage || !this.project.validateStageExists(this.evt.options.stage)) {
        throw new SError(`Stage is required`);
      }

      return BbPromise.resolve();
    }

    _processRemoval() {

      // Status
      SCli.log(`\nRemoving events in "${this.evt.options.stage}" to the following regions: ${this.regions.join(', ')}`);

      let spinner = SCli.spinner();
      spinner.start();

      return BbPromise
        .map(this.regions, this._removeByRegion.bind(this))
        .then(() => spinner.stop(true)); // Stop Spinner
    }

    _removeByRegion(region) {
      return BbPromise.map(this.events, ((event) => this._eventRemove(event, region)), {concurrency: 5});
    }

    _eventRemove(event, region) {
      if(!event) throw new SError(`Event could not be found in region ${region}`);

      let eventType = event.type.toLowerCase();


      if (['dynamodbstream', 'kinesisstream'].indexOf(eventType) > -1) eventType = 'LambdaStream';

      if (!this[`_remove_${eventType}`]) {
        SCli.log(`WARNING: Event type "${event.type}" removal is not supported yet`);
        return BbPromise.resolve();
      }

      return this[`_remove_${eventType}`](event, region)
        .then((result) => {
          // Stash removed events
          if (!this.removed) this.removed = {};
          if (!this.removed[region]) this.removed[region] = [];
          this.removed[region].push({
            function:         event.getFunction(),
            name:             event.name
          });
        })
        .catch((e) => {
          // Stash Failed Events
          if (!this.failed) this.failed = {};
          if (!this.failed[region]) this.failed[region] = [];
          this.failed[region].push({
            function:         event.getFunction() || 'unknown',
            name:             event.name,
            message:          e.message,
            stack:            e.stack
          });
        });

    }

    _remove_LambdaStream(event, region) {
      const stage        = this.evt.options.stage,
          functionName   = event.getFunction().getDeployedName({stage, region}),
          regionVars     = this.project.getRegion(stage, region).getVariables(),
          awsAccountId   = this.aws.getAccountId(stage, region),
          arn            = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName + ':' + stage,
          eventId       = 'eventID:' + event.name,
          UUID           = regionVars[eventId];

      if (!UUID) return BbPromise.reject(new SError(`EventSourceMapping UUID for "${event.name}" is not found`));

      return this.aws.request('Lambda', 'deleteEventSourceMapping', {UUID}, stage, region).then(() => {
        let regionInstance = this.project.getRegion(stage, region)
        delete regionInstance.getVariables()[eventId];
        return regionInstance.save();
      });

    }

    _remove_s3(event, region) {
      const stage        = this.evt.options.stage,
          populatedEvent = event.toObjectPopulated({stage, region}),
          Bucket         = populatedEvent.config.bucket,
          functionName   = event.getFunction().getDeployedName({stage, region}),
          awsAccountId   = this.aws.getAccountId(stage, region),
          arn            = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName + ':' + stage;

      return this.aws.request('S3', 'getBucketNotificationConfiguration', {Bucket}, stage, region)
        .then((conf) => {
          if (!_.find(conf.LambdaFunctionConfigurations, {LambdaFunctionArn: arn})) {
            return BbPromise.reject(new SError(`S3 configuration for "${event.name}" is not found`))
          }
          conf.LambdaFunctionConfigurations = _.filter(conf.LambdaFunctionConfigurations, (item) => item.LambdaFunctionArn !== arn );
          return this.aws.request('S3', 'putBucketNotificationConfiguration', {Bucket, NotificationConfiguration: conf}, stage, region);
        });
    }

    _remove_schedule(event, region) {
      const stage        = this.evt.options.stage,
            functionName = event.getFunction().getDeployedName({stage, region}),
            Rule         = functionName + '-' + event.name + '-' +  stage;

      return this.aws.request('CloudWatchEvents', 'removeTargets', {Ids: [functionName], Rule}, stage, region)
        .then(() => this.aws.request('CloudWatchEvents', 'deleteRule', {Name: Rule}, stage, region));
    }

    _remove_sns(event, region) {
      const stage          = this.evt.options.stage,
            functionName   = event.getFunction().getDeployedName({stage, region}),
            awsAccountId   = this.aws.getAccountId(stage, region),
            Endpoint       = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName + ':' + stage,
            populatedEvent = event.toObjectPopulated({stage, region}),
            topic          = populatedEvent.config.topic || populatedEvent.config.topicName,
            TopicArn       = topic && topic.indexOf('arn:') === 0 ? topic : ('arn:aws:sns:' + region + ':' + awsAccountId + ':' + topic),
            TopicRegion    = /arn:aws:sns:(.*):(.*):(.*)/.exec(TopicArn)[1];

      return this._SNSlistSubscriptionsByTopic(TopicArn, stage, TopicRegion)
        .then((subscriptions) => _.filter(subscriptions, {Endpoint}))
        .then((subscriptions) => subscriptions.length && subscriptions || BbPromise.reject(new SError(`Subscription for "${event.name}" is not found`)))
        .map((subscription) => subscription.SubscriptionArn)
        .map((SubscriptionArn) => this.aws.request('SNS', 'unsubscribe', {SubscriptionArn}, stage, TopicRegion));
    }

    _SNSlistSubscriptionsByTopic(TopicArn, stage, region, NextToken, subscriptions) {
      subscriptions = subscriptions || [];

      return this.aws.request('SNS', 'listSubscriptionsByTopic', {TopicArn, NextToken}, stage, region)
        .then((reply) => {
          subscriptions = subscriptions.concat(reply.Subscriptions);
          if (reply.NextToken) {
            return this._SNSlistSubscriptionsByTopic(TopicArn, stage, region, reply.NextToken, subscriptions);
          } else {
            return subscriptions;
          }
        });
    }

  }


  return EventRemove;
};
