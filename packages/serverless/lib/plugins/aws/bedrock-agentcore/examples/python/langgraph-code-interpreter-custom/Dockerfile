# LangGraph Custom Code Interpreter Agent Dockerfile
#
# This Dockerfile builds a container for a LangGraph agent
# that uses a custom code interpreter with PUBLIC network mode.

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY pyproject.toml .

# Install dependencies
RUN pip install --no-cache-dir .

# Copy application code
COPY agent.py .

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Run the agent
CMD ["python", "agent.py"]
