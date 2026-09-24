FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/

ENV PYTHONPATH=/app/src
ENV EVIL_MCP_URL=http://127.0.0.1:8765/mcp
ENV TERN_LLM_URL=http://127.0.0.1:8000

EXPOSE 8080

CMD ["uvicorn", "evil_ui_backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
