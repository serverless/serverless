'use strict';

/**
 * Test: HelloWorld Plugin
 */

const expect = require('chai').expect;
const HelloWorld = require('../HelloWorld');

describe('HelloWorld', () => {
  let helloWorld;

  beforeEach(() => {
    helloWorld = new HelloWorld();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(helloWorld.commands).to.be.not.empty);

    it('should have hooks', () => expect(helloWorld.hooks).to.be.not.empty);
  });

  describe('#printGoodMorning()', () => {
    it('should print "Good morning"', () => {
      const greeting = helloWorld.printGoodMorning();

      expect(greeting).to.equal('Good morning');
    });
  });

  describe('#printHello()', () => {
    it('should print "Hello"', () => {
      const greeting = helloWorld.printHello();

      expect(greeting).to.equal('Hello');
    });
  });

  describe('#printGoodEvening()', () => {
    it('should print "Good evening"', () => {
      const greeting = helloWorld.printGoodEvening();

      expect(greeting).to.equal('Good evening');
    });
  });
});
