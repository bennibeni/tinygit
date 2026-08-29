// src/lib/tinygit/history.js
import { readCommit } from "./readers";
import { writeBlob, writeTreeFromIndex, writeCommit, resolveHEAD, updateRef, setHEADDetached } from "./plumbing";
import { snapshotTextFromTree, getHeadTreeOid, getAuthorString } from "./porcelain";

// Shared core for revert/cherry-pick: both take "what changed between a
// commit and its first parent" and re-apply it (forward for cherry-pick,
// backward for revert) onto the CURRENT HEAD. File-level, like the rest of
// TinyGit's merge engine — not a line-by-line patch. If the current HEAD has
// diverged from the commit's own base for a given file, this simply
// overwrites that file with the target state; a real Git would sometimes
// conflict here, but this keeps behavior predictable and easy to reason
// about for a teaching tool.
async function applyCommitDiff(repo, targetOid, { invert, buildMessage }) {
  const c = readCommit(repo, targetOid);
  if (!c) return { ok: false, error: "not a valid commit" };

  const parentOid = c.parents?.[0] || null;
  const commitFiles = snapshotTextFromTree(repo, c.tree);
  const parentFiles = parentOid ? snapshotTextFromTree(repo, readCommit(repo, parentOid)?.tree) : {};

  const headOid = resolveHEAD(repo);
  if (!headOid) return { ok: false, error: "HEAD has no commits yet" };
  const headFiles = snapshotTextFromTree(repo, getHeadTreeOid(repo));

  const before = invert ? commitFiles : parentFiles; // "from" state of the change
  const after = invert ? parentFiles : commitFiles; // "to" state of the change

  const touched = new Set([...Object.keys(commitFiles), ...Object.keys(parentFiles)]);
  const nextWorking = { ...headFiles };

  for (const p of touched) {
    const fromText = Object.prototype.hasOwnProperty.call(before, p) ? before[p] : null;
    const toText = Object.prototype.hasOwnProperty.call(after, p) ? after[p] : null;
    if (fromText === toText) continue; // this commit didn't actually touch it
    if (toText === null) delete nextWorking[p];
    else nextWorking[p] = toText;
  }

  repo.working = nextWorking;
  const newIndex = {};
  for (const [p, text] of Object.entries(nextWorking)) {
    newIndex[p] = { mode: 100644, oid: await writeBlob(repo, text) };
  }
  repo.index = newIndex;

  const treeOid = await writeTreeFromIndex(repo, repo.index);
  const who = getAuthorString(repo);
  const message = buildMessage(c);
  const commitOid = await writeCommit(repo, { treeOid, parents: [headOid], author: who, committer: who, message });

  if (repo.head.kind === "ref") updateRef(repo, repo.head.value, commitOid);
  else setHEADDetached(repo, commitOid);

  return { ok: true, commitOid };
}

export async function revertCommit(repo, targetOid) {
  return applyCommitDiff(repo, targetOid, {
    invert: true,
    buildMessage: (c) => `Revert "${(c.message || "").split("\n")[0]}"`,
  });
}

export async function cherryPickCommit(repo, targetOid) {
  return applyCommitDiff(repo, targetOid, {
    invert: false,
    buildMessage: (c) => c.message || "",
  });
}
