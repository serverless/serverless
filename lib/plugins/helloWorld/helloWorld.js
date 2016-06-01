'use strict';

class HelloWorld {
  constructor() {
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
      'before:greet:printHello': this.printGoodMorning,
      'greet:printHello': this.printHello,
      'after:greet:printHello': this.printGoodEvening,
    };
  }

  printGoodMorning(options) {
    let message = 'Good morning madam';
    if (options.gender === 'male') {
      message = 'Good morning sir';
    }
    return message;
  }

  printHello(options) {
    let message = 'Hello madam';
    if (options.gender === 'male') {
      message = 'Hello sir';
    }
    return message;
  }

  printGoodEvening(options) {
    let message = 'Good evening madam';
    if (options.gender === 'male') {
      message = 'Good evening sir';
    }
    return message;
  }
}

module.exports = HelloWorld;
