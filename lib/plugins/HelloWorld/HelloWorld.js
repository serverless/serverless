'use strict';

class HelloWorld {
  constructor() {
    this.commands = {
      greet: {
        usage: 'Run this command to get greeted.',
        lifeCycleEvents: [
          'printGoodMorning',
          'printHello',
          'printGoodEvening'
        ]
      },
    };

    this.hooks = {
      'before:greet:printHello': this.printGoodMorning,
      'greet:printHello': this.printHello,
      'after:greet:printHello': this.printGoodEvening,
    };
  }

  printGoodMorning() {
    const message = 'Good morning';
    console.log(message);
    return message;
  }

  printHello() {
    const message = 'Hello';
    console.log(message);
    return message;
  }

  printGoodEvening() {
    const message = 'Good evening';
    console.log(message);
    return message;
  }
}

module.exports = HelloWorld;
