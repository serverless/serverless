'use strict';

/**
 * Serverless Plugin Boilerplate
 * - Useful example/starter code for writing a plugin for the Serverless Framework.
 * - In a plugin, you can:
 *    - Manipulate Serverless classes
 *    - Create a Custom Action that can be called via the CLI or programmatically via a function handler.
 *    - Overwrite a Core Action that is included by default in the Serverless Framework.
 *    - Add a hook that fires before or after a Core Action or a Custom Action
 *    - All of the above at the same time :)
 *
 * - Setup:
 *    - Make a Serverless Project dedicated for plugin development, or use an existing Serverless Project
 *    - Make a "plugins" folder in the root of your Project and copy this codebase into it. Title it your custom plugin name with the suffix "-dev", like "myplugin-dev"
 *
 */

const path  = require('path'),
  fs        = require('fs'),
  BbPromise = require('bluebird'); // Serverless uses Bluebird Promises and we recommend you do to because they provide more than your average Promise :)

module.exports = function(S) { // Always pass in the ServerlessPlugin Class

  /**
   * Adding/Manipulating Serverless classes
   * - You can add or manipulate Serverless classes like this
   */

  S.classes.Project.newStaticMethod     = function() { console.log("A new method!"); };
  S.classes.Project.prototype.newMethod = function() { S.classes.Project.newStaticMethod(); };

  /**
   * Extending the Plugin Class
   * - Here is how you can add custom Actions and Hooks to Serverless.
   * - This class is only required if you want to add Actions and Hooks.
   */

  class PluginBoilerplate extends S.classes.Plugin {

    /**
     * Constructor
     * - Keep this and don't touch it unless you know what you're doing.
     */

    constructor() {
      super();
      this.name = 'myPlugin'; // Define your plugin's name
    }

    /**
     * Register Actions
     * - If you would like to register a Custom Action or overwrite a Core Serverless Action, add this function.
     * - If you would like your Action to be used programatically, include a "handler" which can be called in code.
     * - If you would like your Action to be used via the CLI, include a "description", "context", "action" and any options you would like to offer.
     * - Your custom Action can be called programatically and via CLI, as in the example provided below
     */

    registerActions() {

      S.addAction(this._customAction.bind(this), {
        handler:       'customAction',
        description:   'A custom action from a custom plugin',
        context:       'custom',
        contextAction: 'run',
        options:       [{ // These must be specified in the CLI like this "-option true" or "-o true"
          option:      'option',
          shortcut:    'o',
          description: 'test option 1'
        }],
        parameters: [ // Use paths when you multiple values need to be input (like an array).  Input looks like this: "serverless custom run module1/function1 module1/function2 module1/function3.  Serverless will automatically turn this into an array and attach it to evt.options within your plugin
          {
            parameter: 'paths',
            description: 'One or multiple paths to your function',
            position: '0->' // Can be: 0, 0-2, 0->  This tells Serverless which params are which.  3-> Means that number and infinite values after it.
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Register Hooks
     * - If you would like to register hooks (i.e., functions) that fire before or after a core Serverless Action or your Custom Action, include this function.
     * - Make sure to identify the Action you want to add a hook for and put either "pre" or "post" to describe when it should happen.
     */

    registerHooks() {

      S.addHook(this._hookPre.bind(this), {
        action: 'functionRun',
        event:  'pre'
      });

      S.addHook(this._hookPost.bind(this), {
        action: 'functionRun',
        event:  'post'
      });

      return BbPromise.resolve();
    }

    /**
     * Custom Action Example
     * - Here is an example of a Custom Action.  Include this and modify it if you would like to write your own Custom Action for the Serverless Framework.
     * - Be sure to ALWAYS accept and return the "evt" object, or you will break the entire flow.
     * - The "evt" object contains Action-specific data.  You can add custom data to it, but if you change any data it will affect subsequent Actions and Hooks.
     * - You can also access other Project-specific data @ this.S Again, if you mess with data on this object, it could break everything, so make sure you know what you're doing ;)
     */

    _customAction(evt) {

      let _this = this;

      return new BbPromise(function (resolve, reject) {

        // console.log(evt)           // Contains Action Specific data
        // console.log(_this.S)       // Contains Project Specific data
        // console.log(_this.S.state) // Contains tons of useful methods for you to use in your plugin.  It's the official API for plugin developers.

        console.log('-------------------');
        console.log('YOU JUST RAN YOUR CUSTOM ACTION, NICE!');
        console.log('-------------------');

        return resolve(evt);

      });
    }

    /**
     * Your Custom PRE Hook
     * - Here is an example of a Custom PRE Hook.  Include this and modify it if you would like to write your a hook that fires BEFORE an Action.
     * - Be sure to ALWAYS accept and return the "evt" object, or you will break the entire flow.
     * - The "evt" object contains Action-specific data.  You can add custom data to it, but if you change any data it will affect subsequent Actions and Hooks.
     * - You can also access other Project-specific data @ this.S Again, if you mess with data on this object, it could break everything, so make sure you know what you're doing ;)
     */

    _hookPre(evt) {

      let _this = this;

      return new BbPromise(function (resolve, reject) {

        console.log('-------------------');
        console.log('YOUR SERVERLESS PLUGIN\'S CUSTOM "PRE" HOOK HAS RUN BEFORE "FunctionRun"');
        console.log('-------------------');

        return resolve(evt);

      });
    }

    /**
     * Your Custom POST Hook
     * - Here is an example of a Custom POST Hook.  Include this and modify it if you would like to write your a hook that fires AFTER an Action.
     * - Be sure to ALWAYS accept and return the "evt" object, or you will break the entire flow.
     * - The "evt" object contains Action-specific data.  You can add custom data to it, but if you change any data it will affect subsequent Actions and Hooks.
     * - You can also access other Project-specific data @ this.S Again, if you mess with data on this object, it could break everything, so make sure you know what you're doing ;)
     */

    _hookPost(evt) {

      let _this = this;

      return new BbPromise(function (resolve, reject) {

        console.log('-------------------');
        console.log('YOUR SERVERLESS PLUGIN\'S CUSTOM "POST" HOOK HAS RUN AFTER "FunctionRun"');
        console.log('-------------------');

        return resolve(evt);

      });
    }
  }

  // Export Plugin Class
  return PluginBoilerplate;

};