'use strict';

const expect = require('chai').expect;
const compileResources = require('../lib/compileResource').compileResource;
const Serverless = require('../../../Serverless');

describe('compileResources', () => {
  beforeEach(() => {
    compileResources.serverless = {
      service: {
        functions: {
          hello: {
            events: {
              aws: {
                http_endpoints: {
                  post: 'users/create',
                  get: 'users/create/list',
                },
              },
            },
          },
        },
        resources: {
          aws: {
            Resources: {},
          },
        },
      },
    };
  });

  it('should construct the correct paths array', () => {
    return compileResources().then(() => {
      console.log(compileResources.paths)
    });
  });

});
