"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, getTreeLinePrefix, type NodeRendererProps } from "react-arborist";
import { AnimatePresence, motion } from "motion/react";
import {
  IconBuildingFactory,
  IconBox,
  IconChevronRight,
  IconCircleDashed,
  IconCircleCheck,
  IconHierarchy,
  IconLayoutKanban,
  IconPlugConnected,
} from "@tabler/icons-react";

type TreeNodeData = {
  id: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeData[];
};

type BomSource = "teamcenter" | "configit";

type UnknownJson = Record<string, unknown>;

type BomViewerPayloadTransformer = (payload: UnknownJson) => TreeNodeData | null;

export type BomViewerKind = {
  kind: BomSource;
  title: string;
  endpoint: string;
  transformPayload: BomViewerPayloadTransformer;
  emptyMessage: string;
};

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function getString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

function getNumberOrString(x: unknown): string | number | boolean | undefined {
  if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return x;
  return undefined;
}

function getArray(x: unknown): unknown[] | null {
  return Array.isArray(x) ? x : null;
}

function transformTeamcenterNode(node: unknown, fallbackId: string): TreeNodeData {
  const obj = asRecord(node);
  const attributes: Record<string, string | number | boolean> = {};

  const itemId = getString(obj?.itemId);
  const sequence = getString(obj?.sequence);
  const variantState = getString(obj?.variantState);
  const revId = getString(obj?.revId);
  const qty = getString(obj?.qty);
  const variantCondition = getString(obj?.variantCondition);

  if (itemId) attributes["Item ID"] = itemId;
  if (sequence) attributes["Sequence"] = sequence;
  if (variantState) attributes["Variant State"] = variantState;
  if (revId) attributes["Rev ID"] = revId;
  if (qty) attributes["Qty"] = qty;
  if (variantCondition) attributes["Variant Condition"] = variantCondition;

  const id = getString(obj?.id) ?? itemId ?? fallbackId;
  const name = getString(obj?.name) ?? itemId ?? "Unnamed node";

  const children = getArray(obj?.children);

  return {
    id,
    name,
    attributes,
    children: children?.map((child, index) => transformTeamcenterNode(child, `${fallbackId}-${index}`)) ?? [],
  };
}

export function getTeamcenterRoot(payload: unknown): TreeNodeData | null {
  if (!payload) return null;

  const rootObj = asRecord(payload);
  if (!rootObj) return null;

  const bomRoot = rootObj.bomRoot ?? asRecord(rootObj.bomStructure ?? {})?.bomRoot;
  if (bomRoot) {
    return transformTeamcenterNode(bomRoot, "teamcenter-root");
  }

  const hasAny = Boolean(rootObj.itemId || rootObj.name || rootObj.children);
  if (hasAny) {
    return transformTeamcenterNode(payload, "teamcenter-root");
  }

  return null;
}

export function getConfigitRoot(payload: unknown): TreeNodeData | null {
  const obj = asRecord(payload);
  if (!obj) return null;

  const families = getArray(obj.content);
  if (!families || !families.length) return null;

  const productModel = getString(obj.productModel);
  const workItem = getString(obj.workItem);

  return {
    id: "configit-root",
    name: productModel ? `Product Model ${productModel}` : "Configit BOM",
    attributes: workItem ? { "Work Item": workItem } : {},
    children: families.map((familyRaw, index) => {
      const family = asRecord(familyRaw) ?? {};
      const code = getString(family.code);
      const description = getString(family.description);
      const familyType = getString(family.familyType);
      const labelsArr = getArray(family.labels);
      const labels = labelsArr?.filter((l): l is string => typeof l === "string").join(", ") ?? "";

      const features = getArray(family.features);
      const familyAttributes: Record<string, string | number | boolean> = {};
      if (code) familyAttributes.Code = code;
      if (familyType) familyAttributes["Family Type"] = familyType;
      if (labels) familyAttributes.Labels = labels;

      return {
        id: code ? `family-${code}` : `family-${index}`,
        name: description ?? code ?? `Family ${index + 1}`,
        attributes: familyAttributes,
        children:
          features?.map((featureRaw, featureIndex) => {
            const feature = asRecord(featureRaw) ?? {};
            const fCode = getString(feature.code);
            const fDesc = getString(feature.description);
            const featureAttributes: Record<string, string | number | boolean> = {};
            if (fCode) featureAttributes.Code = fCode;

            return {
              id: fCode ? `feature-${fCode}` : `feature-${index}-${featureIndex}`,
              name: fDesc ?? fCode ?? `Feature ${featureIndex + 1}`,
              attributes: featureAttributes,
            };
          }) ?? [],
      };
    }),
  };
}


function nodeDepth(node: TreeNodeData, rootId: string, lookup: Map<string, TreeNodeData>): number {
  // BFS using parent pointers not available; approximate using id prefix.
  // For our streaming illusion we compute levels externally.
  void rootId;
  void lookup;
  return 0;
}

function flattenLevels(root: TreeNodeData): { levels: TreeNodeData[][]; ids: Set<string> } {
  const levels: TreeNodeData[][] = [];
  const ids = new Set<string>();

  let currentLevel: TreeNodeData[] = [root];
  let levelIdx = 0;

  while (currentLevel.length) {
    levels[levelIdx] = currentLevel;
    const nextLevel: TreeNodeData[] = [];
    for (const n of currentLevel) {
      ids.add(n.id);
      if (Array.isArray(n.children) && n.children.length) {
        nextLevel.push(...n.children);
      }
    }
    currentLevel = nextLevel;
    levelIdx += 1;
  }

  return { levels, ids };
}

function IconForSource({ source }: { source: BomSource }) {
  if (source === "teamcenter") return <IconPlugConnected className="h-4 w-4 text-emerald-300" />;
  return <IconBox className="h-4 w-4 text-indigo-300" />;
}

type FlattenedLevels = ReturnType<typeof flattenLevels>;


function computeVisibleIds(
  anim: FlattenedLevels | null,
  levelLimit: number
): Set<string> {
  if (!anim) return new Set<string>();
  const ids = new Set<string>();
  for (let l = 0; l <= levelLimit; l++) {
    for (const n of anim.levels[l] ?? []) ids.add(n.id);
  }
  return ids;
}

function TreeRow({
  node,
  style,
  dragHandle,
  isVisible,
}: NodeRendererProps<TreeNodeData> & { isVisible: boolean }) {
  const hasChildren = !node.isLeaf;


  return (
    <motion.div
      style={style}
      ref={dragHandle}
      initial={{ opacity: 0, y: 6 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex items-center"
    >
      <div className="group flex w-full items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-2 shadow-sm shadow-slate-950/10">
        {/* Connector prefix (Teamcenter-like) */}
        <span
          className="font-mono text-[11px] text-slate-400"
          style={{ width: 62, display: "inline-block" }}
        >
          {getTreeLinePrefix(node)}
        </span>

        {/* Toggle icon */}
        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={() => hasChildren && node.toggle()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/70 bg-slate-900/20 text-slate-200 transition hover:bg-slate-900/40 hover:text-white"
        >
          {hasChildren ? (
            <motion.span
              initial={false}
              animate={{ rotate: node.isOpen ? 90 : 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {/* Main text */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-slate-100 group-hover:text-white">
            {node.data.name}
          </div>
          {node.data.attributes && Object.keys(node.data.attributes).length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {Object.entries(node.data.attributes)
                .slice(0, 3)
                .map(([k, v]) => (
                  <span key={k} className="whitespace-nowrap">
                    <span className="text-slate-500">{k}:</span> {String(v)}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function BomStreamViewer({
  sources,
  showBoth,
}: {
  sources: { teamcenter: BomViewerKind; configit: BomViewerKind };
  showBoth: boolean;
}) {
  const [teamPayload, setTeamPayload] = useState<TreeNodeData | null>(null);
  const [configPayload, setConfigPayload] = useState<TreeNodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);




  const [animLevelBySource, setAnimLevelBySource] = useState<Record<BomSource, number>>({
    teamcenter: 0,
    configit: 0,
  });

  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
    let isMounted = true;

    const fetchOnce = async (source: BomSource) => {
      const cfg = source === "teamcenter" ? sources.teamcenter : sources.configit;
      const res = await fetch(cfg.endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(cfg.emptyMessage);
      const json = await res.json();
      return cfg.transformPayload(json);
    };

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        const [tc, ci] = await Promise.all([
          fetchOnce("teamcenter").catch(() => null),
          showBoth ? fetchOnce("configit").catch(() => null) : Promise.resolve(null),
        ]);

        if (!isMounted) return;
        setTeamPayload(tc);
        setConfigPayload(ci);
      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : "Failed to load BOM");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [sources, showBoth]);

  const teamAnim = useMemo(() => (teamPayload ? flattenLevels(teamPayload) : null), [teamPayload]);
  const configAnim = useMemo(() => (configPayload ? flattenLevels(configPayload) : null), [configPayload]);

  useEffect(() => {
    if (!teamAnim && !configAnim) return;

    const start = startedAtRef.current ?? Date.now();

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;

      const elapsed = Date.now() - start;
      // level reveal pacing: 260ms per level
      const revealLevel = (lvlCount: number) => Math.min(lvlCount - 1, Math.floor(elapsed / 260));

      setAnimLevelBySource((prev) => {
        const next = { ...prev };
        if (teamAnim) next.teamcenter = revealLevel(teamAnim.levels.length);
        if (configAnim) next.configit = revealLevel(configAnim.levels.length);
        return next;
      });

      const doneTeam = teamAnim ? animLevelBySource.teamcenter >= teamAnim.levels.length - 1 : true;
      const doneConfig = configAnim ? animLevelBySource.configit >= configAnim.levels.length - 1 : true;

      if (doneTeam && doneConfig) return;

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamAnim, configAnim]);

  const renderOne = (source: BomSource) => {
    const cfg = source === "teamcenter" ? sources.teamcenter : sources.configit;
    const payload = source === "teamcenter" ? teamPayload : configPayload;
    const anim = source === "teamcenter" ? teamAnim : configAnim;

    const levelLimit = anim ? animLevelBySource[source] : 0;

    const treeData = payload ? [payload] : [];

    const visibleIds = computeVisibleIds(anim, levelLimit);


    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconForSource source={source} />
            <div>
              <div className="text-sm font-semibold text-white">{cfg.title}</div>
              <div className="text-xs text-slate-400">{cfg.kind === "teamcenter" ? "Teamcenter Structure Manager" : "Configit Family → Features"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            {payload ? (
              <>
                <IconCircleCheck className="h-4 w-4 text-emerald-300" />
                <span>Streamed</span>
              </>
            ) : (
              <>
                <IconCircleDashed className="h-4 w-4" />
                <span>Pending</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800/70 bg-slate-900/60 p-2">
          {payload && anim ? (
            <div className="h-[54vh] min-h-[380px] overflow-auto">
              <Tree
                data={treeData}
                openByDefault={false}
                width="100%"
                height={420}
                rowHeight={54}
                indent={20}
                overscanCount={3}
                paddingTop={10}
                paddingBottom={10}
              >
                {(nodeProps) => {
                  // react-arborist expects a component; using inline component so we can pass visibility.
                  const isVisible = visibleIds.has(nodeProps.node.data.id) || nodeProps.node.isRoot;
                  return <TreeRow {...nodeProps} isVisible={isVisible} />;
                }}
              </Tree>
            </div>
          ) : (
            <div className="flex h-[54vh] min-h-[380px] items-center justify-center rounded-lg border border-dashed border-slate-700/70">
              <div className="text-center">
                <IconHierarchy className="mx-auto h-8 w-8 text-slate-500" />
                <div className="mt-3 text-sm font-medium text-slate-200">{cfg.emptyMessage}</div>
                <div className="mt-1 text-xs text-slate-400">Waiting for extracted JSON.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      )}

      {showBoth ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderOne("teamcenter")}
          {renderOne("configit")}
        </div>
      ) : (
        renderOne("teamcenter")
      )}

      {/* global stream hints */}
      {(loading || (teamPayload && teamAnim) || (configPayload && configAnim)) && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-4">
          <IconLayoutKanban className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <div className="text-sm font-medium text-white">Live BOM stream</div>
            <div className="text-xs text-slate-400">
              The backend JSON is already generated; the UI reveals it progressively to match an enterprise PLM experience.
            </div>
          </div>
        </div>
      )}

      <AnimatePresence />
    </div>
  );
}

