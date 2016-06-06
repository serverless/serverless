'use strict';

/**
 * Test: HelloWorld Plugin
 */

const expect = require('chai').expect;
const HelloWorld = require('../helloWorld');

describe('HelloWorld', () => {
  const serverlessMock = {};

  describe('#constructor()', () => {
    let helloWorld;

    beforeEach(() => {
      helloWorld = new HelloWorld();
    });

    it('should have commands', () => expect(helloWorld.commands).to.be.not.empty);

    it('should have hooks', () => expect(helloWorld.hooks).to.be.not.empty);
  });

  describe('when gender is "female"', () => {
    let helloWorld;

    beforeEach(() => {
      helloWorld = new HelloWorld(serverlessMock, { gender: 'female' });
    });

    describe('#printGoodMorning()', () => {
      it('should print "Good morning madam"', () => {
        const greeting = helloWorld.printGoodMorning();

        expect(greeting).to.equal('Good morning madam');
      });
    });

    describe('#printHello()', () => {
      it('should print "Hello madam"', () => {
        const greeting = helloWorld.printHello();

        expect(greeting).to.equal('Hello madam');
      });
    });

    describe('#printGoodEvening()', () => {
      it('should print "Good evening madam"', () => {
        const greeting = helloWorld.printGoodEvening();

        expect(greeting).to.equal('Good evening madam');
      });
    });
  });

  describe('when gender is "male"', () => {
    let helloWorld;

    beforeEach(() => {
      helloWorld = new HelloWorld(serverlessMock, { gender: 'male' });
    });

    describe('#printGoodMorning()', () => {
      it('should print "Good morning sir"', () => {
        const optionsMock = { gender: 'male' };
        const greeting = helloWorld.printGoodMorning(optionsMock);

        expect(greeting).to.equal('Good morning sir');
      });
    });

    describe('#printHello()', () => {
      it('should print "Hello sir"', () => {
        const optionsMock = { gender: 'male' };
        const greeting = helloWorld.printHello(optionsMock);

        expect(greeting).to.equal('Hello sir');
      });
    });

    describe('#printGoodEvening()', () => {
      it('should print "Good evening sir"', () => {
        const optionsMock = { gender: 'male' };
        const greeting = helloWorld.printGoodEvening(optionsMock);

        expect(greeting).to.equal('Good evening sir');
      });
    });
  });

  describe('when gender is not given', () => {
    let helloWorld;

    beforeEach(() => {
      helloWorld = new HelloWorld(serverlessMock, {});
    });

    describe('#printGoodMorning()', () => {
      it('should print "Good morning madam"', () => {
        const greeting = helloWorld.printGoodMorning();

        expect(greeting).to.equal('Good morning madam');
      });
    });

    describe('#printHello()', () => {
      it('should print "Hello madam"', () => {
        const greeting = helloWorld.printHello();

        expect(greeting).to.equal('Hello madam');
      });
    });

    describe('#printGoodEvening()', () => {
      it('should print "Good evening madam"', () => {
        const greeting = helloWorld.printGoodEvening();

        expect(greeting).to.equal('Good evening madam');
      });
    });
  });
});
