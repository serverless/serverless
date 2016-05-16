'use strict';

/**
 * Test: Plugin Function Class
 */

const expect = require('chai').expect;
const Serverless = require('../../../lib/Serverless');

describe('Serverless', () => {

	let serverless;

	beforeEach(() => {
		// create a new Serverless instance
		serverless = new Serverless({
			interactive: false,
		});
	});

	describe('addPlugin()', () => {

		it('should add plugins', () => {

			class PluginMock {
				constructor() {
					this.commands = {}
				}
			}

			serverless.addPlugin(PluginMock);

			expect(serverless._plugins.length).to.be.equal(1);
			expect(typeof serverless._plugins[0]).to.be.equal('object');
		});
	});

	describe('loadCommands()', () => {

		it('should load commands', () => {

			class PluginMock {
				constructor() {
					this.commands = {
						test: {
							usage: 'test usage'
						}
					}
				}
			}

			serverless.addPlugin(PluginMock);
			serverless.loadCommands();

			expect(Object.keys(serverless.commands)[0]).to.be.equal('test');
		});

	});

	describe('runCommand()', () => {

		beforeEach(() => {
			const argv = {
				_: ['test']
			};

			class PluginMock {
				constructor() {
					this.commands = {
						test: {
							usage: 'test usage',
							lifeCycleEvents: [
								'resources',
								'functions'
							]
						}
					}

					this.hooks = {
						'test:resources': this.deployResources,
						'test:functions': this.deployFunctions,
					};
				}

				deployResources() {
					return;
				}

				deployFunctions() {
					return;
				}
			};

			serverless.addPlugin(PluginMock);
			serverless.loadCommands();
			serverless.runCommand(argv);
		});


		it('should load plugin events', () => {
			expect(serverless.events.length).to.be.equal(6);
		});

		it('should load plugin cli commands', () => {
			expect(serverless.cli.raw._[0]).to.be.equal('test');
		});

		it('should load plugin cli hooks', () => {
			expect(serverless.hooks.length).to.be.equal(2);
		});

		it('should activate debug mode', () => {
			serverless.runCommand({debug: true, _: ['test']});
			expect(process.env.DEBUG).to.be.equal('*');
		});

		it('should return version number', () => {
			return serverless.runCommand({_: ['version']}).then((version) => {
				expect(version).to.be.equal('0.5.5');
			});
		});
	});

});
