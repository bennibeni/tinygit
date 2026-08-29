// src/lib/tinygit/porcelain.js
import {
  resolveHEAD,
  setHEADDetached,
  setHEADToRef,
  updateRef,
  stageTextFile,
} from "./plumbing";
import { readCommit, listTreeRecursive, readBlobText } from "./readers";

function resolveBaseRef(repo, target) {
  const t = String(target || "").trim();
  if (!t) return null;

  if (t.toUpperCase() === "HEAD") return resolveHEAD(repo);

  // branch name shorthand
  if (repo.refs?.[`refs/heads/${t}`]) return repo.refs[`refs/heads/${t}`];
  if (repo.refs?.[`refs/tags/${t}`]) return repo.refs[`refs/tags/${t}`];
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

// Resolves a Git target expression, including trailing ~N / ^N (chainable,
// like "HEAD~2^" or "main^^"): ~N walks N generations via the first parent,
// ^N jumps to the N-th parent of a merge commit (1-indexed).
export function resolveTargetToCommitOid(repo, target) {
  const raw = String(target || "").trim();
  if (!raw) return null;

  const m = raw.match(/^(.*?)((?:[~^]\d*)+)$/);
  const base = m ? m[1] : raw;
  const suffix = m ? m[2] : "";

  let oid = resolveBaseRef(repo, base);
  if (!oid) return null;
  if (!base) return null; // e.g. a target that's ONLY "~2" with no base makes no sense here

  if (suffix) {
    const tokens = suffix.match(/[~^]\d*/g) || [];
    for (const tok of tokens) {
      const kind = tok[0];
      const n = tok.length > 1 ? parseInt(tok.slice(1), 10) : 1;
      const c = readCommit(repo, oid);
      if (!c) return null;
      if (kind === "~") {
        let cur = oid;
        for (let i = 0; i < n; i++) {
          const cc = readCommit(repo, cur);
          if (!cc || !cc.parents?.length) return null;
          cur = cc.parents[0];
        }
        oid = cur;
      } else {
        const idx = n - 1;
        if (!c.parents || !c.parents[idx]) return null;
        oid = c.parents[idx];
      }
    }
  }
  return oid;
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
  const conflictSet = new Set(repo.mergeState?.conflicts || []);

  const paths = new Set([
    ...Object.keys(headSnap),
    ...Object.keys(idx),
    ...Object.keys(work),
    ...conflictSet,
  ]);

  const res = [];
  for (const p of [...paths].sort()) {
    if (conflictSet.has(p)) {
      res.push({ path: p, work: "conflict", index: "unmerged" });
      continue;
    }

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

// --- user identity (like a tiny per-repo 'git config') ---

export function setConfig(repo, key, value) {
  repo.config = repo.config || {};
  if (key === "user.name") repo.config.userName = value;
  else if (key === "user.email") repo.config.userEmail = value;
  else return { ok: false, error: `config: unsupported key "${key}" (only user.name / user.email)` };
  return { ok: true };
}

export function getConfigValue(repo, key) {
  if (key === "user.name") return repo.config?.userName || null;
  if (key === "user.email") return repo.config?.userEmail || null;
  return null;
}

export function getAuthorString(repo) {
  const name = repo.config?.userName || "You";
  const email = repo.config?.userEmail || "you@example.com";
  return `${name} <${email}> 0 +0000`;
}

// --- tags: fixed labels on a commit, unlike branches they never move ---

export function listTags(repo) {
  const refs = repo.refs || {};
  return Object.keys(refs)
    .filter((k) => k.startsWith("refs/tags/"))
    .map((k) => ({ name: k.replace("refs/tags/", ""), oid: refs[k] }));
}

export function createTag(repo, name, targetOid) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "tag: missing name" };
  const ref = `refs/tags/${n}`;
  if (repo.refs && ref in repo.refs) return { ok: false, error: `tag: already exists (${n})` };
  const oid = targetOid !== undefined ? targetOid : resolveHEAD(repo);
  if (!oid) return { ok: false, error: "tag: no commit to tag (HEAD is empty)" };
  repo.refs[ref] = oid;
  return { ok: true, oid };
}

export function deleteTag(repo, name) {
  const ref = `refs/tags/${name}`;
  if (!(repo.refs && ref in repo.refs)) return { ok: false, error: `tag: not found (${name})` };
  delete repo.refs[ref];
  return { ok: true };
}

// --- rename a tracked file (working tree + index, in one step) ---

export function movePath(repo, oldPath, newPath) {
  const o = String(oldPath || "").trim();
  const n = String(newPath || "").trim();
  if (!o || !n) return { ok: false, error: "mv: usage: mv <old> <new>" };

  const hasWork = Object.prototype.hasOwnProperty.call(repo.working || {}, o);
  const idxEntry = repo.index?.[o];
  if (!hasWork && !idxEntry) return { ok: false, error: `mv: not found: ${o}` };

  if (hasWork) {
    repo.working[n] = repo.working[o];
    delete repo.working[o];
  }
  if (idxEntry) {
    repo.index[n] = idxEntry;
    delete repo.index[o];
  }
  return { ok: true };
}

// --- untracked files: present in working, never staged, never committed ---

export function listUntracked(repo) {
  const headTree = getHeadTreeOid(repo);
  const headPaths = new Set(
    (headTree ? listTreeRecursive(repo, headTree) : []).filter((f) => f.kind === "blob").map((f) => f.path),
  );
  const idxPaths = new Set(Object.keys(repo.index || {}));
  return Object.keys(repo.working || {}).filter((p) => !headPaths.has(p) && !idxPaths.has(p));
}

export function cleanUntracked(repo) {
  const paths = listUntracked(repo);
  for (const p of paths) delete repo.working[p];
  return paths;
}

// --- reset: move the current branch (or detached HEAD) to another commit ---

export function reset(repo, targetOid, mode = "mixed") {
  if (!targetOid) return { ok: false, error: "reset: cannot resolve target" };
  const c = readCommit(repo, targetOid);
  if (!c) return { ok: false, error: "reset: target is not a commit" };
  const treeOid = c.tree;

  if (repo.head.kind === "ref") repo.refs[repo.head.value] = targetOid;
  else repo.head.value = targetOid;

  if (mode === "soft") {
    // index and working tree untouched
  } else if (mode === "mixed") {
    repo.index = snapshotMapFromTree(repo, treeOid);
  } else if (mode === "hard") {
    repo.index = snapshotMapFromTree(repo, treeOid);
    repo.working = snapshotTextFromTree(repo, treeOid);
  } else {
    return { ok: false, error: `reset: unknown mode "${mode}"` };
  }
  return { ok: true, oid: targetOid };
}

