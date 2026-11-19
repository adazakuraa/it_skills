// DevTools コース II — 保存・コード・保護・速度を読む
import { d05 } from './dt/d05-storage.js';
import { d06 } from './dt/d06-sources.js';
import { d07 } from './dt/d07-debugger.js';
import { d08 } from './dt/d08-security.js';
import { d09 } from './dt/d09-performance.js';
import { d10 } from './dt/d10-capstone.js';

export const stageDevtools2 = {
  id: 'dt-advanced',
  track: 'devtools',
  title: 'DevTools II — 保存・コード・保護・速度',
  subtitle: 'Application・Sources・デバッガ・Security・Performance、そして総合演習',
  intro: '後半は、ブラウザに保存されるもの、ページを動かすコード、守りの仕組み、表示速度を読む。最後は、これまでの道具を総動員して「購入できない」原因を突き止める総合演習。',
  missions: [d05, d06, d07, d08, d09, d10],
};
