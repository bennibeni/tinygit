// src/lib/tinygit/readers.js
import { getObject } from "./store";
import { bytesToUtf8 } from "./codec";

export function parseCommitText(text) {
  const s = String(text || "");
  const [head, ...rest] = s.split("\n\n"); // first blank line splits headers/message
  const headers = head.split("\n");
  const out = {
    tree: null,
    parents: [],
    author: null,
    committer: null,
    message: rest.join("\n\n") || "",
  };

  for (const line of headers) {
    if (line.startsWith("tree ")) out.tree = line.slice(5).trim();
    else if (line.startsWith("parent ")) out.parents.push(line.slice(7).trim());
    else if (line.startsWith("author ")) out.author = line.slice(7);
    else if (line.startsWith("committer ")) out.committer = line.slice(10);
  }
  return out;
}

export function readCommit(repo, oid) {
  const obj = getObject(repo, oid);
  if (!obj || obj.type !== "commit") return null;
  const text = bytesToUtf8(obj.content);
  return { oid, text, ...parseCommitText(text) };
}

// Parse Git-ish tree content: repeated "<mode> <name>\0<20-byte oid>"
export function readTreeEntries(repo, treeOid) {
  const obj = getObject(repo, treeOid);
  if (!obj || obj.type !== "tree") return null;

  const buf = obj.content;
  const entries = [];
  let i = 0;

  while (i < buf.length) {
    // mode until space
    let j = i;
    while (j < buf.length && buf[j] !== 0x20) j++;
    const modeStr = new TextDecoder().decode(buf.slice(i, j));
    const mode = parseInt(modeStr, 10);
    j++; // skip space

    // name until \0
    let k = j;
    while (k < buf.length && buf[k] !== 0x00) k++;
    const name = new TextDecoder().decode(buf.slice(j, k));
    k++; // skip \0

    // next 20 bytes = oid
    const oidBytes = buf.slice(k, k + 20);
    const oid = [...oidBytes]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    k += 20;

    entries.push({ mode, name, oid });
    i = k;
  }

  return entries;
}

export function readBlobText(repo, blobOid) {
  const obj = getObject(repo, blobOid);
  if (!obj || obj.type !== "blob") return null;
  return bytesToUtf8(obj.content);
}

export function listTreeRecursive(repo, treeOid, prefix = "") {
  const entries = readTreeEntries(repo, treeOid);
  if (!entries) return [];

  const out = [];
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.mode === 40000) {
      out.push({ path, kind: "tree", oid: e.oid, mode: e.mode });
      out.push(...listTreeRecursive(repo, e.oid, path));
    } else {
      out.push({ path, kind: "blob", oid: e.oid, mode: e.mode });
    }
  }
  return out;
}
