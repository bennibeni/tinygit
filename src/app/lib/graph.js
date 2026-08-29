// src/lib/tinygit/graph.js
import { readCommit } from "./readers";
import { resolveHEAD } from "./plumbing";
import { listBranches, listTags } from "./porcelain";

// Builds a small DAG description suitable for a top-to-bottom SVG render:
// - nodes: [{ oid, parents:[...], firstLine, row, lane }]
// - lanes: [{ lane, color }]
// - branchTips: [{ name, oid, lane }]
// - tagTips: [{ name, oid }]  (tags never move, so no lane of their own)
// - headOid
export function buildGraph(repo) {
  const branches = listBranches(repo);
  const tags = listTags(repo);
  const headOid = resolveHEAD(repo);

  // 1) Collect every commit reachable from any branch tip OR tag.
  const nodesByOid = new Map();
  const queue = [];
  for (const b of branches) if (b.oid) queue.push(b.oid);
  for (const t of tags) if (t.oid) queue.push(t.oid);

  while (queue.length) {
    const oid = queue.shift();
    if (!oid || nodesByOid.has(oid)) continue;
    const c = readCommit(repo, oid);
    if (!c) continue;
    nodesByOid.set(oid, {
      oid,
      parents: c.parents || [],
      firstLine: (c.message || "").split("\n")[0] || "(senza messaggio)",
    });
    for (const p of c.parents || []) queue.push(p);
  }

  // 2) Topological row assignment: row = 1 + max(row of children) walking
  // from tips downward (tips at row 0, older commits get larger rows).
  const rowOf = new Map();
  function assignRow(oid, minRow) {
    const cur = rowOf.get(oid);
    if (cur !== undefined && cur >= minRow) return;
    rowOf.set(oid, minRow);
    const n = nodesByOid.get(oid);
    for (const p of n?.parents || []) assignRow(p, minRow + 1);
  }
  for (const b of branches) if (b.oid) assignRow(b.oid, 0);
  for (const t of tags) if (t.oid) assignRow(t.oid, 0);

  // 2b) Which branches can reach each commit (i.e. the commit is on that
  // branch's history) — this is what a hover/tooltip should tell you, since
  // repeating the commit message there adds nothing new.
  function ancestorsOf(startOid) {
    const seen = new Set();
    const stack = [startOid];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);
      const n = nodesByOid.get(cur);
      for (const p of n?.parents || []) stack.push(p);
    }
    return seen;
  }
  const branchAncestorSets = branches
    .filter((b) => b.oid)
    .map((b) => ({ name: b.name, set: ancestorsOf(b.oid) }));

  function branchesContaining(oid) {
    return branchAncestorSets.filter((b) => b.set.has(oid)).map((b) => b.name);
  }

  // 3) Lane assignment: walk each branch tip's first-parent chain, giving it
  // a lane number; second parents (merge sources) reuse an existing lane if
  // already assigned, otherwise get a fresh one. Simple, readable, not a
  // byte-perfect git-log --graph clone.
  const laneOf = new Map();
  let nextLane = 0;
  const sortedBranches = [...branches].sort((a, b) =>
    a.name === "main" ? -1 : b.name === "main" ? 1 : a.name.localeCompare(b.name)
  );

  function walkFirstParent(oid, lane) {
    let cur = oid;
    while (cur && !laneOf.has(cur)) {
      laneOf.set(cur, lane);
      const n = nodesByOid.get(cur);
      const parents = n?.parents || [];
      // Assign other parents (merge sources) their own lane, recursively.
      for (let i = 1; i < parents.length; i++) {
        if (!laneOf.has(parents[i])) walkFirstParent(parents[i], nextLane++);
      }
      cur = parents[0];
    }
  }

  for (const b of sortedBranches) {
    if (!b.oid || laneOf.has(b.oid)) continue;
    walkFirstParent(b.oid, nextLane++);
  }

  const nodes = [...nodesByOid.values()]
    .map((n) => ({
      ...n,
      generation: rowOf.get(n.oid) ?? 0,
      lane: laneOf.get(n.oid) ?? 0,
      branches: branchesContaining(n.oid),
    }))
    .sort((a, b) => a.generation - b.generation || a.lane - b.lane)
    // Give every node its own row: two commits can share a "generation"
    // (siblings on different branches) but must never share a row, or their
    // labels would land exactly on top of each other.
    .map((n, i) => ({ ...n, row: i }));

  const branchTips = branches
    .filter((b) => b.oid)
    .map((b) => ({ name: b.name, oid: b.oid, lane: laneOf.get(b.oid) ?? 0 }));

  const tagTips = tags.filter((t) => t.oid).map((t) => ({ name: t.name, oid: t.oid }));

  return { nodes, branchTips, tagTips, headOid, laneCount: nextLane };
}
