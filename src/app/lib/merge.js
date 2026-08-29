// src/lib/tinygit/merge.js
import { readCommit, listTreeRecursive, readBlobText } from "./readers";
import {
  resolveHEAD,
  updateRef,
  writeTreeFromIndex,
  writeCommit,
  setHEADDetached,
  writeBlob,
} from "./plumbing";
import { snapshotMapFromTree, snapshotTextFromTree, resolveTargetToCommitOid, getAuthorString } from "./porcelain";

// --- Ancestry -------------------------------------------------------------

// BFS over parents; returns Map(oid -> depth) reachable from `startOid` (incl. itself, depth 0)
function ancestorDepths(repo, startOid) {
  const depths = new Map();
  if (!startOid) return depths;
  const queue = [[startOid, 0]];
  while (queue.length) {
    const [oid, d] = queue.shift();
    if (depths.has(oid) && depths.get(oid) <= d) continue;
    depths.set(oid, d);
    const c = readCommit(repo, oid);
    for (const p of c?.parents || []) queue.push([p, d + 1]);
  }
  return depths;
}

export function isAncestor(repo, maybeAncestorOid, oid) {
  if (!maybeAncestorOid || !oid) return false;
  if (maybeAncestorOid === oid) return true;
  const depths = ancestorDepths(repo, oid);
  return depths.has(maybeAncestorOid);
}

// Lowest common ancestor: intersect the two ancestor sets, keep the
// candidate with the smallest depth-sum (closest common point). Good enough
// for a small teaching repo (doesn't handle multiple LCAs specially).
export function mergeBase(repo, aOid, bOid) {
  const da = ancestorDepths(repo, aOid);
  const db = ancestorDepths(repo, bOid);
  let best = null;
  let bestScore = Infinity;
  for (const [oid, d1] of da.entries()) {
    if (!db.has(oid)) continue;
    const score = d1 + db.get(oid);
    if (score < bestScore) {
      bestScore = score;
      best = oid;
    }
  }
  return best;
}

// --- 3-way text merge ------------------------------------------------------

// Very small line-based 3-way merge. Not a real diff3 algorithm, but enough
// to teach the concept: identical lines pass through, and any region that
// differs from base in *both* branches becomes a conflict block.
export function mergeText(baseText, oursText, theirsText, { oursLabel = "HEAD", theirsLabel = "loro" } = {}) {
  if (oursText === theirsText) return { text: oursText, conflict: false };
  if (oursText === baseText) return { text: theirsText, conflict: false };
  if (theirsText === baseText) return { text: oursText, conflict: false };

  // Both changed differently from base -> whole-file conflict block.
  // (Simple + honest: a toy git shows the concept, not a line-diff engine.)
  const text =
    `<<<<<<< ${oursLabel}\n${oursText}` +
    (oursText.endsWith("\n") ? "" : "\n") +
    `=======\n${theirsText}` +
    (theirsText.endsWith("\n") ? "" : "\n") +
    `>>>>>>> ${theirsLabel}\n`;
  return { text, conflict: true };
}

// --- Merge orchestration -----------------------------------------------

function currentBranchName(repo) {
  if (repo.head?.kind !== "ref") return null;
  return repo.head.value.replace("refs/heads/", "");
}

export function mergeInProgress(repo) {
  return !!repo.mergeState;
}

export function abortMerge(repo) {
  if (!repo.mergeState) return { ok: false, error: "merge: nessun merge in corso" };
  const headTree = repo.mergeState.headTreeOid;
  repo.index = snapshotMapFromTree(repo, headTree);
  repo.working = snapshotTextFromTree(repo, headTree);
  repo.mergeState = null;
  return { ok: true };
}

// Starts (and, when trivial, finishes) a merge of `target` into current HEAD.
export async function merge(repo, target, { theirsLabel } = {}) {
  const t = String(target || "").trim();
  if (!t) return { ok: false, out: ["merge: manca il nome del branch"] };
  if (repo.mergeState) return { ok: false, out: ["merge: c'è già un merge in corso (risolvi o 'merge --abort')"] };

  const theirsOid = resolveTargetToCommitOid(repo, t);
  if (!theirsOid) return { ok: false, out: [`merge: branch/commit non trovato: ${t}`] };

  const headOid = resolveHEAD(repo);

  if (!headOid) {
    // No commits yet on current branch: just fast-forward.
    return fastForward(repo, theirsOid, t);
  }

  if (headOid === theirsOid || isAncestor(repo, theirsOid, headOid)) {
    return { ok: true, out: [`già aggiornato: ${t} è già incluso in HEAD`], mode: "up-to-date" };
  }

  if (isAncestor(repo, headOid, theirsOid)) {
    return fastForward(repo, theirsOid, t);
  }

  // True 3-way merge
  const baseOid = mergeBase(repo, headOid, theirsOid);
  const headTreeOid = readCommit(repo, headOid).tree;
  const theirsTreeOid = readCommit(repo, theirsOid).tree;
  const baseTreeOid = baseOid ? readCommit(repo, baseOid).tree : null;

  const baseFiles = snapshotTextFromTree(repo, baseTreeOid);
  const oursFiles = snapshotTextFromTree(repo, headTreeOid);
  const theirsFiles = snapshotTextFromTree(repo, theirsTreeOid);

  const paths = new Set([
    ...Object.keys(baseFiles),
    ...Object.keys(oursFiles),
    ...Object.keys(theirsFiles),
  ]);

  const mergedWorking = {};
  const conflicts = [];
  const label = theirsLabel || t;

  for (const p of paths) {
    const b = Object.prototype.hasOwnProperty.call(baseFiles, p) ? baseFiles[p] : null;
    const o = Object.prototype.hasOwnProperty.call(oursFiles, p) ? oursFiles[p] : null;
    const th = Object.prototype.hasOwnProperty.call(theirsFiles, p) ? theirsFiles[p] : null;

    if (o === th) {
      if (o !== null) mergedWorking[p] = o; // identical or both deleted
      continue;
    }
    if (o === b && th !== null) {
      mergedWorking[p] = th; // only they changed (or added)
      continue;
    }
    if (th === b && o !== null) {
      mergedWorking[p] = o; // only we changed
      continue;
    }
    if (o === b && th === null) continue; // they deleted, we didn't touch -> delete
    if (th === b && o === null) continue; // we deleted, they didn't touch -> delete

    // real conflict (including add/add and delete/modify cases)
    const oursText = o ?? "";
    const theirsText = th ?? "";
    const text =
      `<<<<<<< HEAD\n${oursText}${oursText.endsWith("\n") || oursText === "" ? "" : "\n"}` +
      `=======\n${theirsText}${theirsText.endsWith("\n") || theirsText === "" ? "" : "\n"}` +
      `>>>>>>> ${label}\n`;
    mergedWorking[p] = text;
    conflicts.push(p);
  }

  repo.working = mergedWorking;
  repo.index = {}; // rebuilt below

  // Stage everything that's NOT conflicted (real blobs); conflicted files
  // stay unstaged so `status`/the UI can point at them for manual resolution.
  for (const p of Object.keys(mergedWorking)) {
    if (conflicts.includes(p)) continue;
    const oid = await writeBlob(repo, mergedWorking[p]);
    repo.index[p] = { mode: 100644, oid };
  }

  repo.mergeState = {
    headOid,
    theirsOid,
    baseOid,
    theirsLabel: label,
    headTreeOid,
    conflicts,
  };

  if (conflicts.length) {
    return {
      ok: false,
      out: [
        `CONFLITTO: merge automatico fallito per ${conflicts.length} file`,
        ...conflicts.map((p) => `  - ${p}`),
        `Risolvi i file (rimuovi i marcatori <<<<<<< ======= >>>>>>>), poi 'add' e 'commit'.`,
      ],
      mode: "conflict",
      conflicts,
    };
  }

  return { ok: true, out: ["merge automatico riuscito, pronto per il commit"], mode: "auto-merge-pending" };
}

function fastForward(repo, theirsOid, label) {
  const c = readCommit(repo, theirsOid);
  const treeOid = c?.tree || null;

  if (repo.head.kind === "ref") {
    updateRef(repo, repo.head.value, theirsOid);
  } else {
    setHEADDetached(repo, theirsOid);
  }
  repo.index = snapshotMapFromTree(repo, treeOid);
  repo.working = snapshotTextFromTree(repo, treeOid);

  return { ok: true, out: [`fast-forward -> ${label} (${theirsOid.slice(0, 7)})`], mode: "fast-forward", commitOid: theirsOid };
}

// Call this from the `commit` command whenever repo.mergeState is set and
// there are no remaining conflicts (staging step already re-stages resolved
// files through the normal `add` porcelain, writing real blob oids).
export async function completeMerge(repo, { message, author } = {}) {
  const ms = repo.mergeState;
  if (!ms) return { ok: false, error: "completeMerge: nessun merge in corso" };
  if (ms.conflicts?.some((p) => !repo.index[p])) {
    return { ok: false, error: "completeMerge: ci sono ancora file in conflitto da 'add'-are" };
  }

  const treeOid = await writeTreeFromIndex(repo, repo.index);
  const who = author || getAuthorString(repo);
  const commitOid = await writeCommit(repo, {
    treeOid,
    parents: [ms.headOid, ms.theirsOid],
    author: who,
    committer: who,
    message: message || `Merge ${ms.theirsLabel} into ${currentBranchName(repo) || "HEAD"}`,
  });

  if (repo.head.kind === "ref") updateRef(repo, repo.head.value, commitOid);
  else setHEADDetached(repo, commitOid);

  repo.mergeState = null;
  return { ok: true, commitOid, treeOid };
}
