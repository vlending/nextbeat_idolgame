// 고양이 목소리 (OpenAI 음성 합성) → mp3를 돌려준다
const { CFG, send, readJson, guard, openaiError, openaiFetch, clip } = require('./_lib');

const STYLE = '귀엽고 장난기 많은 아기 고양이 타로 상담사 캐릭터. 밝고 살짝 높은 톤으로, 다정하고 또박또박 한국어로 말한다. 문장 끝의 냥을 귀엽게 살린다. 너무 빠르지 않게.';

module.exports = async (req, res) => {
  if (!CFG.ttsOn()) return send(res, 404, { error: 'AI 목소리가 꺼져 있어요' });
  if (!guard(req, res, 'tts', 150)) return;
  let b;
  try { b = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: '잘못된 요청이에요' }); }
  const text = clip(b?.text, 700);
  if (!text) return send(res, 400, { error: '읽을 글이 없어요' });

  let r;
  try {
    r = await openaiFetch('audio/speech', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CFG.ttsModel(), voice: CFG.voice(), input: text, instructions: STYLE, response_format: 'mp3' }),
    });
  } catch { return send(res, 504, { error: '목소리 응답이 너무 늦어요' }); }
  if (!r.ok) { const [s, m] = await openaiError(r, CFG.ttsModel()); return send(res, s, { error: m }); }

  const buf = Buffer.from(await r.arrayBuffer());
  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
};
