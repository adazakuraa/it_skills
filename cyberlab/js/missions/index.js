// ステージ構成の統合。学習順（依存関係）に並べる。
import { stage0 } from './stage0-tutorial.js';
import { stage1 } from './stage1-files.js';
import { stage2 } from './stage2-permissions.js';
import { stage3 } from './stage3-incident.js';
import { stage4 } from './stage4-network.js';
import { stage5 } from './stage5-webvuln.js';
import { stageNetBasics } from './stage-netbasics.js';
import { stageSecBasics } from './stage-secbasics.js';
import { stageTextproc } from './stage-textproc.js';
import { stageShell } from './stage-shell.js';
import { stageCrypto } from './stage-crypto.js';
import { stageForensics } from './stage-forensics.js';
import { stageLinux2 } from './stage-linux2.js';
import { stageWebAdv } from './stage-webadv.js';
import { stageDefense } from './stage-defense.js';
import { stageNetAdv } from './stage-netadv.js';
import { stageCTF } from './stage-ctf.js';
import { stageSysadmin } from './stage-sysadmin.js';
import { stageRecon } from './stage-recon.js';
import { stageAdvanced } from './stage-advanced.js';
import { stagePowerTools } from './stage-powertools.js';
import { stageApiSec } from './stage-apisec.js';
import { stageCloud } from './stage-cloud.js';
import { stageDetect } from './stage-detect.js';
import { stageAISec } from './stage-aisec.js';
import { stageDevtools1 } from './stage-devtools1.js';
import { stageDevtools2 } from './stage-devtools2.js';
import { stagePacket } from './stage-packet.js';

export const STAGES = [
  stage0,          // 入門: ターミナル基礎
  stage1,          // ファイル調査・検索・集計
  stageTextproc,   // テキスト処理
  stageLinux2,     // Linux応用(作成/検索/ユーザー/所有権)
  stage2,          // 権限・プロセス
  stageShell,      // 環境変数・スクリプト・cron
  stageSysadmin,   // システム運用(ディスク/ログ/サービス/パッケージ)
  stagePowerTools, // 実務の道具(jq/capabilities/systemd timer/SSH鍵)
  stageRecon,      // 情報収集・OSINT
  stageNetBasics,  // ネットワーク理論
  stage4,          // ネットワーク調査(実技)
  stageNetAdv,     // ネットワーク調査 II(深掘り)
  stagePacket,     // パケット解析(tcpdump)
  stageSecBasics,  // セキュリティ基礎理論
  stageCrypto,     // 暗号・ハッシュ(実技)
  stage3,          // ログ解析・インシデント
  stageForensics,  // フォレンジック
  stageDefense,    // 防御・監視(ブルーチーム)
  stage5,          // Web脆弱性 I
  stageWebAdv,     // Web脆弱性 II
  stageApiSec,     // API & 認証(JWT/SSRF)
  stageCloud,      // クラウド & コンテナ(IAM/S3/Docker/脱出)
  stageAdvanced,   // 発展分野(AD/クラウド/コンテナ/IR 等)
  stageDetect,     // 脅威分析と検知(ATT&CK/検知/IoC)
  stageAISec,      // AI/LLMセキュリティ
  stageCTF,        // 総合演習(CTF)
];

// 今後のステージはここに追加する:
//   フォレンジック / 暗号 / Active Directory / クラウド・コンテナ など

// ---------- コース(トラック) ----------
// main    : 既存のメインコース（一本道）
// devtools: ブラウザ開発者ツールの読み方を学ぶ並行コース。メインの進行状況とは独立して進められる。
export const DEV_STAGES = [stageDevtools1, stageDevtools2];

export const TRACKS = [
  { id: 'main', title: 'メインコース', stages: STAGES },
  { id: 'devtools', title: 'DevTools コース', stages: DEV_STAGES },
];
export const ALL_STAGES = [...STAGES, ...DEV_STAGES];

// 索引を構築（コースごとに一本道の順序を持つ）
const missionById = {};
const stageOfMission = {};
const trackOfMission = {};
const orderByTrack = {};
const order = [];
for (const tr of TRACKS) {
  orderByTrack[tr.id] = [];
  for (const st of tr.stages) {
    for (const m of st.missions) {
      missionById[m.id] = m;
      stageOfMission[m.id] = st.id;
      trackOfMission[m.id] = tr.id;
      orderByTrack[tr.id].push(m.id);
      order.push(m.id);
    }
  }
}

export function getMission(id) { return missionById[id]; }
export function getStageOf(id) { return stageOfMission[id]; }
export function trackOf(id) { return trackOfMission[id]; }
export function trackOfStage(stageId) { return TRACKS.find(t => t.stages.some(s => s.id === stageId)); }
export function getStage(stageId) { return ALL_STAGES.find(s => s.id === stageId); }
export function missionOrder() { return order.slice(); }
export function allMissions() { return order.map(id => missionById[id]); }
export function missionsOfTrack(trackId) { return (orderByTrack[trackId] || []).map(id => missionById[id]); }

/** 同じコース内で、直前のミッションが完了していれば解放（コースごとに一本道） */
export function isMissionUnlocked(id, isDone) {
  const list = orderByTrack[trackOfMission[id]] || [];
  const idx = list.indexOf(id);
  if (idx <= 0) return true;
  return isDone(list[idx - 1]);
}

/** ステージ内の最初の未クリアミッション、なければ null */
export function nextMissionInStage(stage, isDone) {
  for (const m of stage.missions) if (!isDone(m.id)) return m.id;
  return null;
}
