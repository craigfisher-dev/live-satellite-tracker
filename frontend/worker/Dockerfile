# Base image — slim variant strips unused packages to keep image size small
FROM python:3.14-slim
WORKDIR /app

# Copy requirements first so Docker can cache this layer
# If requirements don't change, pip install is skipped on rebuild
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker scripts
COPY worker.py .
COPY spacetrack.py .
COPY db.py .

# Copy testing data for local development — not present in CI/CD so only works locally
COPY testing_data/ ./testing_data/


# Copy UCS satellite data directory — worker reads ucs_satellites.csv from here at runtime
COPY data/ ./data/

# Run the worker when the container starts — exits when done
CMD ["python", "worker.py"]