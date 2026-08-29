// src/lib/tinygit/cli.js
import { commitIndex, logLinear, resolveHEAD, writeBlob, writeTreeFromIndex, writeCommit, updateRef } from "./plumbing";
import { readBlobText, listTreeRecursive, readTreeEntries, readCommit } from "./readers";
import { getObject } from "./store";
import { diffLines } from "./diff";
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
  setConfig,
  getConfigValue,
  getAuthorString,
  listTags,
  createTag,
  deleteTag,
  movePath,
  listUntracked,
  cleanUntracked,
  reset,
} from "./porcelain";
import { merge, abortMerge, completeMerge, mergeInProgress, isAncestor } from "./merge";
import { buildGraph } from "./graph";
import { revertCommit, cherryPickCommit } from "./history";
import { stashSave, stashList, stashPop, stashDrop } from "./stash";

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
        "  restore --staged <path>      # unstage (git-compatible alias for 'unstage')",
        "  commit -m <msg>",
        "  status                        # shows 'On branch <x>' + work/index diffs",
        "  log [n]",
        "  log --graph                   # grafo ASCII con corsie e branch, come git vero",
        "  branch [name]                 # create branch / list (current marked with *)",
        "  branch -v                     # list branches with last commit hash + message",
        "  branch --merged [ref]         # branches already merged into ref (default HEAD)",
        "  branch --no-merged [ref]      # branches NOT yet merged into ref (default HEAD)",
        "  branch -f <name> [target]     # force-create/move a branch to HEAD or <target>",
        "  branch -d <name>              # delete a branch (not the one you're on)",
        "  checkout <branch|oid>",
        "  --- advanced ---",
        "  reset [--soft|--mixed|--hard] [target]   # move HEAD/branch, default mixed, default HEAD",
        "  tag [name] [target]          # create tag / list tags",
        "  tag -d <name>                # delete a tag",
        "  stash [-m <msg>]             # save working+index, reset to HEAD",
        "  stash list / pop [n] / drop [n]",
        "  revert <commit>              # new commit that undoes another commit",
        "  cherry-pick <commit>         # apply another commit's changes here",
        "  mv <old> <new>               # rename a tracked file",
        "  clean -n / -f                # preview / remove untracked files",
        "  config user.name|user.email [value]   # get or set commit identity",
        "  Relative refs work everywhere: HEAD~2, main^, HEAD~1^2 ...",
        "  merge <branch>                # merge branch into current HEAD",
        "  merge --abort                 # cancel a conflicted merge in progress",
        "  ls [head|index|work]         # list files",
        "  cat <path>                   # show working file",
        "  cat head:<path>              # show file at HEAD",
        "  cat index:<path>             # show staged content",
        "  --- real Git plumbing (also work as e.g. 'git cat-file -p HEAD') ---",
        "  rev-parse <ref>              # resolve a branch/HEAD/short-hash to a full oid",
        "  cat-file -p <oid>            # dump a raw object (blob/tree/commit)",
        "  cat-file -t <oid>            # print the object's type",
        "  ls-tree <ref>                # list a tree's direct entries",
        "  diff [--staged] [path]       # working vs index, or index vs HEAD with --staged",
        "  show [ref]                   # commit info + diff vs its first parent",
        "  --- building history by hand, without add/commit at all ---",
        "  hash-object -w --stdin <text>          # write a blob, print its oid",
        "  update-index --add --cacheinfo <mode> <oid> <path>   # stage an entry directly",
        "  write-tree                             # write the index as a tree, print its oid",
        "  commit-tree <tree> [-p <parent>]... -m <msg>   # build a commit object, no ref touched",
        "  update-ref <refs/heads/name> <oid>     # point a ref (branch) at a commit directly",
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
    repo.mergeState = null;
    repo.stashes = []; // stash entries reference objects being wiped, so they'd be meaningless anyway
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
    // git restore --staged <path>  (or --cached) really means "unstage",
    // i.e. reset the index entry back to HEAD while leaving the working
    // tree untouched — the opposite of TinyGit's plain `restore`, which
    // overwrites the working tree FROM the index. Handle the flag before
    // treating the next token as a path, and route accordingly.
    const staged = rest.includes("--staged") || rest.includes("--cached");
    const args = rest.filter((a) => a !== "--staged" && a !== "--cached");
    const arg = args[0];
    if (!arg) return { ok: false, out: ["restore: missing path (or use: restore -A / restore --staged <path>)"] };
    const isAll = arg === "-A" || arg === "-a" || arg === "--all";

    if (staged) {
      if (isAll) {
        unstageAll(repo);
        return { ok: true, out: ["unstaged all (index reset to HEAD)"] };
      }
      const r = unstagePath(repo, arg);
      return { ok: r.ok, out: [r.ok ? `unstaged ${arg}` : r.error] };
    }

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

    const { commitOid, treeOid } = await commitIndex(repo, { message, author: getAuthorString(repo) });
    return { ok: true, out: [`commit ${commitOid.slice(0, 7)} tree ${treeOid.slice(0, 7)}`] };
  }

  if (cmd === "status") {
    const branchLine =
      repo.head?.kind === "ref"
        ? `On branch ${repo.head.value.replace("refs/heads/", "")}`
        : `HEAD detached at ${(resolveHEAD(repo) || "").slice(0, 7)}`;
    const conflictCount = repo.mergeState?.conflicts?.length || 0;
    const mergeLine =
      conflictCount > 0
        ? [`You have unmerged paths (${conflictCount} both modified) — 'add' the resolved files, then 'commit'.`]
        : [];
    const rows = status(repo);
    const out = rows.map((r) => `${r.path}  work:${r.work}  index:${r.index}`);
    return { ok: true, out: [branchLine, ...mergeLine, ...(out.length ? out : ["(clean)"])] };
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
        const tagNames = (g.tagTips || []).filter((t) => t.oid === n.oid).map((t) => `tag: ${t.name}`);
        const decoParts = [];
        if (n.oid === g.headOid) decoParts.push("HEAD");
        decoParts.push(...tipNames, ...tagNames);
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
    if (rest[0] === "--merged" || rest[0] === "--no-merged") {
      const wantMerged = rest[0] === "--merged";
      const targetArg = rest[1];
      const targetOid = targetArg ? resolveTargetToCommitOid(repo, targetArg) : resolveHEAD(repo);
      if (!targetOid) return { ok: false, out: [`branch: cannot resolve "${targetArg || "HEAD"}"`] };
      const current = repo.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;
      const names = listBranches(repo)
        .filter((b) => {
          if (!b.oid) return false;
          const merged = b.oid === targetOid || isAncestor(repo, b.oid, targetOid);
          return wantMerged ? merged : !merged;
        })
        .map((b) => (b.name === current ? `* ${b.name}` : `  ${b.name}`));
      return { ok: true, out: names.length ? names : ["(none)"] };
    }
    if (rest[0] === "-v" || rest[0] === "-vv") {
      const current = repo.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;
      const lines = listBranches(repo).map((b) => {
        const c = b.oid ? readCommit(repo, b.oid) : null;
        const short = b.oid ? b.oid.slice(0, 7) : "???????";
        const msg = c ? (c.message || "").split("\n")[0] : "(vuoto)";
        return `${b.name === current ? "*" : " "} ${b.name.padEnd(20)} ${short} ${msg}`;
      });
      return { ok: true, out: lines.length ? lines : ["(no branches)"] };
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

  // --- "Advanced" commands: reset, tag, stash, revert, cherry-pick, mv,
  // clean, config. None of these are needed for the guided story or the
  // basic workflow — they exist for the Advanced Commands page and for
  // following other guides that use them. ---

  if (cmd === "reset") {
    let mode = "mixed";
    const args = rest.filter((a) => {
      if (a === "--soft") { mode = "soft"; return false; }
      if (a === "--mixed") { mode = "mixed"; return false; }
      if (a === "--hard") { mode = "hard"; return false; }
      return true;
    });
    const targetArg = args[0] || "HEAD";
    const targetOid = resolveTargetToCommitOid(repo, targetArg);
    if (!targetOid) return { ok: false, out: [`reset: cannot resolve "${targetArg}"`] };
    const r = reset(repo, targetOid, mode);
    return { ok: r.ok, out: [r.ok ? `HEAD is now at ${r.oid.slice(0, 7)} (${mode})` : r.error] };
  }

  if (cmd === "tag") {
    if (rest[0] === "-d") {
      const name = rest[1];
      const r = deleteTag(repo, name);
      return { ok: r.ok, out: [r.ok ? `deleted tag ${name}` : r.error] };
    }
    const name = rest[0];
    if (!name) {
      const names = listTags(repo).map((t) => t.name);
      return { ok: true, out: names.length ? names : ["(no tags)"] };
    }
    const targetArg = rest[1];
    const targetOid = targetArg ? resolveTargetToCommitOid(repo, targetArg) : undefined;
    if (targetArg && !targetOid) return { ok: false, out: [`tag: cannot resolve "${targetArg}"`] };
    const r = createTag(repo, name, targetOid);
    return { ok: r.ok, out: [r.ok ? `tagged ${name} -> ${r.oid.slice(0, 7)}` : r.error] };
  }

  if (cmd === "stash") {
    const sub = rest[0];
    if (!sub || sub === "save" || sub === "push" || sub === "-m") {
      const mi = rest.indexOf("-m");
      const message = mi >= 0 ? rest.slice(mi + 1).join(" ") : undefined;
      const r = stashSave(repo, message);
      return { ok: r.ok, out: [r.ok ? "saved working directory and index state" : r.error] };
    }
    if (sub === "list") {
      const lines = stashList(repo);
      return { ok: true, out: lines.length ? lines : ["(no stashes)"] };
    }
    if (sub === "pop") {
      const n = rest[1] ? parseInt(rest[1], 10) : 0;
      const r = stashPop(repo, n);
      return { ok: r.ok, out: [r.ok ? `popped stash@{${n}}: ${r.message}` : r.error] };
    }
    if (sub === "drop") {
      const n = rest[1] ? parseInt(rest[1], 10) : 0;
      const r = stashDrop(repo, n);
      return { ok: r.ok, out: [r.ok ? `dropped stash@{${n}}: ${r.message}` : r.error] };
    }
    return { ok: false, out: ["stash: usage: stash [-m <msg>] | stash list | stash pop [n] | stash drop [n]"] };
  }

  if (cmd === "revert") {
    const target = rest[0];
    const oid = target ? resolveTargetToCommitOid(repo, target) : null;
    if (!oid) return { ok: false, out: [`revert: cannot resolve "${target || ""}"`] };
    const r = await revertCommit(repo, oid);
    return { ok: r.ok, out: [r.ok ? `reverted, new commit ${r.commitOid.slice(0, 7)}` : r.error] };
  }

  if (cmd === "cherry-pick") {
    const target = rest[0];
    const oid = target ? resolveTargetToCommitOid(repo, target) : null;
    if (!oid) return { ok: false, out: [`cherry-pick: cannot resolve "${target || ""}"`] };
    const r = await cherryPickCommit(repo, oid);
    return { ok: r.ok, out: [r.ok ? `cherry-picked, new commit ${r.commitOid.slice(0, 7)}` : r.error] };
  }

  if (cmd === "mv") {
    const r = movePath(repo, rest[0], rest[1]);
    return { ok: r.ok, out: [r.ok ? `renamed ${rest[0]} -> ${rest[1]}` : r.error] };
  }

  if (cmd === "clean") {
    const dry = rest.includes("-n") || rest.includes("--dry-run");
    const force = rest.includes("-f") || rest.includes("--force");
    const untracked = listUntracked(repo);
    if (!untracked.length) return { ok: true, out: ["nothing to clean"] };
    if (dry || !force) {
      return { ok: true, out: untracked.map((p) => `Would remove ${p}`) };
    }
    cleanUntracked(repo);
    return { ok: true, out: untracked.map((p) => `Removing ${p}`) };
  }

  if (cmd === "config") {
    const key = rest[0];
    const value = rest.slice(1).join(" ");
    if (!key) {
      return {
        ok: true,
        out: [`user.name=${getConfigValue(repo, "user.name") || "(unset, defaults to 'You')"}`, `user.email=${getConfigValue(repo, "user.email") || "(unset, defaults to 'you@example.com')"}`],
      };
    }
    if (!value) {
      const v = getConfigValue(repo, key);
      return { ok: true, out: [v !== null ? v : "(unset)"] };
    }
    const r = setConfig(repo, key, value);
    return { ok: r.ok, out: [r.ok ? `${key}=${value}` : r.error] };
  }

  // --- Real Git plumbing commands (in addition to the TinyGit-native
  // cat/ls shortcuts above) — these exist so any guide that teaches Git
  // internals with actual Git syntax (rev-parse, cat-file, ls-tree, diff,
  // show) works here without translation. ---

  if (cmd === "rev-parse") {
    const target = rest[0] || "HEAD";
    const oid = target.toUpperCase() === "HEAD" ? resolveHEAD(repo) : resolveTargetToCommitOid(repo, target);
    if (!oid) return { ok: false, out: [`rev-parse: cannot resolve "${target}"`] };
    return { ok: true, out: [oid] };
  }

  if (cmd === "cat-file") {
    // supports: cat-file -p <oid>   (also accepts -t for the object type)
    const flag = rest[0];
    const spec = rest[1];
    if (!spec) return { ok: false, out: ["cat-file: usage: cat-file -p <oid>"] };
    const oid = resolveTargetToCommitOid(repo, spec) || spec;
    const obj = getObject(repo, oid);
    if (!obj) return { ok: false, out: [`cat-file: not found: ${spec}`] };

    if (flag === "-t") return { ok: true, out: [obj.type] };

    if (obj.type === "blob") return { ok: true, out: [readBlobText(repo, oid) ?? ""] };
    if (obj.type === "commit") {
      const c = readCommit(repo, oid);
      return { ok: true, out: [c?.text || ""] };
    }
    if (obj.type === "tree") {
      const entries = readTreeEntries(repo, oid) || [];
      return {
        ok: true,
        out: entries.map((e) => `${String(e.mode).padStart(6, "0")} ${e.mode === 40000 ? "tree" : "blob"} ${e.oid}\t${e.name}`),
      };
    }
    return { ok: false, out: [`cat-file: unknown object type: ${obj.type}`] };
  }

  if (cmd === "ls-tree") {
    const target = rest[0] || "HEAD";
    // ls-tree accepts any "tree-ish": a branch/HEAD/commit-oid (use its
    // tree), OR a raw tree oid directly (like the one 'write-tree' prints).
    let treeOid = null;
    const resolved = resolveTargetToCommitOid(repo, target);
    if (resolved) {
      const obj = getObject(repo, resolved);
      if (obj?.type === "tree") treeOid = resolved;
      else if (obj?.type === "commit") treeOid = readCommit(repo, resolved)?.tree || null;
    }
    if (!treeOid) return { ok: false, out: [`ls-tree: cannot resolve "${target}"`] };
    const entries = readTreeEntries(repo, treeOid);
    if (!entries) return { ok: false, out: [`ls-tree: not a tree: ${target}`] };
    return {
      ok: true,
      out: entries.map((e) => `${String(e.mode).padStart(6, "0")} ${e.mode === 40000 ? "tree" : "blob"} ${e.oid}\t${e.name}`),
    };
  }

  if (cmd === "diff") {
    const staged = rest.includes("--staged") || rest.includes("--cached");
    const pathArg = rest.find((a) => !a.startsWith("--"));
    const headTree = getHeadTreeOid(repo);
    const headFiles = headTree ? listTreeRecursive(repo, headTree).filter((f) => f.kind === "blob") : [];
    const headTextOf = (p) => {
      const hit = headFiles.find((f) => f.path === p);
      return hit ? readBlobText(repo, hit.oid) ?? "" : null;
    };
    const indexTextOf = (p) => {
      const oid = repo.index?.[p]?.oid;
      return oid ? readBlobText(repo, oid) ?? "" : null;
    };
    const workTextOf = (p) => (Object.prototype.hasOwnProperty.call(repo.working || {}, p) ? String(repo.working[p] ?? "") : null);

    const oldTextOf = staged ? headTextOf : indexTextOf;
    const newTextOf = staged ? indexTextOf : workTextOf;

    const paths = pathArg
      ? [pathArg]
      : [...new Set([...Object.keys(repo.working || {}), ...Object.keys(repo.index || {}), ...headFiles.map((f) => f.path)])].sort();

    const out = [];
    for (const p of paths) {
      const oldText = oldTextOf(p);
      const newText = newTextOf(p);
      if (oldText === newText) continue;
      out.push(`diff --git a/${p} b/${p}`);
      const rows = diffLines(oldText ?? "", newText ?? "");
      for (const r of rows) {
        if (r.type === "same") continue;
        out.push((r.type === "add" ? "+" : "-") + r.line);
      }
    }
    return { ok: true, out: out.length ? out : ["(no differences)"] };
  }

  if (cmd === "show") {
    const target = rest[0] || "HEAD";
    const oid = resolveTargetToCommitOid(repo, target);
    if (!oid) return { ok: false, out: [`show: cannot resolve "${target}"`] };
    const c = readCommit(repo, oid);
    if (!c) return { ok: false, out: [`show: not a commit: ${target}`] };

    const out = [`commit ${oid}`, ...(c.parents || []).map((p) => `parent ${p}`), "", `    ${c.message || ""}`, ""];

    if (c.parents?.[0]) {
      const parentTree = readCommit(repo, c.parents[0])?.tree;
      const thisFiles = listTreeRecursive(repo, c.tree).filter((f) => f.kind === "blob");
      const parentFiles = parentTree ? listTreeRecursive(repo, parentTree).filter((f) => f.kind === "blob") : [];
      const textAt = (files, p) => {
        const hit = files.find((f) => f.path === p);
        return hit ? readBlobText(repo, hit.oid) ?? "" : null;
      };
      const paths = [...new Set([...thisFiles.map((f) => f.path), ...parentFiles.map((f) => f.path)])].sort();
      for (const p of paths) {
        const before = textAt(parentFiles, p);
        const after = textAt(thisFiles, p);
        if (before === after) continue;
        out.push(`diff --git a/${p} b/${p}`);
        for (const r of diffLines(before ?? "", after ?? "")) {
          if (r.type === "same") continue;
          out.push((r.type === "add" ? "+" : "-") + r.line);
        }
      }
    }
    return { ok: true, out };
  }

  // --- The remaining plumbing from "building history by hand": these
  // deliberately do NOT touch HEAD or any ref (except update-ref itself),
  // exactly like their real Git counterparts — that's the whole point of
  // the exercise: constructing commits without 'add'/'commit' at all.

  if (cmd === "hash-object") {
    const args = rest.filter((a) => a !== "--stdin");
    const write = args.includes("-w");
    const text = args.filter((a) => a !== "-w").join(" ");
    if (!text) return { ok: false, out: ["hash-object: usage: hash-object -w --stdin <text>"] };
    if (!write) {
      return { ok: false, out: ["hash-object: TinyGit only supports '-w' (always writes the object)"] };
    }
    const oid = await writeBlob(repo, text);
    return { ok: true, out: [oid] };
  }

  if (cmd === "update-index") {
    // update-index --add --cacheinfo <mode> <oid> <path>
    const ci = rest.indexOf("--cacheinfo");
    if (!rest.includes("--add") || ci === -1) {
      return { ok: false, out: ["update-index: usage: update-index --add --cacheinfo <mode> <oid> <path>"] };
    }
    const mode = parseInt(rest[ci + 1], 10);
    const oid = rest[ci + 2];
    const path = rest[ci + 3];
    if (!mode || !oid || !path) return { ok: false, out: ["update-index: missing mode/oid/path"] };
    repo.index[path] = { mode, oid };
    return { ok: true, out: [`added ${path} to the index (staged, without touching the working tree)`] };
  }

  if (cmd === "write-tree") {
    const treeOid = await writeTreeFromIndex(repo, repo.index);
    return { ok: true, out: [treeOid] };
  }

  if (cmd === "commit-tree") {
    const treeOid = rest[0];
    if (!treeOid) return { ok: false, out: ["commit-tree: usage: commit-tree <tree-oid> [-p <parent>]... -m <message>"] };
    const parents = [];
    const mi = rest.indexOf("-m");
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] === "-p") parents.push(resolveTargetToCommitOid(repo, rest[i + 1]) || rest[i + 1]);
    }
    const message = mi >= 0 ? rest.slice(mi + 1).join(" ") : "";
    if (!message) return { ok: false, out: ["commit-tree: missing -m <message>"] };
    const who = getAuthorString(repo);
    const commitOid = await writeCommit(repo, { treeOid, parents, author: who, committer: who, message });
    return { ok: true, out: [commitOid] };
  }

  if (cmd === "update-ref") {
    const refName = rest[0];
    const target = rest[1];
    if (!refName || !target) return { ok: false, out: ["update-ref: usage: update-ref <refs/heads/name> <oid>"] };
    const oid = resolveTargetToCommitOid(repo, target) || target;
    const full = refName.startsWith("refs/") ? refName : `refs/heads/${refName}`;
    updateRef(repo, full, oid);
    return { ok: true, out: [`${full} -> ${oid.slice(0, 7)}`] };
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
