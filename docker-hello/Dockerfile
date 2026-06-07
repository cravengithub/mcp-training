# Dockerfile untuk aplikasi Node.js Hello World
# 1. Gunakan base image Node.js versi 20 dengan Alpine Linux (ukuran kecil)
FROM node:20-alpine
# 2. Set working directory di dalam container
WORKDIR /app
# 3. Copy package.json dan package-lock.json (jika ada)
COPY package*.json ./
# 4. Install dependencies
RUN npm install --production
# 5. Copy semua file aplikasi
COPY . .
# 6. Expose port 3000 (dokumentasi)
EXPOSE 3000
# 7. Perintah untuk menjalankan aplikasi
CMD ["node", "app.js"]