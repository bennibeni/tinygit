// src/lib/tinygit/porcelain.js
import {
  resolveHEAD,
  setHEADDetached,
  setHEADToRef,
  updateRef,
  stageTextFile,
} from "./plumbing";
import { readCommit, listTreeRecursive, readBlobText } from "./readers";

export function resolveTargetToCommitOid(repo, target) {
  const t = String(target || "").trim();
  if (!t) return null;

  // branch name shorthand
  if (repo.refs?.[`refs/heads/${t}`]) return repo.refs[`refs/heads/${t}`];
  if (repo.refs?.[t]) return repo.refs[t];

  // raw full oid
  if (/^[0-9a-f]{40}$/i.test(t)) return t.toLowerCase();

  // abbreviated oid (like the 7-char hashes shown everywhere in the UI):
  // resolve by unique prefix match against every known object.
  if (/^[0-9a-f]{4,39}$/i.test(t)) {
    const needle = t.toLowerCase();
    const matches = Object.keys(repo.objects || {}).filter((oid) => oid.startsWith(needle));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null; // ambiguous prefix
  }

  return null;
}

export function getHeadCommitOid(repo) {
  return resolveHEAD(repo);
}

export function getHeadTreeOid(repo) {
  const head = getHeadCommitOid(repo);
  if (!head) return null;
  const c = readCommit(repo, head);
  return c?.tree || null;
}

export function snapshotMapFromTree(repo, treeOid) {
  if (!treeOid) return {};
  const items = listTreeRecursive(repo, treeOid);
  const out = {};
  for (const it of items) {
    if (it.kind === "blob") out[it.path] = { mode: 100644, oid: it.oid };
  }
  return out;
}

export function snapshotTextFromTree(repo, treeOid) {
  const items = listTreeRecursive(repo, treeOid);
  const out = {};
  for (const it of items) {
    if (it.kind === "blob") out[it.path] = readBlobText(repo, it.oid) ?? "";
  }
  return out;
}

export function snapshotTextFromIndex(repo, indexMap) {
  const idx = indexMap || repo.index || {};
  const out = {};
  for (const [path, rec] of Object.entries(idx)) {
    const oid = rec?.oid;
    out[path] = oid ? (readBlobText(repo, oid) ?? "") : "";
  }
  return out;
}

// --- Standard-ish Working/Index helpers ---

// Stage one path:
// - if present in working => stage file content
// - if missing in working but tracked in index or HEAD => stage deletion
export async function stagePath(repo, path) {
  const p = String(path || "").trim();
  if (!p) return { ok: false, error: "add: missing path" };

  const work = repo.working || {};
  const idx = repo.index || {};

  if (work[p] != null) {
    await stageTextFile(repo, p, String(work[p]));
    return { ok: true, mode: "file" };
  }

  const headTree = getHeadTreeOid(repo);
  const headSnap = snapshotMapFromTree(repo, headTree);
  if (idx[p] || headSnap[p]) {
    delete idx[p];
    repo.index = idx;
    return { ok: true, mode: "delete" };
  }

  return { ok: false, error: `add: no such file in work/index/head: ${p}` };
}

// Stage all:
// - stage/update every working file into index
// - remove from index any path absent in working (staged deletions)
export async function stageAll(repo) {
  const work = repo.working || {};
  const idx = repo.index || {};

  let files = 0;
  let deletions = 0;

  for (const p of Object.keys(work)) {
    await stageTextFile(repo, p, String(work[p] ?? ""));
    files++;
  }

  for (const p of Object.keys(idx)) {
    if (work[p] == null) {
      delete idx[p];
      deletions++;
    }
  }

  repo.index = idx;
  return { ok: true, files, deletions };
}

// Unstage one path: reset index to HEAD snapshot for that path.
export function unstagePath(repo, path) {
  const p = String(path || "").trim();
  if (!p) return { ok: false, error: "unstage: missing path" };

  const headTree = getHeadTreeOid(repo);
  const headSnap = snapshotMapFromTree(repo, headTree);
  const idx = repo.index || {};

  if (headSnap[p]) {
    idx[p] = { mode: headSnap[p].mode ?? 100644, oid: headSnap[p].oid };
    repo.index = idx;
    return { ok: true, mode: "restore-head" };
  }

  if (idx[p]) {
    delete idx[p];
    repo.index = idx;
    return { ok: true, mode: "remove" };
  }

  return { ok: false, error: `unstage: path not staged: ${p}` };
}

export function unstageAll(repo) {
  const headTree = getHeadTreeOid(repo);
  repo.index = snapshotMapFromTree(repo, headTree);
  return { ok: true };
}

// Restore working file(s) from index (default) or from HEAD.
export function restorePath(repo, path, { from = "index" } = {}) {
  const p = String(path || "").trim();
  if (!p) return { ok: false, error: "restore: missing path" };

  const work = repo.working || {};
  const idx = repo.index || {};

  if (from === "index") {
    const oid = idx[p]?.oid || null;
    if (oid) {
      work[p] = readBlobText(repo, oid) ?? "";
      repo.working = work;
      return { ok: true, mode: "from-index" };
    }
  }

  const headTree = getHeadTreeOid(repo);
  const headText = snapshotTextFromTree(repo, headTree);
  if (Object.prototype.hasOwnProperty.call(headText, p)) {
    work[p] = headText[p];
    repo.working = work;
    return { ok: true, mode: "from-head" };
  }

  if (work[p] != null) {
    delete work[p];
    repo.working = work;
  }
  return { ok: true, mode: "delete" };
}

export function restoreAll(repo, { from = "index" } = {}) {
  if (from === "index") {
    repo.working = snapshotTextFromIndex(repo, repo.index);
    return { ok: true };
  }
  const headTree = getHeadTreeOid(repo);
  repo.working = snapshotTextFromTree(repo, headTree);
  return { ok: true };
}

// Standard-friendly summary for UI: staged vs unstaged changes.
export function getChanges(repo) {
  const headTree = getHeadTreeOid(repo);
  const headSnap = snapshotMapFromTree(repo, headTree);
  const idx = repo.index || {};
  const work = repo.working || {};

  const staged = []; // HEAD ↔ Index
  const unstaged = []; // Index ↔ Working

  // staged
  {
    const paths = new Set([...Object.keys(headSnap), ...Object.keys(idx)]);
    for (const p of [...paths].sort()) {
      const h = headSnap[p]?.oid || null;
      const i = idx[p]?.oid || null;
      if (h === i) continue;
      if (h && !i) staged.push({ path: p, kind: "deleted" });
      else if (!h && i) staged.push({ path: p, kind: "added" });
      else staged.push({ path: p, kind: "modified" });
    }
  }

  // unstaged
  const conflictSet = new Set(repo.mergeState?.conflicts || []);
  {
    const paths = new Set([...Object.keys(idx), ...Object.keys(work), ...conflictSet]);
    for (const p of [...paths].sort()) {
      if (conflictSet.has(p)) {
        unstaged.push({ path: p, kind: "conflict" });
        continue;
      }

      const hasW = Object.prototype.hasOwnProperty.call(work, p);
      const w = hasW ? String(work[p] ?? "") : null;

      const iOid = idx[p]?.oid || null;
      const iText = iOid ? (readBlobText(repo, iOid) ?? "") : null;

      if (w !== null && !iOid) {
        unstaged.push({ path: p, kind: "new" });
        continue;
      }
      if (w === null && iOid) {
        unstaged.push({ path: p, kind: "deleted" });
        continue;
      }
      if (w !== null && iOid) {
        if (w !== iText) unstaged.push({ path: p, kind: "modified" });
      }
    }
  }

  return { staged, unstaged };
}

// Checkout policy (toy-friendly):
// - If target is a branch name: move HEAD to that ref.
// - Else detach at commit oid.
// - Update BOTH index and working to the checked-out snapshot.
export function checkout(repo, target) {
  const t = String(target || "").trim();
  if (!t) return { ok: false, error: "checkout: missing target" };

  const branchRef = `refs/heads/${t}`;
  const isBranch =
    repo.refs && Object.prototype.hasOwnProperty.call(repo.refs, branchRef);

  const commitOid = isBranch ? repo.refs[branchRef] : resolveTargetToCommitOid(repo, t);
  if (isBranch && !commitOid) {
    // empty branch allowed (no commits yet)
    setHEADToRef(repo, branchRef);
    repo.index = {};
    repo.working = {};
    return { ok: true, head: null, tree: null, mode: "branch-empty" };
  }
  if (!commitOid) return { ok: false, error: `checkout: cannot resolve "${t}"` };

  if (isBranch) setHEADToRef(repo, branchRef);
  else setHEADDetached(repo, commitOid);

  const c = readCommit(repo, commitOid);
  const treeOid = c?.tree || null;

  repo.index = snapshotMapFromTree(repo, treeOid);
  repo.working = snapshotTextFromTree(repo, treeOid);

  return { ok: true, head: commitOid, tree: treeOid, mode: isBranch ? "branch" : "detached" };
}

export function status(repo) {
  const headTree = getHeadTreeOid(repo);
  const headSnap = snapshotMapFromTree(repo, headTree);

  const work = repo.working || {};
  const idx = repo.index || {};

  const paths = new Set([
    ...Object.keys(headSnap),
    ...Object.keys(idx),
    ...Object.keys(work),
  ]);

  const res = [];
  for (const p of [...paths].sort()) {
    const headOid = headSnap[p]?.oid || null;
    const idxOid = idx[p]?.oid || null;

    let workVsHead = "—";
    if (headOid) {
      const headText = readBlobText(repo, headOid) ?? "";
      const workText = work[p] ?? null;
      workVsHead =
        workText === null ? "deleted" : workText === headText ? "same" : "modified";
    } else {
      workVsHead = work[p] == null ? "—" : "new";
    }

    let idxVsHead = "—";
    if (headOid || idxOid) {
      if (!idxOid && headOid) idxVsHead = "unstaged";
      else if (idxOid && !headOid) idxVsHead = "added";
      else idxVsHead = idxOid === headOid ? "same" : "staged";
    }

    res.push({ path: p, work: workVsHead, index: idxVsHead });
  }
  return res;
}

export function listBranches(repo) {
  const refs = repo.refs || {};
  return Object.keys(refs)
    .filter((k) => k.startsWith("refs/heads/"))
    .map((k) => ({ name: k.replace("refs/heads/", ""), oid: refs[k] }));
}

export function deleteBranch(repo, name) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "branch: missing name" };
  const ref = `refs/heads/${n}`;
  if (!(repo.refs && ref in repo.refs)) return { ok: false, error: `branch: not found (${n})` };
  const current = repo.head?.kind === "ref" ? repo.head.value : null;
  if (current === ref) return { ok: false, error: `branch: cannot delete the branch you're on ('${n}')` };
  delete repo.refs[ref];
  return { ok: true };
}

// Force-create or force-move a branch ref to an arbitrary target (defaults
// to current HEAD, like a normal 'branch', but overwrites if it exists).
// This is what lets you fix a branch that was accidentally created from the
// wrong commit, without deleting and losing any commits already made on it.
export function forceBranch(repo, name, targetOid) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "branch: missing name" };
  const ref = `refs/heads/${n}`;
  const oid = targetOid !== undefined ? targetOid : resolveHEAD(repo);
  repo.refs[ref] = oid;
  return { ok: true, ref, oid };
}

export function createBranch(repo, name) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "branch: missing name" };
  const ref = `refs/heads/${n}`;
  if (repo.refs?.[ref] !== undefined) return { ok: false, error: `branch: exists (${n})` };

  repo.refs[ref] = resolveHEAD(repo); // may be null
  return { ok: true, ref, oid: repo.refs[ref] };
}
