'use strict';

module.exports = (error) => {
  let message = '';
  const func = reasonMap[error.ResourceStatusReason];
  if (func) {
    message = func(error)
  } else {
    console.log(error);
  }
  return message;
}

const invalidCronSyntax = (error) => {
  let message = '';
  let resourceProperties = JSON.parse(error.ResourceProperties);
  
  message += 'You have invalid syntax in a "schedule" event. You used "' + resourceProperties.ScheduleExpression + '".';
  message += '\n'
  message += 'You can use "rate" syntax (e.g.: rate(2 hours)) or "cron" syntax (e.g.: cron(0 12 * * ? *)).'
  message += '\n'
  message += 'Click http://amzn.to/2yiWTc5 for AWS documentation on valid syntax.';

  return message;
}

const bucketNotEmpty = (error) => {
  let message = '';
  
  message += 'Your deployment S3 bucket still has objects in it, so it could not be removed.'
  message += '\n'
  message += 'To fully remove this service, please remove all objects in the bucket.'
  message += '\n'
  message += 'To do this with the AWS CLI, run "aws s3 rm s3://' + error.PhysicalResourceId + ' --recursive"'

  return message;
}

const reasonMap = {
  'Parameter ScheduleExpression is not valid.': invalidCronSyntax,
  'The bucket you tried to delete is not empty': bucketNotEmpty,
}
