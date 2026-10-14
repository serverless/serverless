export const hello = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    marker: 'working-copy-code',
    // Lambda runs the deployed code from /var/task; Dev Mode runs it on this machine.
    ran:
      process.env.LAMBDA_TASK_ROOT === '/var/task'
        ? 'deployed'
        : 'this-machine',
    localTopicArn: process.env.LOCAL_TOPIC_ARN,
    sharedTopicArn: process.env.SHARED_TOPIC_ARN,
  }),
})
