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

// 索引を構築
const missionById = {};
const stageOfMission = {};
let order = [];
for (const st of STAGES) {
  for (const m of st.missions) {
    missionById[m.id] = m;
    stageOfMission[m.id] = st.id;
    order.push(m.id);
  }
}

export function getMission(id) { return missionById[id]; }
export function getStageOf(id) { return stageOfMission[id]; }
export function missionOrder() { return order.slice(); }
export function allMissions() { return order.map(id => missionById[id]); }

/** 直前のミッションが完了していれば解放（一本道） */
export function isMissionUnlocked(id, isDone) {
  const idx = order.indexOf(id);
  if (idx <= 0) return true;
  return isDone(order[idx - 1]);
}

/** ステージ内の最初の未クリアミッション、なければ null */
export function nextMissionInStage(stage, isDone) {
  for (const m of stage.missions) if (!isDone(m.id)) return m.id;
  return null;
}
