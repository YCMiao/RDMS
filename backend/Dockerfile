FROM python:3.12.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libxrender1 libxext6 libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

RUN addgroup --system rdms && adduser --system --ingroup rdms rdms \
    && mkdir -p /data/uploads \
    && chown rdms:rdms /app /data/uploads

FROM base AS test
COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY --chown=rdms:rdms . .
USER rdms

FROM base AS runtime

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER rdms

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
