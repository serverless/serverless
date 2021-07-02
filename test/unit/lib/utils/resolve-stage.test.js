'use strict';

const chai = require('chai');

const expect = chai.expect;
const resolveStage = require('../../../../lib/utils/resolve-stage');

describe('test/unit/lib/utils/resolve-stage.test.js', () => {
  it('should return `stage` from options first if it is present', () => {
    const result = resolveStage({
      configuration: { provider: { stage: 'fromprovider' } },
      options: { stage: 'fromoptions' },
    });
    expect(result).to.equal('fromoptions');
  });

  it('should return `stage` from configuration if stage is not passed in options', () => {
    const result = resolveStage({
      configuration: { provider: { stage: 'fromprovider' } },
      options: {},
    });
    expect(result).to.equal('fromprovider');
  });

  it('should return default stage if both options and configuration do not have it defined', () => {
    const result = resolveStage({ configuration: {}, options: {} });
    expect(result).to.equal('dev');
  });
});
