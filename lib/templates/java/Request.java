package <%= package %>;

public class Request {

	private String input;

	public Request(String input) {
		this.input = input;
	}

	public Request() {
	}

	public String getInput() {
		return input;
	}

	public void setInput(String input) {
		this.input = input;
	}
}
