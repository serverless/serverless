package com.serverless;

import java.util.Collections;
import java.util.Map;

import org.apache.log4j.Logger;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

public class Handler implements RequestHandler<Map<String, Object>, ApiGatewayResponse> {

	private static final Logger LOG = Logger.getLogger(Handler.class);

	@Override
	public ApiGatewayResponse handleRequest(Map<String, Object> input, Context context) {
		LOG.info("received: " + input);
		Response responseBody = new Response("Go Serverless v1.x! Your function executed successfully!", input);
		return ApiGatewayResponse.builder()
				.setStatusCode(200)
				.setObjectBody(responseBody)
				.setHeaders(Collections.singletonMap("X-Powered-By", "AWS Lambda & serverless"))
				.build();
	}
}
