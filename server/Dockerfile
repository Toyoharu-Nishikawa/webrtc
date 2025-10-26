FROM node:25

# ビルドに必要なツールをインストール
RUN apt-get update && apt-get install -y \
     ffmpeg \
     v4l-utils
#    build-essential \
#    python3 \
#    git \
#    curl \
#    pkg-config \
#    libudev-dev \
#    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./

#RUN npm i g node-pre-gyp
#RUN npm install

COPY . .

CMD ["node", "index.js"]
