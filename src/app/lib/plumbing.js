// src/lib/tinygit/plumbing.js
import { sha1Hex } from "./sha1";
import {
  concatBytes,
  hexToBytes,
  utf8ToBytes,
  bytesToUtf8,
} from "./codec";
import { putObject, getObject, hasObject } from "./store";

// Git-style: hash over "<type> <size>\0" + contentBytes
async function hashObject(type, contentBytes) {
  const header = utf8ToBytes(`${type} ${contentBytes.length}\0`);
  return sha1Hex(concatBytes(header, contentBytes));
}

export async function writeBlob(repo, textOrBytes) {
  const content =
    textOrBytes instanceof Uint8Array
      ? textOrBytes
      : utf8ToBytes(String(textOrBytes ?? ""));
  const oid = await hashObject("blob", content);
  if (!hasObject(repo, oid)) putObject(repo, oid, "blob", content);
  return oid;
}

// Tree entry: "<mode> <name>\0<20-byte oid>"
function serializeTree(entries) {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const chunks = [];
  for (const e of sorted) {
    const head = utf8ToBytes(`${e.mode} ${e.name}\0`);
    const oid20 = hexToBytes(e.oid); // 20 bytes for sha1 -> 40 hex chars
    chunks.push(head, oid20);
  }
  return concatBytes(...chunks);
}

export async function writeTreeFromIndex(repo, indexMap) {
  // indexMap: { [path]: {mode, oid} } where path may include "/"
  // We'll build a hierarchical tree (dirs) then serialize to tree objects bottom-up.

  const root = {}; // nested: { name: {__entry?} | subtree }
  for (const [path, rec] of Object.entries(indexMap || {})) {
    const parts = path.split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const isLeaf = i === parts.length - 1;
      if (!cur[p]) cur[p] = {};
      if (isLeaf) {
        cur[p].__entry = { mode: rec.mode ?? 100644, name: p, oid: rec.oid };
      }
      cur = cur[p];
    }
  }

  async function writeTreeNode(node) {
    const entries = [];
    for (const [name, child] of Object.entries(node)) {
      if (name === "__entry") continue;

      if (child.__entry) {
        entries.push(child.__entry);
      } else {
        const childTreeOid = await writeTreeNode(child);
        entries.push({ mode: 40000, name, oid: childTreeOid });
      }
    }

    const content = serializeTree(entries);
    const oid = await hashObject("tree", content);
    if (!hasObject(repo, oid)) putObject(repo, oid, "tree", content);
    return oid;
  }

  return writeTreeNode(root);
}

function serializeCommit({ treeOid, parents, author, committer, message }) {
  const lines = [];
  lines.push(`tree ${treeOid}`);
  for (const p of parents || []) lines.push(`parent ${p}`);
  lines.push(`author ${author}`);
  lines.push(`committer ${committer}`);
  lines.push(""); // blank line
  lines.push(message || "");
  return utf8ToBytes(lines.join("\n"));
}

export async function writeCommit(repo, { treeOid, parents, author, committer, message }) {
  const content = serializeCommit({ treeOid, parents, author, committer, message });
  const oid = await hashObject("commit", content);
  if (!hasObject(repo, oid)) putObject(repo, oid, "commit", content);
  return oid;
}

// --- refs / HEAD ---

export function resolveHEAD(repo) {
  if (repo.head.kind === "detached") return repo.head.value || null;
  const ref = repo.head.value;
  return repo.refs?.[ref] || null;
}

export function updateRef(repo, refName, oid) {
  repo.refs[refName] = oid;
}

export function setHEADToRef(repo, refName) {
  repo.head = { kind: "ref", value: refName };
}

export function setHEADDetached(repo, oid) {
  repo.head = { kind: "detached", value: oid };
}

export function getCommit(repo, oid) {
  const obj = getObject(repo, oid);
  if (!obj || obj.type !== "commit") return null;
  return { oid, text: bytesToUtf8(obj.content) };
}

export function getBlobText(repo, oid) {
  const obj = getObject(repo, oid);
  if (!obj || obj.type !== "blob") return null;
  return bytesToUtf8(obj.content);
}

// High-level porcelain: stage + commit
export async function stageTextFile(repo, path, text) {
  const oid = await writeBlob(repo, text);
  repo.index[path] = { mode: 100644, oid };
  return oid;
}

export async function commitIndex(repo, { message, author }) {
  const parent = resolveHEAD(repo);
  const parents = parent ? [parent] : [];
  const treeOid = await writeTreeFromIndex(repo, repo.index);

  const who = author || "You <you@example.com> 0 +0000"; // toy format
  const commitOid = await writeCommit(repo, {
    treeOid,
    parents,
    author: who,
    committer: who,
    message: message || "",
  });

  if (repo.head.kind === "ref") {
    updateRef(repo, repo.head.value, commitOid);
  } else {
    setHEADDetached(repo, commitOid);
  }
  return { commitOid, treeOid };
}

// Log: walk parents linearly (no merges UI yet)
export function logLinear(repo, startOid, limit = 50) {
  const out = [];
  let cur = startOid;
  for (let i = 0; i < limit && cur; i++) {
    const c = getCommit(repo, cur);
    if (!c) break;
    out.push(c);
    const m = c.text.match(/^parent ([0-9a-f]{40})/m);
    cur = m ? m[1] : null;
  }
  return out;
}
