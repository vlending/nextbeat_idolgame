// 음성 입력 받아쓰기 (브라우저 음성 인식이 없는 곳용). 녹음 파일을 base64로 받는다.
const { CFG, send, readJson, guard, openaiError, openaiFetch } = require('./_lib');

module.exports = async (req, res) => {
  if (!guard(req, res, 'stt', 30)) return;
  let b;
  try { b = await readJson(req, 4 * 1024 * 1024); } catch (e) { return send(res, e.status || 400, { error: '녹음이 너무 길어요' }); }
  const audio = Buffer.from(String(b?.audio || ''), 'base64');
  if (audio.length < 1000) return send(res, 400, { error: '녹음이 너무 짧아요' });
  if (audio.length > 3 * 1024 * 1024) return send(res, 413, { error: '녹음이 너무 길어요' });
  const mime = /^audio\/[\w.+-]+/.exec(String(b?.mime || ''))?.[0] || 'audio/webm';
  const ext = /mp4|m4a|aac/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';

  const fd = new FormData();
  fd.append('file', new Blob([audio], { type: mime }), `speech.${ext}`);
  fd.append('model', CFG.sttModel());
  fd.append('language', 'ko');

  let r;
  try { r = await openaiFetch('audio/transcriptions', { body: fd }); }
  catch { return send(res, 504, { error: '받아쓰기 응답이 너무 늦어요' }); }
  if (!r.ok) { const [s, m] = await openaiError(r, CFG.sttModel()); return send(res, s, { error: m }); }
  const data = await r.json();
  return send(res, 200, { text: String(data.text || '').trim() });
};
