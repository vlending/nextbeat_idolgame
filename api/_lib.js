// 서버 공용 도구. OpenAI 키는 서버 환경 변수(OPENAI_API_KEY)에만 있고 브라우저로는 절대 보내지 않는다.
// 파일 이름이 _로 시작하므로 Vercel에서 주소(엔드포인트)로 열리지 않는다.

const env = (k, d) => (process.env[k] && String(process.env[k]).trim()) || d;
const OPENAI = env('OPENAI_BASE_URL', 'https://api.openai.com/v1');

const CFG = {
  key: () => env('OPENAI_API_KEY', ''),
  model: () => env('OPENAI_MODEL', 'gpt-5-mini'),
  ttsModel: () => env('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'),
  voice: () => env('OPENAI_TTS_VOICE', 'coral'),
  ttsOn: () => env('TTS_ENABLED', 'true') !== 'false',
  sttModel: () => env('OPENAI_STT_MODEL', 'gpt-4o-mini-transcribe'),
  catName: () => env('CAT_NAME', '루나'),
};

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readJson(req, limit = 4 * 1024 * 1024) {
  // Vercel이 이미 읽어 둔 경우
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// 같은 사이트에서 온 요청만 받는다(다른 웹사이트가 이 서버를 몰래 쓰지 못하게).
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = env('ALLOWED_ORIGINS', '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === host;
  } catch { return false; }
}

// 간단한 사용량 제한: IP마다 10분에 max번 (서버 인스턴스마다 따로 셈)
const buckets = new Map();
function rateOk(req, name, max) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const k = `${name}:${ip}`, now = Date.now(), win = 10 * 60 * 1000;
  const b = buckets.get(k);
  if (!b || now - b.t > win) { buckets.set(k, { t: now, n: 1 }); return true; }
  b.n += 1;
  if (buckets.size > 5000) for (const [kk, v] of buckets) if (now - v.t > win) buckets.delete(kk);
  return b.n <= max;
}

// 공통 검사. 통과하면 true
function guard(req, res, name, max) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST만 받아요' }); return false; }
  if (!originOk(req)) { send(res, 403, { error: '허용되지 않은 사이트예요' }); return false; }
  if (!CFG.key()) { send(res, 503, { error: '서버에 OpenAI 키가 설정되지 않았어요' }); return false; }
  if (!rateOk(req, name, max)) { send(res, 429, { error: '잠시 후 다시 해 주세요 (요청이 너무 많아요)' }); return false; }
  return true;
}

async function openaiError(r, model) {
  const data = await r.json().catch(() => ({}));
  const msg = data?.error?.message || '', code = data?.error?.code || '';
  console.error('OpenAI error', r.status, code, msg);
  if (r.status === 401) return [502, '서버의 OpenAI 키가 올바르지 않아요'];
  if (code === 'insufficient_quota' || /quota|billing/i.test(msg)) return [502, 'OpenAI 크레딧(잔액)이 부족해요'];
  if (r.status === 429) return [429, 'AI 요청이 많아요. 잠시 후 다시 해 주세요'];
  if (code === 'model_not_found' || r.status === 404) return [502, `서버의 모델 설정을 확인해 주세요 (${model})`];
  if (r.status >= 500) return [502, 'OpenAI 서버가 바빠요. 잠시 후 다시 해 주세요'];
  return [502, `AI 요청 오류 (${r.status})`];
}

function openaiFetch(path, init, ms = 55000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(`${OPENAI}/${path}`, {
    method: 'POST', signal: ctrl.signal, ...init,
    headers: { Authorization: `Bearer ${CFG.key()}`, ...(init.headers || {}) },
  }).finally(() => clearTimeout(t));
}

// 문자열 정리: 길이 제한 + 제어문자 제거
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

module.exports = { CFG, send, readJson, guard, openaiError, openaiFetch, clip };
