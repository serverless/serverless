package com.serverless;

import java.util.HashMap;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;

public class RequestHandlerAPIGatewayV2HTTPEvent implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

	public static APIGatewayV2HTTPEvent input;
  @Override
  public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {
	    input = event;
	    System.out.println("Input received:" + event.toString());
	    APIGatewayV2HTTPResponse response = new APIGatewayV2HTTPResponse();
	    response.setStatusCode(200);
	    HashMap<String, String> headers = new HashMap<String, String>();
	    headers.put("Content-Type", "text/plain; charset=US-ASCII");
	    response.setHeaders(headers);
	    response.setBody("RequestHandlerAPIGatewayV2WebSocketEvent invoke Complete.");
	    return response;
  }}
