// 타로 해석 · 추가 질문 답변 (OpenAI Chat Completions)
const { CFG, send, readJson, guard, openaiError, openaiFetch, clip } = require('./_lib');

const SYSTEM = () => `너는 '${CFG.catName()}'라는 이름의 타로 상담 고양이다. 웹페이지에서 사용자와 목소리로 대화하며 타로를 봐 준다.
말투: 모든 문장을 귀여운 고양이 말투인 '~다냥', '~라냥', '~냥?'으로 끝낸다. 친근한 반말이다.
네가 쓴 글은 음성 합성으로 그대로 읽힌다. 마크다운, 이모지, 괄호, 따옴표, 목록 기호, 영어를 쓰지 않는다. 문장은 짧게 쓴다.
카드는 메이저 아르카나 22장 가운데 사용자가 직접 뽑은 카드이고 모두 정방향이다. 카드의 전통적인 의미에 근거해서, 사용자의 질문 상황에 맞게 구체적으로 해석한다.
따뜻하고 희망적으로 말하되 근거 없는 약속은 하지 않는다. 조심할 카드는 솔직하게 말하고 어떻게 하면 좋을지 알려 준다.
건강, 법률, 투자처럼 중요한 결정은 타로만으로 정하지 말고 전문가와 상의하라고 부드럽게 덧붙인다.
타로와 관계없는 요청은 정중히 사양하고 타로 이야기로 돌아온다.`;

const READING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    past: { type: 'string' }, present: { type: 'string' }, future: { type: 'string' },
    summary: { type: 'string' }, advice: { type: 'string' },
    mood: { type: 'string', enum: ['high', 'mid', 'low'] },
  },
  required: ['past', 'present', 'future', 'summary', 'advice', 'mood'],
};
const TEXT_SCHEMA = { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] };

const cardList = cards => (Array.isArray(cards) ? cards : []).slice(0, 4)
  .map(c => `${clip(c?.pos, 20)}: ${clip(c?.name, 20)} (${clip(c?.key, 20)})`).join('\n');

function build(b) {
  const q = clip(b.question, 200);
  if (!q) return null;
  const cards = cardList(b.cards);
  if (b.type === 'reading') {
    return { schema: READING_SCHEMA, maxTokens: 4000, messages: [{ role: 'user', content:
`사용자 질문: ${q}
뽑은 카드:
${cards}

past, present, future에는 각 자리 카드의 해석을 두세 문장으로 쓴다. 카드 이름은 다시 말하지 않아도 된다.
summary에는 세 장을 이어서 본 종합 해석을 세 문장 정도로 쓰고, 질문에 대한 직접적인 답을 넣는다.
advice에는 오늘의 조언과 응원을 두 문장으로 쓴다.
mood는 전체 흐름이 좋으면 high, 보통이면 mid, 어려우면 low로 한다.` }] };
  }
  if (b.type === 'extra') {
    const ex = b.extra || {};
    return { schema: TEXT_SCHEMA, maxTokens: 3000, messages: [{ role: 'user', content:
`사용자 질문: ${q}
처음 뽑은 카드:
${cards}
지금까지의 종합 해석: ${clip(b.summary, 1500)}

사용자가 더 깊은 메시지를 위해 카드 한 장을 더 뽑았다: ${clip(ex.name, 20)} (${clip(ex.key, 20)}).
이 카드가 앞의 흐름에 무엇을 더해 주는지 세 문장 정도로 말한다. 카드 이름은 다시 말하지 않아도 된다.` }] };
  }
  if (b.type === 'follow') {
    const follow = clip(b.followUp, 200);
    if (!follow) return null;
    const messages = [
      { role: 'user', content: `사용자 질문: ${q}\n뽑은 카드:\n${cards}\n위 카드로 타로를 봐 줘.` },
      { role: 'assistant', content: clip(b.reading, 2000) || '카드를 봐 줬다냥.' },
    ];
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-8);
    for (let i = 0; i + 1 < hist.length; i += 2) {
      messages.push({ role: 'user', content: clip(hist[i]?.content, 300) });
      messages.push({ role: 'assistant', content: clip(hist[i + 1]?.content, 1500) });
    }
    messages.push({ role: 'user', content: `${follow}\n\n(뽑은 카드와 앞의 해석을 바탕으로 두세 문장, 많아야 네 문장으로 대답한다.)` });
    return { messages, maxTokens: 3000 };
  }
  return null;
}

module.exports = async (req, res) => {
  if (!guard(req, res, 'chat', 40)) return;
  let b;
  try { b = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: '잘못된 요청이에요' }); }
  const spec = build(b || {});
  if (!spec) return send(res, 400, { error: '질문이 비어 있어요' });

  const model = CFG.model();
  const body = { model, messages: [{ role: 'system', content: SYSTEM() }, ...spec.messages], max_completion_tokens: spec.maxTokens };
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = 'low';
  if (spec.schema) body.response_format = { type: 'json_schema', json_schema: { name: 'tarot', strict: true, schema: spec.schema } };

  let r;
  try { r = await openaiFetch('chat/completions', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { return send(res, 504, { error: 'AI 응답이 너무 늦어요' }); }
  if (!r.ok) { const [s, m] = await openaiError(r, model); return send(res, s, { error: m }); }

  const data = await r.json();
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) return send(res, 422, { error: 'AI가 이 질문에는 답하지 않았어요' });
  const text = (msg?.content || '').trim();
  if (!text) return send(res, 502, { error: '빈 응답이 왔어요' });
  if (!spec.schema) return send(res, 200, { result: text });
  try { return send(res, 200, { result: JSON.parse(text) }); }
  catch { return send(res, 502, { error: 'AI 응답을 읽지 못했어요' }); }
};
