package com.serverless;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CloudWatchLogsEvent;

public class RequestHandlerCloudWatchLogsEvent
    implements RequestHandler<CloudWatchLogsEvent, Object> {
  public static CloudWatchLogsEvent input;

  @Override
  public Object handleRequest(CloudWatchLogsEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    String decodedEvent = new String(Base64.getDecoder().decode(event.getAwsLogs().getData()), StandardCharsets.US_ASCII);
    System.out.println("Input decoded:" + decodedEvent);
    return "RequesHandlerCloudWatchLogsEvent invoke Complete.";
  }
}
