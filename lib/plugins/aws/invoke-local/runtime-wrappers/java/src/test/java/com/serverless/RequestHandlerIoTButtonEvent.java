package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.IoTButtonEvent;

public class RequestHandlerIoTButtonEvent implements RequestHandler<IoTButtonEvent, Object> {

  public static IoTButtonEvent input;

  @Override
  public Object handleRequest(IoTButtonEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerIoTButtonEvent invoke Complete.";
  }
}
