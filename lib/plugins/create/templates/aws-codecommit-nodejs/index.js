'use strict';

const AWS = require('aws-sdk');
const codecommit = new AWS.CodeCommit();

function handleCodeCommitEvent(event, callback) {
	const indexRepo = event.Records[0].eventSourceARN.lastIndexOf(':');
	if (indexRepo !== -1) {
    const params = {
      repositoryName: event.Records[0].eventSourceARN.slice(indexRepo + 1),
      //nextToken: 'STRING_VALUE', /* optional */
    };
    codecommit.listBranches(params, (error, data) => {
      if (error) {
        // an error occurred
        console.error(error, error.stack);
        // TODO: change the callback below to match your logic
        // returning null so lambda will not retry
        callback(null, error);
      } else {
        // successful response
        console.log(data);
        callback(null, data);
      }
    });
  } else callback({status: 'Unable to retrieve repository name', error: event.Records});
}

exports.handler = (event, context, callback) => {
	try {
		console.log(event);

		if (event.Records[0].eventSource && event.Records[0].eventSource == 'aws:codecommit') {
			handleCodeCommitEvent(event, callback);
		} else {
      console.error('Not a CodeCommit event');
      // TODO: change the callback below to match your logic
      // returning null so lambda will not retry
			callback(null, 'Not a CodeCommit event');
		}
	} catch (error) {
    // an error occurred
    console.error(error, error.stack);
    // TODO: change the callback below to match your logic
    // returning null so lambda will not retry
    callback(null, error);
	}
};
