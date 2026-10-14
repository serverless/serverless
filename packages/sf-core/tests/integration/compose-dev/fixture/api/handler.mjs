export const hello = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    marker: 'working-copy-code',
    localTopicArn: process.env.LOCAL_TOPIC_ARN,
    sharedTopicArn: process.env.SHARED_TOPIC_ARN,
  }),
})
