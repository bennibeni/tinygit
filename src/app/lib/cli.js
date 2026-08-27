// src/lib/tinygit/cli.js
import { commitIndex, logLinear, resolveHEAD } from "./plumbing";
import { readBlobText, listTreeRecursive } from "./readers";
import {
  checkout,
  createBranch,
  deleteBranch,
  forceBranch,
  listBranches,
  resolveTargetToCommitOid,
  status,
  getHeadTreeOid,
  stageAll,
  stagePath,
  unstageAll,
  unstagePath,
  restoreAll,
  restorePath,
} from "./porcelain";
import { merge, abortMerge, completeMerge, mergeInProgress } from "./merge";
import { buildGraph } from "./graph";

function splitArgs(line) {
  const s = String(line || "").trim();
  const out = [];
  let cur = "";
  let q = null;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === "\\") {
        if (i + 1 < s.length) cur += s[++i];
      } else cur += ch;
    } else {
      if (ch === "'" || ch === '"') q = ch;
      else if (/\s/.test(ch)) {
        if (cur) out.push(cur), (cur = "");
      } else cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function lines(...xs) {
  return xs.flat().filter(Boolean).map(String);
}

export async function runCommand(repo, line) {
  const rawArgs = splitArgs(line);
  // Be forgiving if someone types real-Git-style syntax like "git status":
  // this toy CLI's commands ARE the git subcommands, so just drop the prefix.
  const args = (rawArgs[0] || "").toLowerCase() === "git" ? rawArgs.slice(1) : rawArgs;
  const cmd = (args[0] || "").toLowerCase();
  const rest = args.slice(1);

  if (!cmd) return { ok: true, out: [] };

  if (cmd === "help") {
    return {
      ok: true,
      out: lines(
        "Commands (puoi anche scrivere 'git <comando>', il prefisso viene ignorato):",
        "  help",
        "  init",
        "  write <path> <text...>        # write working file",
        "  rm <path>                    # remove working file",
        "  add <path>                   # stage from working (or stage deletion)",
        "  add -A                       # stage all (incl. deletions)",
        "  unstage <path>               # reset staged file to HEAD",
        "  unstage -A                   # reset entire index to HEAD",
        "  restore <path>               # restore working from index (or HEAD)",
        "  restore -A                   # restore working from index",
        "  commit -m <msg>",
        "  status                        # shows 'On branch <x>' + work/index diffs",
        "  log [n]",
        "  log --graph                   # grafo ASCII con corsie e branch, come git vero",
        "  branch [name]                 # create branch / list (current marked with *)",
        "  branch -f <name> [target]     # force-create/move a branch to HEAD or <target>",
        "  branch -d <name>              # delete a branch (not the one you're on)",
        "  checkout <branch|oid>",
        "  merge <branch>                # merge branch into current HEAD",
        "  merge --abort                 # cancel a conflicted merge in progress",
        "  ls [head|index|work]         # list files",
        "  cat <path>                   # show working file",
        "  cat head:<path>              # show file at HEAD",
        "  cat index:<path>             # show staged content",
        "  clear                        # UI clears output"
      ),
    };
  }

  if (cmd === "init") {
    repo.objects = {};
    repo.refs = { "refs/heads/main": null };
    repo.head = { kind: "ref", value: "refs/heads/main" };
    repo.index = {};
    repo.working = {};
    return { ok: true, out: ["repo initialized"] };
  }

  if (cmd === "write") {
    const path = rest[0];
    const text = rest.slice(1).join(" ");
    if (!path) return { ok: false, out: ["write: missing path"] };
    repo.working[path] = text;
    return { ok: true, out: [`wrote work:${path} (${text.length} chars)`] };
  }

  if (cmd === "rm") {
    const path = rest[0];
    if (!path) return { ok: false, out: ["rm: missing path"] };
    delete repo.working[path];
    return { ok: true, out: [`removed work:${path}`] };
  }

  if (cmd === "add") {
    const arg = rest[0];
    if (!arg) return { ok: false, out: ["add: missing path (or use: add -A)"] };

    const isAll = arg === "-A" || arg === "-a" || arg === "--all";
    if (isAll) {
      const r = await stageAll(repo);
      const parts = [];
      parts.push(`staged ${r.files} file(s)`);
      if (r.deletions) parts.push(`${r.deletions} deletion(s)`);
      return { ok: true, out: [parts.join(", ")] };
    }

    const r = await stagePath(repo, arg);
    if (!r.ok) return { ok: false, out: [r.error] };
    return {
      ok: true,
      out: [r.mode === "delete" ? `staged deletion ${arg}` : `staged ${arg}`],
    };
  }

  if (cmd === "unstage") {
    const arg = rest[0];
    if (!arg) return { ok: false, out: ["unstage: missing path (or use: unstage -A)"] };
    const isAll = arg === "-A" || arg === "-a" || arg === "--all";
    if (isAll) {
      unstageAll(repo);
      return { ok: true, out: ["unstaged all (index reset to HEAD)"] };
    }
    const r = unstagePath(repo, arg);
    return { ok: r.ok, out: [r.ok ? `unstaged ${arg}` : r.error] };
  }

  if (cmd === "restore") {
    const arg = rest[0];
    if (!arg) return { ok: false, out: ["restore: missing path (or use: restore -A)"] };
    const isAll = arg === "-A" || arg === "-a" || arg === "--all";
    if (isAll) {
      restoreAll(repo, { from: "index" });
      return { ok: true, out: ["restored working tree from index"] };
    }
    const r = restorePath(repo, arg, { from: "index" });
    return { ok: r.ok, out: [r.ok ? `restored ${arg}` : r.error] };
  }

  if (cmd === "commit") {
    const mi = rest.indexOf("-m");
    const message = mi >= 0 ? rest.slice(mi + 1).join(" ") : "";
    if (!message) return { ok: false, out: ["commit: use -m <msg>"] };

    if (mergeInProgress(repo)) {
      const r = await completeMerge(repo, { message });
      if (!r.ok) return { ok: false, out: [r.error] };
      return { ok: true, out: [`merge commit ${r.commitOid.slice(0, 7)} (2 genitori) tree ${r.treeOid.slice(0, 7)}`] };
    }

    const { commitOid, treeOid } = await commitIndex(repo, { message });
    return { ok: true, out: [`commit ${commitOid.slice(0, 7)} tree ${treeOid.slice(0, 7)}`] };
  }

  if (cmd === "status") {
    const branchLine =
      repo.head?.kind === "ref"
        ? `On branch ${repo.head.value.replace("refs/heads/", "")}`
        : `HEAD detached at ${(resolveHEAD(repo) || "").slice(0, 7)}`;
    const rows = status(repo);
    const out = rows.map((r) => `${r.path}  work:${r.work}  index:${r.index}`);
    return { ok: true, out: [branchLine, ...(out.length ? out : ["(clean)"])] };
  }

  if (cmd === "log") {
    if (rest.includes("--graph")) {
      const g = buildGraph(repo);
      if (!g.nodes.length) return { ok: true, out: ["(no commits)"] };

      // Which lanes have a vertical line still "open" at a given row: any
      // lane with at least one node above (or at) and one at/below this row.
      const laneRange = new Map();
      for (const n of g.nodes) {
        const cur = laneRange.get(n.lane);
        if (!cur) laneRange.set(n.lane, [n.row, n.row]);
        else laneRange.set(n.lane, [Math.min(cur[0], n.row), Math.max(cur[1], n.row)]);
      }
      const maxLane = Math.max(0, ...g.nodes.map((n) => n.lane));

      const lines = g.nodes.map((n) => {
        let rail = "";
        for (let l = 0; l <= maxLane; l++) {
          if (l === n.lane) {
            rail += "*";
            continue;
          }
          const range = laneRange.get(l);
          rail += range && range[0] <= n.row && n.row <= range[1] ? "|" : " ";
        }
        const tipNames = g.branchTips.filter((b) => b.oid === n.oid).map((b) => b.name);
        const decoParts = [];
        if (n.oid === g.headOid) decoParts.push("HEAD");
        decoParts.push(...tipNames);
        const deco = decoParts.length ? ` (${decoParts.join(", ")})` : "";
        return `${rail}  ${n.oid.slice(0, 7)}${deco} ${n.firstLine}`;
      });
      return { ok: true, out: lines };
    }

    const n = Math.max(1, Math.trunc(Number(rest[0] || 10)) || 10);
    const head = resolveHEAD(repo);
    if (!head) return { ok: true, out: ["(no commits)"] };
    const items = logLinear(repo, head, n);
    return { ok: true, out: items.map((c) => `${c.oid.slice(0, 7)}\n${c.text}`) };
  }

  if (cmd === "branch") {
    if (rest[0] === "-d" || rest[0] === "-D") {
      const name = rest[1];
      const r = deleteBranch(repo, name);
      return { ok: r.ok, out: [r.ok ? `deleted ${name}` : r.error] };
    }
    if (rest[0] === "-f") {
      const name = rest[1];
      const targetArg = rest[2];
      const targetOid = targetArg ? resolveTargetToCommitOid(repo, targetArg) : resolveHEAD(repo);
      if (targetArg && !targetOid) return { ok: false, out: [`branch: cannot resolve "${targetArg}"`] };
      const r = forceBranch(repo, name, targetOid);
      return { ok: r.ok, out: [r.ok ? `${name} -> ${r.oid ? r.oid.slice(0, 7) : "(empty)"}` : r.error] };
    }
    const name = rest[0];
    if (!name) {
      const current = repo.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;
      const names = listBranches(repo).map((b) => (b.name === current ? `* ${b.name}` : `  ${b.name}`));
      return { ok: true, out: names.length ? names : ["(no branches)"] };
    }
    const r = createBranch(repo, name);
    return { ok: r.ok, out: [r.ok ? `created ${name}` : r.error] };
  }

  if (cmd === "merge") {
    if (rest[0] === "--abort") {
      const r = abortMerge(repo);
      return { ok: r.ok, out: [r.ok ? "merge annullato" : r.error] };
    }
    const target = rest[0];
    if (!target) return { ok: false, out: ["merge: manca il nome del branch (o 'merge --abort')"] };
    const r = await merge(repo, target);
    return { ok: r.ok, out: r.out || [] };
  }

  if (cmd === "checkout") {
    if (mergeInProgress(repo)) {
      return { ok: false, out: ["checkout: c'è un merge in conflitto in corso, risolvilo o usa 'merge --abort'"] };
    }
    const target = rest[0];
    const r = checkout(repo, target);
    return { ok: r.ok, out: [r.ok ? `checked out ${target}` : r.error] };
  }

  if (cmd === "ls") {
    const area = (rest[0] || "head").toLowerCase();
    if (area === "work") {
      const paths = Object.keys(repo.working || {}).sort();
      return { ok: true, out: paths.length ? paths : ["(empty)"] };
    }
    if (area === "index") {
      const paths = Object.keys(repo.index || {}).sort();
      return { ok: true, out: paths.length ? paths : ["(empty)"] };
    }

    const treeOid = getHeadTreeOid(repo);
    if (!treeOid) return { ok: true, out: ["(no HEAD tree)"] };
    const items = listTreeRecursive(repo, treeOid).filter((x) => x.kind === "blob");
    return { ok: true, out: items.map((x) => x.path) };
  }

  if (cmd === "cat") {
    const spec = rest[0];
    if (!spec) return { ok: false, out: ["cat: missing path"] };

    const m = spec.match(/^(head|work|index):(.*)$/);
    const area = m ? m[1] : "work";
    const path = m ? m[2] : spec;

    if (area === "work") {
      const t = repo.working?.[path];
      return { ok: true, out: [t == null ? "(missing)" : t] };
    }

    if (area === "index") {
      const oid = repo.index?.[path]?.oid;
      if (!oid) return { ok: true, out: ["(not staged)"] };
      return { ok: true, out: [readBlobText(repo, oid) ?? "(binary/empty)"] };
    }

    // head:
    const treeOid = getHeadTreeOid(repo);
    if (!treeOid) return { ok: true, out: ["(no HEAD)"] };
    const items = listTreeRecursive(repo, treeOid);
    const hit = items.find((x) => x.kind === "blob" && x.path === path);
    if (!hit) return { ok: true, out: ["(missing in HEAD)"] };
    return { ok: true, out: [readBlobText(repo, hit.oid) ?? "(binary/empty)"] };
  }

  if (cmd === "clear") {
    return { ok: true, out: ["__CLEAR__"] };
  }

  return { ok: false, out: [`unknown command: ${cmd} (try 'help')`] };
}
