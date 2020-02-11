'use strict';

const expect = require('chai').expect;
const ValidationSchema = require('./ValidationSchema');

describe('ValidationSchema', () => {
  describe('#constructor', () => {
    it('should have aws service property', () => {
      const validationSchema = new ValidationSchema();
      expect(validationSchema.awsService).to.be.instanceOf(Object);
    });

    it('should have aws function property', () => {
      const validationSchema = new ValidationSchema();
      expect(validationSchema.awsFunction).to.be.instanceOf(Object);
    });

    it('should have aws event property', () => {
      const validationSchema = new ValidationSchema();
      expect(validationSchema.awsEvent).to.be.instanceOf(Object);
    });

    it('should have aws http event as object property', () => {
      const validationSchema = new ValidationSchema();
      expect(validationSchema.awsHttpEventAsObject).to.be.instanceOf(Object);
    });
  });
});
