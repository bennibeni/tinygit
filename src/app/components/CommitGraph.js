"use client";

import React, { useMemo } from "react";
import { buildGraph } from "../lib/graph";

const LANE_COLORS = [
  "#2DD4BF", // teal - main
  "#F4B942", // amber
  "#FB7185", // rose
  "#818CF8", // indigo
  "#4ADE80", // green
  "#F472B6", // pink
];

const ROW_H = 56;
const LANE_W = 34;
const PAD_X = 24;
const PAD_Y = 24;

export default function CommitGraph({ repo, selected, onSelect }) {
  const graph = useMemo(() => (repo ? buildGraph(repo) : null), [repo]);

  if (!graph || !graph.nodes.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1216] p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-1">Binario</div>
        <div className="text-sm text-white/50 font-mono">nessuna fermata ancora — nessun commit</div>
      </div>
    );
  }

  const { nodes, branchTips, tagTips, headOid, laneCount } = graph;
  const posOf = new Map(nodes.map((n) => [n.oid, n]));

  const lanesWidth = Math.max(laneCount, 1) * LANE_W;
  const textX = PAD_X + lanesWidth + 24; // single shared column for all labels, right of every lane
  const width = textX + 300;
  const height = PAD_Y * 2 + nodes.length * ROW_H;

  const xy = (n) => ({ x: PAD_X + n.lane * LANE_W, y: PAD_Y + n.row * ROW_H });
  const laneColor = (lane) => LANE_COLORS[lane % LANE_COLORS.length];
  const TAG_COLOR = "#F4B942";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0F1216] p-4 overflow-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-widest text-white/40">Binario dei commit</div>
        <div className="flex flex-wrap gap-2">
          {branchTips.map((b) => (
            <span
              key={`b-${b.name}`}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md border"
              style={{ borderColor: laneColor(b.lane), color: laneColor(b.lane) }}
            >
              {b.name}
            </span>
          ))}
          {(tagTips || []).map((t) => (
            <span
              key={`t-${t.name}`}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md border"
              style={{ borderColor: TAG_COLOR, color: TAG_COLOR }}
              title="tag"
            >
              🏷 {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-white/30 mb-2">hash del commit · messaggio del commit</div>

      <svg width={width} height={height} className="block">
        {/* edges */}
        {nodes.map((n) => {
          const p1 = xy(n);
          return (n.parents || []).map((pOid, i) => {
            const parentNode = posOf.get(pOid);
            if (!parentNode) return null;
            const p2 = xy(parentNode);
            const color = laneColor(i === 0 ? n.lane : parentNode.lane);
            const path =
              p1.x === p2.x
                ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
                : `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + ROW_H / 2}, ${p2.x} ${p2.y - ROW_H / 2}, ${p2.x} ${p2.y}`;
            return (
              <path
                key={`${n.oid}-${pOid}`}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.8}
              />
            );
          });
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const { x, y } = xy(n);
          const isHead = n.oid === headOid;
          const isSelected = n.oid === selected;
          const color = laneColor(n.lane);
          const isMerge = (n.parents || []).length > 1;
          const labelLocalX = textX - x; // lands at the shared absolute column regardless of lane

          return (
            <g
              key={n.oid}
              transform={`translate(${x},${y})`}
              onClick={() => onSelect?.(n.oid)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              {isSelected && <circle r={10} fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.6} />}
              <circle r={isMerge ? 8 : 6} fill={isMerge ? "#0F1216" : color} stroke={color} strokeWidth={2} />

              {/* faint connector from the node to its label column, since lanes vary in x */}
              <line
                x1={isMerge ? 8 : 6}
                y1={0}
                x2={labelLocalX - 6}
                y2={0}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.35}
              />

              <text x={labelLocalX} y={4} fontSize={11} fontFamily="ui-sans-serif, system-ui, sans-serif">
                {isHead && (
                  <tspan fill="#fff" fontWeight={700} fontFamily="ui-monospace, monospace">
                    HEAD{" "}
                  </tspan>
                )}
                <tspan fill="rgba(255,255,255,0.85)" fontFamily="ui-monospace, monospace">
                  {n.oid.slice(0, 7)}
                </tspan>
                <tspan fill="rgba(255,255,255,0.82)" fontWeight={500}>
                  {"  " + (n.firstLine.length > 34 ? n.firstLine.slice(0, 34) + "…" : n.firstLine)}
                </tspan>
                <title>
                  {n.branches?.length
                    ? `Branch: ${n.branches.join(", ")}`
                    : "Non raggiungibile da nessun branch attuale"}
                </title>
              </text>

              {/* small inline decoration only for commits that ARE exactly a
                  branch tip (or tagged) right now — like git's
                  "(main, esperimento, tag: v1)" ref annotations. Ancestors
                  still get the full branch list on hover. */}
              {(() => {
                const tipNames = branchTips.filter((b) => b.oid === n.oid).map((b) => b.name);
                const tagNames = (tagTips || []).filter((t) => t.oid === n.oid).map((t) => `tag: ${t.name}`);
                const allNames = [...tipNames, ...tagNames];
                if (!allNames.length) return null;
                return (
                  <text
                    x={labelLocalX}
                    y={16}
                    fontSize={9.5}
                    fill="rgba(255,255,255,0.35)"
                    fontFamily="ui-monospace, monospace"
                  >
                    {`(${allNames.join(", ")})`}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
