# Dockerfile for Deiza Backend (Flask + Gunicorn)

FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Runtime stage ----
FROM python:3.11-slim

# Install locales, ffmpeg (video editing: concat clips, burn subtitles) and generate Spanish UTF-8
RUN apt-get update -qq && apt-get install -y -qq locales ffmpeg fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i "s/# es_ES.UTF-8 UTF-8/es_ES.UTF-8 UTF-8/" /etc/locale.gen \
    && locale-gen es_ES.UTF-8 \
    && update-locale LANG=es_ES.UTF-8

# Non-root user for security
RUN useradd -m -u 1000 deiza

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /home/deiza/.local

# Headless Chromium for PDF rendering (doc_render.html_to_pdf). Installed system-wide
# as root so the non-root runtime user can launch it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN PYTHONUSERBASE=/home/deiza/.local PATH=/home/deiza/.local/bin:/usr/local/bin:/usr/bin:/bin \
    python -m playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY --chown=deiza:deiza . .

USER deiza

# Expose port
ENV LANG=es_ES.UTF-8
ENV LC_ALL=es_ES.UTF-8
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py
ENV PORT=5000
ENV PATH=/home/deiza/.local/bin:$PATH

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen(\"http://localhost:${PORT}/api/health\")" || exit 1

# 3 workers x 24 threads = 72 concurrent connections (streams are I/O bound and
# hold a thread for their whole duration). VPS: 4 vCPU / 8 GB, ~250 MB per worker.
# gthread handles SSE streaming better than sync workers.
CMD exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers 3 \
  --threads 24 \
  --timeout 600 \
  --graceful-timeout 120 \
  --keep-alive 5 \
  --worker-class gthread \
  --max-requests 5000 \
  --max-requests-jitter 500 \
  --worker-tmp-dir /dev/shm \
  --log-level info \
  --access-logfile - \
  --error-logfile - \
  app:app
