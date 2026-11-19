// DevTools コース I — 画面の裏側を見る
import { d01 } from './dt/d01-console.js';
import { d02 } from './dt/d02-elements.js';
import { d03 } from './dt/d03-network.js';
import { d04 } from './dt/d04-headers.js';

export const stageDevtools1 = {
  id: 'dt-basics',
  track: 'devtools',
  title: 'DevTools I — 画面の裏側を見る',
  subtitle: 'Console・Elements・Network で、ブラウザが裏でやっていることを読む',
  intro: 'ブラウザの開発者ツール(DevTools)は、画面の「裏側」を見るための道具。スマホでは直接開けないので、ここでは架空のWebページを使った疑似DevToolsで練習する。画面の見え方は同じなので、PCで本物を開いたときにそのまま使える。',
  missions: [d01, d02, d03, d04],
};
