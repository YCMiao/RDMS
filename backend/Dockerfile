FROM python:3.12.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests

RUN addgroup --system rdms && adduser --system --ingroup rdms rdms \
    && mkdir -p /data/uploads \
    && chown -R rdms:rdms /app /data/uploads

USER rdms

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
