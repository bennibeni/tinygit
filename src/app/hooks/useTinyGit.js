// src/hooks/useTinyGit.js
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadRepo, newRepo, saveRepo } from "../lib/store";
import { resolveHEAD, logLinear } from "../lib/plumbing";
import { runCommand } from "../lib/cli";
import {
  status as statusFn,
  getHeadTreeOid,
  getChanges,
  listBranches,
} from "../lib/porcelain";
import { listTreeRecursive } from "../lib/readers";

function cloneRepo(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export default function useTinyGit() {
  const [repo, setRepo] = useState(null);

  // UI selections (for panels)
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [selectedArea, setSelectedArea] = useState("work"); // work|index|head

  useEffect(() => {
    const r = loadRepo();
    setRepo(r || newRepo());
  }, []);

  const persist = useCallback((next) => {
    saveRepo(next);
    setRepo({ ...next });
  }, []);

  const exec = useCallback(
    async (line) => {
      const next = cloneRepo(repo);
      const res = await runCommand(next, line);
      persist(next);
      return res;
    },
    [repo, persist],
  );

  const writeFile = useCallback(
    (path, text) => {
      const next = cloneRepo(repo);
      next.working = next.working || {};
      next.working[path] = text;
      persist(next);
    },
    [repo, persist],
  );

  const reset = useCallback(() => {
    const r = newRepo();
    persist(r);
    setSelectedCommit(null);
    setSelectedPath(null);
    setSelectedArea("work");
  }, [persist]);

  const headOid = useMemo(() => (repo ? resolveHEAD(repo) : null), [repo]);
  const log = useMemo(
    () => (repo && headOid ? logLinear(repo, headOid, 200) : []),
    [repo, headOid],
  );

  const headTree = useMemo(() => (repo ? getHeadTreeOid(repo) : null), [repo]);
  const headFiles = useMemo(
    () => (repo && headTree ? listTreeRecursive(repo, headTree) : []),
    [repo, headTree],
  );
  const statusRows = useMemo(() => (repo ? statusFn(repo) : []), [repo]);
  const changes = useMemo(
    () => (repo ? getChanges(repo) : { staged: [], unstaged: [] }),
    [repo],
  );
  const branches = useMemo(() => (repo ? listBranches(repo) : []), [repo]);
  const mergeState = repo?.mergeState || null;

  return {
    repo,
    headOid,
    log,
    headFiles,
    statusRows,
    changes,
    branches,
    mergeState,

    selectedCommit,
    setSelectedCommit,
    selectedPath,
    setSelectedPath,
    selectedArea,
    setSelectedArea,

    exec,
    writeFile,
    reset,
  };
}
