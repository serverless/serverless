'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const gql = require('graphql-tag');
const getCliLoginById = require('./getCliLoginById');

describe.only('#getCliLoginById()', () => {
  it('should query for the cliLoginById', () => {
    const expectedParams = {
      fetchPolicy: 'network-only',
      query: gql`
        query cliLoginById($id: String!) {
          cliLoginById(id: $id) {
            encryptedAccessToken
            encryptedIdToken
            encryptedRefreshToken
            encryptedKey
            encryptedIv
          }
        }
      `,
      variables: { id: 'abc' },
    };

    const query = sinon.stub().resolves({ data: { cliLoginId: 'abc' } });
    return getCliLoginById('abc', query).then(data => {
      expect(data).to.deep.equal({ cliLoginId: 'abc' });
      expect(query.getCall(0).args[0]).to.deep.equal(expectedParams);
    });
  });
});
