FROM public.ecr.aws/docker/library/python:3.12-slim

WORKDIR /app

# Copy dependency file
COPY pyproject.toml .

# Install dependencies
RUN pip install --no-cache-dir .

# Copy agent code
COPY agent.py .

# Run the agent
CMD ["python", "agent.py"]
