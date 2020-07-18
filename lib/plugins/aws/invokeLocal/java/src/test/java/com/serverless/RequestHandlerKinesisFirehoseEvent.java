package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.KinesisFirehoseEvent;

public class RequestHandlerKinesisFirehoseEvent
    implements RequestHandler<KinesisFirehoseEvent, Object> {
  public static KinesisFirehoseEvent input;

  @Override
  public Object handleRequest(KinesisFirehoseEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerKinesisFirehoseEvent invoke Complete.";
  }
}
