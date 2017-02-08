'use strict';

const expect = require('chai').expect;
const validate = require('../lib/validate');
const Serverless = require('../../../Serverless');

describe('#validate', () => {
  const serverless = new Serverless();
  const awsPlugin = {};

  beforeEach(() => {
    awsPlugin.serverless = serverless;
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsPlugin.serverless.config.servicePath = true;

    Object.assign(awsPlugin, validate);
  });

  describe('#validate()', () => {
    it('should succeed if inside service (servicePath defined)', () => {
      expect(() => awsPlugin.validate()).to.not.throw(Error);
    });

    it('should throw error if not inside service (servicePath not defined)', () => {
      awsPlugin.serverless.config.servicePath = false;
      expect(() => awsPlugin.validate()).to.throw(Error);
    });

    // NOTE: starting here, test order is important

    it('should default to "dev" if stage is not provided', () => {
      awsPlugin.options.stage = false;
      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.stage).to.equal('dev');
      });
    });

    it('should use the service.provider stage if present', () => {
      awsPlugin.options.stage = false;
      awsPlugin.serverless.service.provider = {
        stage: 'some-stage',
      };

      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.stage).to.equal('some-stage');
      });
    });

    it('should default to "us-east-1" region if region is not provided', () => {
      awsPlugin.options.region = false;
      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.region).to.equal('us-east-1');
      });
    });

    it('should use the service.provider region if present', () => {
      awsPlugin.options.region = false;
      awsPlugin.serverless.service.provider = {
        region: 'some-region',
      };

      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.region).to.equal('some-region');
      });
    });
  });

  describe('#validateS3BucketName()', () => {
    it('should reject an ip address as a name', () =>
      awsPlugin.validateS3BucketName('127.0.0.1')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('cannot look like an IPv4 address'))
    );

    it('should reject names that are too long', () => {
      const bucketName = Array.from({ length: 64 }, () => 'j').join('');
      return awsPlugin.validateS3BucketName(bucketName)
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('longer than 63 characters'));
    });

    it('should reject names that are too short', () =>
      awsPlugin.validateS3BucketName('12')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('shorter than 3 characters'))
    );

    it('should reject names that contain invalid characters', () =>
      awsPlugin.validateS3BucketName('this has b@d characters')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('contains invalid characters'))
    );

    it('should reject names that have consecutive periods', () =>
      awsPlugin.validateS3BucketName('otherwise..valid.name')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('cannot contain consecutive periods'))
    );

    it('should reject names that start with a dash', () =>
      awsPlugin.validateS3BucketName('-invalid.name')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('start with a letter or number'))
    );

    it('should reject names that start with a period', () =>
      awsPlugin.validateS3BucketName('.invalid.name')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('start with a letter or number'))
    );

    it('should reject names that end with a dash', () =>
      awsPlugin.validateS3BucketName('invalid.name-')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('end with a letter or number'))
    );

    it('should reject names that end with a period', () =>
      awsPlugin.validateS3BucketName('invalid.name.')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('end with a letter or number'))
    );

    it('should reject names that contain uppercase letters', () =>
      awsPlugin.validateS3BucketName('otherwise.Valid.name')
        .then(() => {
          throw new Error('Should not get here');
        })
        .catch(err => expect(err.message).to.contain('cannot contain uppercase letters'))
    );

    it('should accept valid names', () =>
      awsPlugin.validateS3BucketName('1.this.is.valid.2')
        .then(() => awsPlugin.validateS3BucketName('another.valid.name'))
        .then(() => awsPlugin.validateS3BucketName('1-2-3'))
        .then(() => awsPlugin.validateS3BucketName('123'))
        .then(() => awsPlugin.validateS3BucketName('should.be.allowed-to-mix'))
    );
  });
});
