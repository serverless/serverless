'use strict';

const chalk = require('chalk');
const archy = require('archy');

class Visualize {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      visualize: {
        commands: {
          plugins: {
            usage: 'Display plugin information',
            lifecycleEvents: [
              'plugins',
            ],
            options: {
              command: {
                usage: 'Specifies a command to visualize plugin execution',
                shortcut: 'c',
                required: true,
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'visualize:plugins:plugins': this.visualizePlugins.bind(this),
    };
  }

  visualizePlugins() {
    const commandsArray = this.options.command.split(' ');
    const command = this.serverless.pluginManager.getCommand(commandsArray);
    const events = this.serverless.pluginManager.getEvents(command);

    const lifecycle = {
      label: 'Plugin Lifecycle',
      nodes: [],
    };

    // skip the first 'before:'
    for (let i = 1; i < events.length; i += 3) {
      const eventName = events[i];

      lifecycle.nodes.push({
        label: chalk.cyan(eventName),
        nodes: [
          this.makeNode('before', `before:${eventName}`),
          this.makeNode('during', eventName),
          this.makeNode('after', `after:${eventName}`),
        ],
      });
    }

    this.serverless.cli.consoleLog('');
    this.serverless.cli.consoleLog(archy(lifecycle));
  }

  getHookDescription(hook, event) {
    const functionName = hook.fn.name === event ?
      '<function>'
      :
      hook.fn.name.replace('bound ', '');

    return `${chalk.yellow(hook.pluginName)}:${functionName}`;
  }

  makeNode(label, event) {
    const hooks = this.serverless.pluginManager.getHooks([event]);

    if (hooks.length) {
      return {
        label,
        nodes: hooks.map((hook) => this.getHookDescription(hook, event)),
      };
    }

    return {
      label: chalk.gray(label),
    };
  }
}

module.exports = Visualize;
