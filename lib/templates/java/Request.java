package <%= package %>;

public class <%= functionName %>Request {

	private String input;

	public <%= functionName %>Request(String input) {
		this.input = input;
	}

	public <%= functionName %>Request() {
	}

	public String getInput() {
		return input;
	}

	public void setInput(String input) {
		this.input = input;
	}
}
