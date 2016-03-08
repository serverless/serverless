'use strict';

/**
 * Action: DashSummary
 * - Displays a summary of your project stages, regions, functions, endpoints and events
 */

module.exports  = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    _           = require('lodash'),
    BbPromise   = require('bluebird');
  let SUtils;

  /**
   * DashSummary Class
   */

  class DashSummary extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + DashSummary.name;
    }

    registerActions() {
      this.S.addAction(this.dashSummary.bind(this), {
        handler:       'dashSummary',
        description:   `Displays a summary of your project stages, regions, functions, endpoints and events`,
        context:       'dash',
        contextAction: 'summary'
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    dashSummary() {

      let _this         = this,
          stages        = _this.S.getProject().getAllStages(),
          stagesNum     = 0,
          regionsNum    = 0,
          functionsNum  = 0,
          endpointsNum  = 0,
          eventsNum     = 0;

      // Show ASCII
      SCli.asciiGreeting();

      // Blank space for neatness in the CLI
      console.log('');


      // list stages
      SCli.log(`${stages.length} stages ------------------------------`);
      stages.forEach(function(stage) {
        stagesNum++;
        let regions = _this.S.getProject().getAllRegions(stage.name);
        SCli.log(`    |_ ${stage.name} (${regions.length} regions)`);

        // list regions for stage
        regions.forEach(function(region) {
          regionsNum++;
          SCli.log(`        |_ ${region.name}`);
        });
      });

      // list functions
      console.log('');

      let functions = .getAllFunctions();
      SCli.log(`${functions.length} functions --------------------------`);

      SCli.log(`    |_ ${.name} (${functions.length} functions)`);

      _.each( functions, function(func){
        functionsNum++;
        let endpoints = func.getAllEndpoints();
        let events = func.getAllEvents();

        SCli.log(`        |_ ${func.name} (${endpoints.length} endpoints - ${events.length} events)`);

        // list endpoints for function
        _.each( endpoints, function(endpoint){
          endpointsNum++;
          SCli.log(`            |_ ${endpoint.method} ${endpoint.path} (endpoint)`);
        });

        // list events for function
        _.each( events, function(event){
          eventsNum++;
          SCli.log(`            |_ ${event.name} (${event.type} event)`);
        });
      });

      // list summary
      console.log('');
      SCli.log(`SUMMARY -------------------------------`);
      SCli.log(`stages     : ${stagesNum}`);
      SCli.log(`regions    : ${regionsNum}`);
      SCli.log(`functions  : ${functionsNum}`);
      SCli.log(`endpoints  : ${endpointsNum}`);
      SCli.log(`events     : ${eventsNum}`);
    }
  }

  return( DashSummary );
};