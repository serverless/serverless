'use strict';

const gql = require('graphql-tag');

module.exports = (id, apolloQueryFn) =>
  apolloQueryFn({
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
    variables: { id },
  }).then(response => response.data);
