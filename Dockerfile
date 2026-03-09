FROM python:3.11-slim

ARG APP_SRC=addr2line-web
ARG HOST_TOOLS_SRC=host-tools
ARG HOST_TOOLS_DST=/opt/host-tools

WORKDIR /app

COPY ${APP_SRC}/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY ${APP_SRC}/ /app/
COPY ${HOST_TOOLS_SRC}/ ${HOST_TOOLS_DST}/

ENV PORT=8080
ENV HOST_TOOLS_PATH=${HOST_TOOLS_DST}
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "app.py"]
