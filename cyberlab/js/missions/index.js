// ステージ構成の統合。学習順（依存関係）に並べる。
import { stage0 } from './stage0-tutorial.js';
import { stage1 } from './stage1-files.js';
import { stage2 } from './stage2-permissions.js';
import { stage3 } from './stage3-incident.js';

export const STAGES = [stage0, stage1, stage2, stage3];

// 今後のステージ（Phase 3-4）はここに追加する:
//   ネットワーク基礎 / Web脆弱性(SQLi,XSS) / フォレンジック / 発展

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
