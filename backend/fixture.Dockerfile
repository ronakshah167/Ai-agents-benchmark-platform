FROM mcr.microsoft.com/playwright/python:v1.62.0-noble
WORKDIR /app
COPY backend /app/backend
ENV PYTHONDONTWRITEBYTECODE=1
USER pwuser
ENTRYPOINT ["python","-m","backend.fixture_run"]
