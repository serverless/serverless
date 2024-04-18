// Suppress maintenance mode message
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = 1;
// Import AWS SDK and export it as default
import AWS from 'aws-sdk';
export { AWS as default };
