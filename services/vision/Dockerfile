# services/vision
# Multi-stage: build wheels in a fat image, run from a slim one.

FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

COPY pyproject.toml ./
COPY src ./src

# Pull torch from the PyTorch CPU wheel index (~200MB) instead of the
# default PyPI wheel (~2.5GB cu128 CUDA build). Vision runs CPU-only;
# device='cuda' would auto-fall-back anyway. Keep PyPI as the secondary
# index so fastapi / transformers / pillow still resolve normally.
RUN pip install --upgrade pip build && \
    pip wheel --wheel-dir=/wheels \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple/ \
        .


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# UID/GID must match the pod securityContext.runAsUser (1001). Without
# an /etc/passwd entry for the runtime UID, huggingface_hub's
# pwd.getpwuid(os.getuid()) call fails with "uid not found" at the
# first transformers import that resolves cache directories.
RUN groupadd --gid 1001 gaia && \
    useradd --uid 1001 --gid gaia --home-dir /app --shell /usr/sbin/nologin gaia

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels gaia-vision && \
    rm -rf /wheels && \
    chown -R gaia:gaia /app

USER gaia

EXPOSE 8081

CMD ["uvicorn", "vision.main:app", "--host", "0.0.0.0", "--port", "8081"]
