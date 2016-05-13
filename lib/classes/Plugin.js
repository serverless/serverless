'use strict';

const SError    = require('./Error');
const SCLI      = require('./CLI');
const path      = require('path');
const BbPromise = require('bluebird');

class Plugin {

	constructor(S) {
		this._class = 'Plugin';
		this.S = S;
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
		let _this = this;

		// Add Hooks Array
		_this.S.hooks[config.handler + 'Pre'] = [];
		_this.S.hooks[config.handler + 'Post'] = [];

		// Handle optional configuration
		config.options = config.options || [];
		config.parameters = config.parameters || [];

		// Add Action
		_this.S.actions[config.handler] = function (evt) {

			// Add pre hooks, action, then post hooks to queued
			let queue = _this.S.hooks[config.handler + 'Pre'];

			// Prevent duplicate actions from being added
			if (queue.indexOf(action) === -1) queue.push(action);

			// Use _execute()
			return _this.S._execute(queue.concat(_this.S.hooks[config.handler + 'Post']), evt, config);
		};

		// Add command
		if (config.context && config.contextAction) {
			if (!_this.S.commands[config.context]) {
				_this.S.commands[config.context] = {};
			}

			_this.S.commands[config.context][config.contextAction] = config;
		}
	}

	addHook(hook, config) {
		let name = config.action + (config.event.charAt(0).toUpperCase() + config.event.slice(1));
		this.S.hooks[name].push(hook);
	}
}

module.exports = Plugin;
