// src/lib/tinygit/store.js
import { b64ToBytes, bytesToB64 } from "./codec";

const LS_KEY = "tinygit_repo@1";

export function loadRepo() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // migrate defaults
    parsed.objects ||= {};
    parsed.refs ||= { "refs/heads/main": null };
    parsed.head ||= { kind: "ref", value: "refs/heads/main" };
    parsed.index ||= {};
    parsed.working ||= {};

    return parsed;
  } catch {
    return null;
  }
}

export function saveRepo(repo) {
  localStorage.setItem(LS_KEY, JSON.stringify(repo));
}

export function newRepo() {
  return {
    objects: {},
    refs: { "refs/heads/main": null },
    head: { kind: "ref", value: "refs/heads/main" },
    index: {},
    working: {},
  };
}

export function hasObject(repo, oid) {
  return !!repo.objects?.[oid];
}

export function putObject(repo, oid, type, contentBytes) {
  repo.objects[oid] = { type, b64: bytesToB64(contentBytes) };
}

export function getObject(repo, oid) {
  const rec = repo.objects?.[oid];
  if (!rec) return null;
  return { oid, type: rec.type, content: b64ToBytes(rec.b64) };
}
