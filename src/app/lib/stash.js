// src/lib/tinygit/stash.js
import { getHeadTreeOid, snapshotTextFromTree, snapshotMapFromTree } from "./porcelain";
import { resolveHEAD } from "./plumbing";

function currentBranchLabel(repo) {
  return repo.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : "detached HEAD";
}

// Simplified stash: snapshots working+index exactly as they are, then resets
// both back to HEAD. Applying later (pop/apply) just overwrites working+index
// with that snapshot — no conflict detection against a HEAD that may have
// moved on in the meantime, unlike real Git. Documented as a known
// simplification (see the Advanced Commands page).
export function stashSave(repo, message) {
  const headTreeOid = getHeadTreeOid(repo);
  const headFiles = snapshotTextFromTree(repo, headTreeOid);

  const keys = new Set([...Object.keys(repo.working || {}), ...Object.keys(headFiles)]);
  let dirty = false;
  for (const k of keys) {
    if ((repo.working?.[k] ?? null) !== (headFiles[k] ?? null)) {
      dirty = true;
      break;
    }
  }
  if (!dirty) return { ok: false, error: "stash: nothing to save (working tree matches HEAD)" };

  repo.stashes = repo.stashes || [];
  repo.stashes.unshift({
    message: message || `WIP on ${currentBranchLabel(repo)}`,
    working: { ...(repo.working || {}) },
    index: JSON.parse(JSON.stringify(repo.index || {})),
    headOid: resolveHEAD(repo),
  });

  repo.working = headFiles;
  repo.index = snapshotMapFromTree(repo, headTreeOid);
  return { ok: true };
}

export function stashList(repo) {
  return (repo.stashes || []).map((s, i) => `stash@{${i}}: ${s.message}`);
}

export function stashPop(repo, index = 0) {
  const list = repo.stashes || [];
  const entry = list[index];
  if (!entry) return { ok: false, error: `stash: no entry at stash@{${index}}` };
  repo.working = { ...entry.working };
  repo.index = JSON.parse(JSON.stringify(entry.index));
  list.splice(index, 1);
  return { ok: true, message: entry.message };
}

export function stashDrop(repo, index = 0) {
  const list = repo.stashes || [];
  if (!list[index]) return { ok: false, error: `stash: no entry at stash@{${index}}` };
  const [removed] = list.splice(index, 1);
  return { ok: true, message: removed.message };
}
