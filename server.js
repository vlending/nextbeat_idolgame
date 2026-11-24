// 내 컴퓨터나 일반 서버에서 실행할 때 쓰는 작은 서버 (Vercel에서는 쓰지 않음)
// 실행: OPENAI_API_KEY=sk-... node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.mp3':'audio/mpeg' };
const API = { status:require('./api/status'), chat:require('./api/chat'), tts:require('./api/tts'), stt:require('./api/stt') };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = /^\/api\/(\w+)$/.exec(url.pathname);
  if (m) {
    const fn = API[m[1]];
    if (!fn) { res.statusCode = 404; return res.end('not found'); }
    try { await fn(req, res); } catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"서버 오류"}'); } }
    return;
  }
  let p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](\.|api[\\/]|server\.js)/.test(p)) { res.statusCode = 404; return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
