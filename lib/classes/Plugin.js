'use strict';

const SError    = require('./Error'),
	    SCLI      = require('./CLI'),
	    path      = require('path'),
	    BbPromise = require('bluebird');

module.exports = function(S) {


	class Plugin {


		constructor() {
			this._class = 'Plugin';
		}


		static getName() {
			return this.name;
		}


		getName() {
			return this.constructor.getName();
		}


		registerActions() {
			return BbPromise.resolve();
		}


		registerHooks() {
			return BbPromise.resolve();
		}


		addAction(action, config) {

			// Add Hooks Array
			S.hooks[config.handler + 'Pre']  = [];
			S.hooks[config.handler + 'Post'] = [];

			// Handle optional configuration
			config.options    = config.options    || [];
			config.parameters = config.parameters || [];

			// Add Action
			S.actions[config.handler] = function(evt) {

				// Add pre hooks, action, then post hooks to queued
				let queue = S.hooks[config.handler + 'Pre'];

				// Prevent duplicate actions from being added
				if (queue.indexOf(action) === -1) queue.push(action);

				// Use _execute()
				return S._execute(queue.concat(S.hooks[config.handler + 'Post']), evt, config);
			};

			// Add command
			if (config.context && config.contextAction) {
				if (!this.commands[config.context]) {
					this.commands[config.context] = {};
				}

				this.commands[config.context][config.contextAction] = config;
			}
		}


		addHook(hook, config) {
			let name = config.action + (config.event.charAt(0).toUpperCase() + config.event.slice(1));
			S.hooks[name].push(hook);
		}


	}

	return Plugin;

};

