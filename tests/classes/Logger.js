'use strict';

/**
 * Test: Logger Class
 */
const expect = require('chai').expect;
const logger = require('../../lib/classes/Logger');
const Logger = require('../../lib/classes/Logger').Logger;
const chalk = require('chalk');
const sinon = require('sinon');

describe('Logger', () => {
  // alias for the console.log spy
  let consoleSpy;

  // spy console.log calls
  beforeEach(() => {
    consoleSpy = sinon.spy(console, 'log');
  });

  // restore console.log
  afterEach(() => {
    consoleSpy.restore();
  });

  describe('#constructor()', () => {
    it('should allow customization of styles', () => {
      const l = new Logger({
        info: 'cyan',
        debug: 'green',
        error: 'magenta',
      });

      // verify prototype property
      expect(l.ERROR).to.equal('magenta');

      // verify getStyle method
      expect(l.getStyle('error')).to.equal('magenta');

      // verify method call uses overridden style
      expect(l.info('Bar')).to.equal(l);

      const expectedResult = chalk.cyan('Bar');
      expect(consoleSpy.getCall(0).args[0]).to.equal(expectedResult);
    });
  });

  // ensure each log method calls the console with the chalk-formatted message
  ['log', 'info', 'debug', 'warn', 'error'].forEach((level) => {
    describe(`#${level}()`, () => {
      it(`should log a message with ${level} level styling`, () => {
        const l = logger[level]('foo');

        const expectedResult = chalk[logger.getStyle(level)]('foo');

        // console.log should have been called with the formatted message as the only argument
        expect(consoleSpy.getCall(0).args[0]).to.equal(expectedResult);

        // it should return itself for chaining
        expect(l).to.equal(logger);
      });

      it(`should log a message with ${level} and header styling`, () => {
        const l = logger[level]('foo', logger.HEADING);

        const expectedResult = chalk[logger.getStyle(level)].underline.bold('foo');

        // console.log should have been called with the formatted message as the only argument
        expect(consoleSpy.getCall(0).args[0]).to.equal(expectedResult);

        // it should return itself for chaining
        expect(l).to.equal(logger);
      });
    });
  });

  describe('#style()', () => {
    it('should return a styled message', () => {
      const msg = logger.style('foo', logger.BOLD, logger.UNDERLINE);
      const exp = chalk.bold.underline('foo');

      expect(msg).to.equal(exp);
    });

    it('should work even if input message is undefined', () => {
      const msg = logger.style(undefined, logger.UNDERLINE, logger.BOLD);
      const exp = chalk.underline.bold(undefined);

      expect(msg).to.equal(exp);
    });

    it('should return no styling if a bad style is passed', () => {
      const msg = logger.style('foo', logger.BOLD, 'badstyle');
      expect(msg).to.equal('foo');
    });

    it('should be able to build styles independently', () => {
      const under = logger.style('bar', logger.UNDERLINE, logger.RED);
      const bold = logger.style('foo', logger.GREEN, logger.BOLD);

      expect(under).to.equal(chalk.underline.red('bar'));
      expect(bold).to.equal(chalk.green.bold('foo'));
    });
  });
});
