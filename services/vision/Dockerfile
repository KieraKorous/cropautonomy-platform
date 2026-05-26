# services/vision
# Multi-stage: build wheels in a fat image, run from a slim one.

FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

COPY pyproject.toml ./
COPY src ./src

RUN pip install --upgrade pip build && \
    pip wheel --wheel-dir=/wheels .


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --system gaia && useradd --system --gid gaia --home /app gaia

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels gaia-vision && rm -rf /wheels

USER gaia

EXPOSE 8081

CMD ["uvicorn", "vision.main:app", "--host", "0.0.0.0", "--port", "8081"]
