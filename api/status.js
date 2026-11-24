// 페이지가 처음 열릴 때 AI를 쓸 수 있는지 확인 (키 값은 절대 알려 주지 않음)
const { CFG, send } = require('./_lib');

module.exports = (req, res) => {
  const ai = !!CFG.key();
  send(res, 200, { ai, tts: ai && CFG.ttsOn(), catName: CFG.catName() });
};
