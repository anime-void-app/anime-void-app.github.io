FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY selfhost/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY selfhost/api.py /app/api.py
RUN mkdir /app/static
COPY index.html studio.js studio.css /app/static/
RUN useradd -r -u 10001 vanta && chown -R vanta:vanta /app
USER vanta
EXPOSE 8765
CMD ["uvicorn","api:app","--host","0.0.0.0","--port","8765","--no-access-log"]
