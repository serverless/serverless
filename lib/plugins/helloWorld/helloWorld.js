'use strict';

class HelloWorld {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      greet: {
        usage: 'Run this command to get greeted.',
        lifecycleEvents: [
          'printGoodMorning',
          'printHello',
          'printGoodEvening',
        ],
        options: {
          gender: {
            usage: 'Define what gender the user has (can be "male" or "female")',
          },
        },
      },
    };

    this.hooks = {
      'before:greet:printHello': this.printGoodMorning.bind(this),
      'greet:printHello': this.printHello.bind(this),
      'after:greet:printHello': this.printGoodEvening.bind(this),
    };
  }

  printGoodMorning() {
    let message = 'Good morning madam';
    if (this.options.gender === 'male') {
      message = 'Good morning sir';
    }
    return message;
  }

  printHello() {
    let message = 'Hello madam';
    if (this.options.gender === 'male') {
      message = 'Hello sir';
    }
    return message;
  }

  printGoodEvening() {
    let message = 'Good evening madam';
    if (this.options.gender === 'male') {
      message = 'Good evening sir';
    }
    return message;
  }
}

module.exports = HelloWorld;
