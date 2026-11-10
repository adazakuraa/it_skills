// ミッション定義で使い回す共通データ・ヘルパー
export const LAB_NET = {
  self: '10.10.14.7', gateway: '10.10.14.1', prefix: 24,
  dns: {
    'gw.lab': '10.10.14.1', 'dns.lab': '10.10.14.2',
    'web.lab': '10.10.14.50', 'files.lab': '10.10.14.30',
    'dc01.lab': '10.10.14.10', 'db.lab': '10.10.14.40',
  },
  arp: { '10.10.14.1': '02:42:0a:0a:05:01', '10.10.14.50': '02:42:0a:0a:05:32' },
  hosts: {
    '10.10.14.50': { ports: [
      { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'nginx/1.22', http: {
        routes: [{ path: '/', body: '<html><title>web.lab</title><body>OK</body></html>' }],
        notFound: { body: '404', status: 404 },
      } },
      { port: 443, proto: 'tcp', state: 'open', service: 'https', banner: 'nginx/1.22', http: {
        routes: [{ path: '/', body: '<html><body>secure</body></html>' }],
      } },
    ] },
  },
};

// 理論タスク向け：番号選択の mcq を手早く作る
export function mcq(question, choices, answerNum, explain, { narration, hints } = {}) {
  const lines = choices.map((c, i) => `${i + 1}) ${c}`).join('  ');
  return {
    q: `${question}\n${lines}`,
    check: { type: 'answer', any: [String(answerNum)] },
    answerHint: '番号で回答',
    narration,
    hints: hints || ['各選択肢の意味を1つずつ吟味する', '明らかに違うものを消去していく', `正解は ${answerNum} 番`],
    explain,
  };
}
