package com.serverless;

import java.io.IOException;

public class LambdaLogger implements com.amazonaws.services.lambda.runtime.LambdaLogger {

	@Override
	public void log(String message) {
		System.out.println(message);
	}

	@Override
	public void log(byte[] message) {
		try {
			System.out.write(message);
		} catch (IOException e) {
			// I guess never happen on AWS lambda
			e.printStackTrace();
		}
	}

}
