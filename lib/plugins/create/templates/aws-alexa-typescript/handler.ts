import * as Ask from 'ask-sdk';
import 'source-map-support/register';

export const alexa = Ask.SkillBuilders.custom()
  .addRequestHandlers({
    canHandle: handlerInput => true,
    handle: handlerInput =>
      handlerInput.responseBuilder.speak('Hello world!').getResponse()
  })
  .lambda();
