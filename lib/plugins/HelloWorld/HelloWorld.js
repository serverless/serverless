'use strict';

class HelloWorld {
  constructor() {
    this.commands = {
      greet: {
        usage: 'Foo',
        lifeCycleEvents: [
          'printGoodMorning',
          'printHello',
          'printGoodEvening'
        ]
      },
    };

    this.hooks = {
      'before:greet:printHelloWorld': this.printGoodMorning,
      'greet:printHelloWorld': this.printHello,
      'after:greet:printHelloWorld': this.printGoodEvening,
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
