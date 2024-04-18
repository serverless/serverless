import AWS from './sdk-v2.js';

export default () => {
  return Boolean(new AWS.S3().config.credentials);
};
