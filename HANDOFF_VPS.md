# Handoff untuk Claude yang punya akses VPS

Salin seluruh isi file ini ke Claude yang sudah terhubung ke VPS.

## Tugas
Saya butuh akses/pengelolaan ke 2 VPS: **shuttshoot** dan **taibamedina**.
Tolong:
1. Hubungkan/cek koneksi SSH ke kedua VPS.
2. Tampilkan ringkasan tiap server: OS, uptime, disk, RAM, service yang jalan (nginx/pm2/docker), dan port terbuka.
3. Deploy project web-taiba (di bawah) ke **taibamedina** (konfirmasi dulu sebelum deploy).

## Info VPS (isi sebelum dipakai; JANGAN tulis password/private key di sini)
| Nama        | Host/IP | User | Port | Metode auth        |
|-------------|---------|------|------|--------------------|
| shuttshoot  | ?       | ?    | 22   | SSH key            |
| taibamedina | ?       | ?    | 22   | SSH key            |

## Project: web-taiba (Taiba Video Editor)
- Repo: `anasbukhari363/web-taiba`
- Branch kerja: `claude/beautiful-dijkstra-4yrb8o`
- Stack: Vite + React 19 + TypeScript, ffmpeg.wasm (100% client-side, tanpa backend)
- Build: `npm install && npm run build` -> hasil statis di `dist/`
- Dev: `npm run dev` (http://localhost:5173)
- Penting: ffmpeg.wasm multi-thread butuh header
  `Cross-Origin-Opener-Policy: same-origin` dan
  `Cross-Origin-Embedder-Policy: require-corp` pada web server produksi.
  Cek `vite.config.ts` untuk header yang dipakai di dev, lalu samakan di nginx.

## Contoh deploy statis (nginx)
```nginx
server {
  listen 80;
  server_name <domain>;
  root /var/www/web-taiba/dist;
  index index.html;
  add_header Cross-Origin-Opener-Policy same-origin;
  add_header Cross-Origin-Embedder-Policy require-corp;
  location / { try_files $uri /index.html; }
}
```

## Aturan
- Konfirmasi dulu sebelum perintah destruktif (rm, restart service produksi, ubah firewall).
- Jangan tampilkan atau commit secret/private key.
