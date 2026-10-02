/* DOMINANT · engine/cues.js
   cue_sheet.json is the single source of truth for sync (the score is keyed to the same frames).
   Entries: {frame, id, act, desc}. Scenes read frames from here instead of hard-coding them. */
let LIST = [], BY_ID = new Map();

export async function loadCues(url = '/cue_sheet.json') {
  const j = await (await fetch(url)).json();
  LIST = j.slice().sort((a, b) => a.frame - b.frame || (a.id < b.id ? -1 : 1));
  BY_ID = new Map(LIST.map((c) => [c.id, c]));
  return LIST;
}
/** cue('a1.slam') -> 3. Throws on unknown ids so a typo never silently renders at frame 0. */
export function cue(id) { const c = BY_ID.get(id); if (!c) throw new Error(`unknown cue "${id}" (see cue_sheet.json)`); return c.frame; }
export const hasCue = (id) => BY_ID.has(id);
/** All cues whose id starts with prefix, in frame order: cues('a1.hit') -> [{frame,id,act,desc}, ...] */
export const cues = (prefix = '') => LIST.filter((c) => c.id.startsWith(prefix));
/** Frames only: cueFrames('a1.hit') -> [12, 20, 27, ...] */
export const cueFrames = (prefix) => cues(prefix).map((c) => c.frame);
export const allCues = () => LIST;
