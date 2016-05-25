'use strict';

/**
 * Test: HelloWorld Plugin
 */

const expect = require('chai').expect;
const HelloWorld = require('../helloWorld');

describe('HelloWorld', () => {
  let helloWorld;

  beforeEach(() => {
    helloWorld = new HelloWorld();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(helloWorld.commands).to.be.not.empty);

    it('should have hooks', () => expect(helloWorld.hooks).to.be.not.empty);
  });

  describe('when gender is "female"', () => {
    describe('#printGoodMorning()', () => {
      it('should print "Good morning madam"', () => {
        const optionsMock = { gender: 'female' };
        const greeting = helloWorld.printGoodMorning(optionsMock);

        expect(greeting).to.equal('Good morning madam');
      });
    });

    describe('#printHello()', () => {
      it('should print "Hello madam"', () => {
        const optionsMock = { gender: 'female' };
        const greeting = helloWorld.printHello(optionsMock);

        expect(greeting).to.equal('Hello madam');
      });
    });

    describe('#printGoodEvening()', () => {
      it('should print "Good evening madam"', () => {
        const optionsMock = { gender: 'female' };
        const greeting = helloWorld.printGoodEvening(optionsMock);

        expect(greeting).to.equal('Good evening madam');
      });
    });
  });

  describe('when gender is "male"', () => {
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

    describe('when gender is not given', () => {
      describe('#printGoodMorning()', () => {
        it('should print "Good morning madam"', () => {
          const optionsMock = { gender: '' };
          const greeting = helloWorld.printGoodMorning(optionsMock);

          expect(greeting).to.equal('Good morning madam');
        });
      });

      describe('#printHello()', () => {
        it('should print "Hello madam"', () => {
          const optionsMock = { gender: '' };
          const greeting = helloWorld.printHello(optionsMock);

          expect(greeting).to.equal('Hello madam');
        });
      });

      describe('#printGoodEvening()', () => {
        it('should print "Good evening madam"', () => {
          const optionsMock = { gender: '' };
          const greeting = helloWorld.printGoodEvening(optionsMock);

          expect(greeting).to.equal('Good evening madam');
        });
      });
    });
  });
});
