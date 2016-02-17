'use strict';

/**
 * Action: DashSummary
 * - Displays a summary of your project stages, regions, components, modules, functions and endpoints
 */

module.exports  = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    _           = require('lodash'),
    BbPromise   = require('bluebird');

  /**
   * DashSummary Class
   */

  class DashSummary extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + DashSummary.name;
    }

    registerActions() {
      this.S.addAction(this.dashSummary.bind(this), {
        handler:       'dashSummary',
        description:   `Displays a summary of your project stages, regions, components, modules, functions and endpoints`,
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
          stages        = _this.S.getProject().getStages(),
          components    = _this.S.getProject().getAllComponents(),
          stagesNum     = 0,
          regionsNum    = 0,
          componentsNum = 0,
          functionsNum  = 0,
          endpointsNum  = 0,
          eventsNum     = 0;

      // Show ASCII
      SCli.asciiGreeting();
      // Blank space for neatness in the CLI
      console.log('');


      // list stages
      SCli.log(`${Object.keys(stages).length} stages ------------------------------`);
      Object.keys(stages).forEach(function(stage) {
        stagesNum++;
        let regions = _this.S.getProject().getRegions(stages[stage]);
        SCli.log(`    |_ ${stages[stage]} (${regions.length} regions)`);

        // list regions for stage
        Object.keys(regions).forEach(function(region) {
          regionsNum++;
          SCli.log(`        |_ ${regions[region]}`);
        });
      });

      // list components
      console.log('');
      SCli.log(`${_.keys(components).length} components --------------------------`);

      _.each( components, function(component) {
        componentsNum++;
        let functions = component.getAllFunctions();
        SCli.log(`    |_ ${component.name} (${functions.length} functions)`);

        _.each( functions, function(func){
          functionsNum++;
          let endpoints = func.getAllEndpoints();
          let events = func.getAllEvents();

          SCli.log(`        |_ ${func.getName()} (${endpoints.length} endpoints - ${events.length} events)`);

          // list endpoints for function
          _.each( endpoints, function(endpoint){
            endpointsNum++;
            SCli.log(`            |_ ${endpoint.path} - (${endpoint.method} endpoint)`);
          });

          // list events for function
          _.each( events, function(event){
            eventsNum++;
            SCli.log(`            |_ ${event.name} - (${event.type} event)`);
          });
        });
      });

      // list summary
      console.log('');
      SCli.log(`SUMMARY -------------------------------`);
      SCli.log(`stages     : ${stagesNum}`);
      SCli.log(`regions    : ${regionsNum}`);
      SCli.log(`components : ${componentsNum}`);
      SCli.log(`functions  : ${functionsNum}`);
      SCli.log(`endpoints  : ${endpointsNum}`);
      SCli.log(`events     : ${eventsNum}`);
    }
  }

  return( DashSummary );
};