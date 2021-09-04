FROM ubuntu:focal
WORKDIR /var/app/
RUN apt-get update && apt-get install -y libglib2.0-0 \
          libnss3 \
          libnspr4 \
          libatk1.0-0 \
          libatk-bridge2.0-0 \
          libcups2 \
          libdrm2 \
          libdbus-1-3 \
          libxcb1 \
          libxkbcommon0 \
          libx11-6 \
          libxcomposite1 \
          libxdamage1 \
          libxext6 \
          libxfixes3 \
          libxrandr2 \
          libgbm1 \
          libpango-1.0-0 \
          libcairo2 \
          libasound2 \
          libatspi2.0-0 \
          libxshmfence-dev

# === INSTALL Node.js ===

# Install node14
RUN apt-get update && apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_14.x | bash - && \
    apt-get install -y nodejs

# Feature-parity with node.js base images.
RUN apt-get update && apt-get install -y --no-install-recommends git ssh && \
    npm install -g typescript

     # Install Python 3.8

RUN apt-get update && apt-get install -y python3.8 python3-pip && \
    update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 1

COPY ./ /var/app/
RUN npm i
RUN npm audit fix
RUN npm run build
EXPOSE 80
CMD ["npm", "start"]