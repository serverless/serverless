// This function is not deployed by default because the topic does not exist
// 1. Create a Topic
// 2. Replace events[0].event.resource with the topic name
// 3. Uncomment the eventHello import and declaration in src/functions/config.ts

export const eventHello = {
  handler: 'eventHello',
  events: [
    {
      event: {
        eventType: 'providers/cloud.pubsub/eventTypes/topic.publish',
        resource: 'projects/<your-gcp-project-id>/topics/<your-topic-name>', // This is the name of the topic
      },
    },
  ],
};
