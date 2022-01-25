package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.KinesisEvent;

public class RequestHandlerKinesisEvent implements RequestHandler<KinesisEvent, Object> {
  public static KinesisEvent input;

  @Override
  public Object handleRequest(KinesisEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerKinesisEvent invoke Complete.";
  }
}
