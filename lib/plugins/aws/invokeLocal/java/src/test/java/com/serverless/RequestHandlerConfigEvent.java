package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.ConfigEvent;

public class RequestHandlerConfigEvent implements RequestHandler<ConfigEvent, Object> {
  public static ConfigEvent input;

  @Override
  public Object handleRequest(ConfigEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerConfigEvent invoke Complete.";
  }
}
