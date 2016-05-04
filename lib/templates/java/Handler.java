package example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

public class <%= functionName %> implements RequestHandler<<%= functionName %>Request, <%= functionName %>Response> {

	@Override
	public <%= functionName %>Response handleRequest(<%= functionName %>Request input, Context context) {
		return new <%= functionName %>Response(input.getInput());
	}
	
}
