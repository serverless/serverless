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
        arguments: {
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

  printGoodMorning(args) {
    let message = 'Good morning madam';
    if (args.gender === 'male') {
      message = 'Good morning sir';
    }
    console.log(message);
    return message;
  }

  printHello(args) {
    let message = 'Hello madam';
    if (args.gender === 'male') {
      message = 'Hello sir';
    }
    console.log(message);
    return message;
  }

  printGoodEvening(args) {
    let message = 'Good evening madam';
    if (args.gender === 'male') {
      message = 'Good evening sir';
    }
    console.log(message);
    return message;
  }
}

module.exports = HelloWorld;
