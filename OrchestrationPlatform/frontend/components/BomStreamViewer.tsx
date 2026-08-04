"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { AnimatePresence, motion } from "motion/react";
import {
  IconBuildingFactory,
  IconBox,
  IconChevronRight,
  IconCircleCheck,
  IconCircleDashed,
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

type BomSource = "teamcenter" | "configit" | "windchill";

type UnknownJson = Record<string, unknown>;

type BomViewerPayloadTransformer = (
  payload: UnknownJson
) => TreeNodeData | null;

export type BomViewerKind = {
  kind: BomSource;
  title: string;
  endpoint: string;
  transformPayload: BomViewerPayloadTransformer;
  emptyMessage: string;
};

type FlattenedLevels = {
  levels: TreeNodeData[][];
  ids: Set<string>;
};

const TEAMCENTER_MAX_FETCH_ATTEMPTS = 2000;
const TEAMCENTER_RETRY_DELAY_MS = 1500;

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumberOrString(
  value: unknown
): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function getArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function isTeamcenterNode(
  value: Record<string, unknown> | null
): value is Record<string, unknown> {
  if (!value) {
    return false;
  }

  return Boolean(
    value.itemId ||
      value.name ||
      value.id ||
      Array.isArray(value.children)
  );
}

function transformTeamcenterNode(
  node: unknown,
  fallbackId: string
): TreeNodeData {
  const obj = asRecord(node);

  const attributes: Record<
    string,
    string | number | boolean
  > = {};

  const itemId = getString(obj?.itemId);
  const sequence = getString(obj?.sequence);
  const variantState = getString(obj?.variantState);
  const revId = getString(obj?.revId);
  const quantity = getNumberOrString(obj?.qty);
  const variantCondition = getString(
    obj?.variantCondition
  );

  if (itemId) {
    attributes["Item ID"] = itemId;
  }

  if (sequence) {
    attributes["Sequence"] = sequence;
  }

  if (variantState) {
    attributes["Variant State"] = variantState;
  }

  if (revId) {
    attributes["Rev ID"] = revId;
  }

  if (quantity !== undefined) {
    attributes["Qty"] = quantity;
  }

  if (variantCondition) {
    attributes["Variant Condition"] = variantCondition;
  }

  /*
   * The fallback ID contains the node's structural path.
   * This guarantees unique IDs even if the same Teamcenter item
   * appears more than once in the BOM.
   */
  const id = fallbackId;

  const explicitId = getString(obj?.id);

  const name =
    getString(obj?.name) ??
    itemId ??
    explicitId ??
    "Unnamed node";

  const children = getArray(obj?.children) ?? [];

  return {
    id,
    name,
    attributes,
    children: children.map((child, index) =>
      transformTeamcenterNode(
        child,
        `${fallbackId}-${index}`
      )
    ),
  };
}

export function getTeamcenterRoot(
  payload: unknown
): TreeNodeData | null {
  if (!payload) {
    return null;
  }

  const response = asRecord(payload);

  if (!response) {
    return null;
  }

  /*
   * Support both:
   *
   * {
   *   payload: {
   *     finalBom: { ... }
   *   }
   * }
   *
   * and:
   *
   * {
   *   finalBom: { ... }
   * }
   */
  const payloadBody =
    asRecord(response.payload) ?? response;

  const finalBom =
    asRecord(payloadBody.finalBom) ??
    asRecord(response.finalBom);

  const bomStructure =
    asRecord(finalBom?.bomStructure) ??
    asRecord(payloadBody.bomStructure);

  /*
   * Supported Teamcenter payload shapes:
   *
   * finalBom.bomRootNode
   * finalBom.bomRoot
   * finalBom.bomStructure.bomRootNode
   * finalBom.bomStructure.bomRoot
   * payload.bomRootNode
   * payload.bomRoot
   * finalBom itself as the root
   * direct payload as the root
   */
  const bomRoot =
    asRecord(finalBom?.bomRootNode) ??
    asRecord(finalBom?.bomRoot) ??
    asRecord(bomStructure?.bomRootNode) ??
    asRecord(bomStructure?.bomRoot) ??
    asRecord(payloadBody.bomRootNode) ??
    asRecord(payloadBody.bomRoot) ??
    (isTeamcenterNode(finalBom) ? finalBom : null) ??
    (isTeamcenterNode(payloadBody)
      ? payloadBody
      : null);

  if (!bomRoot) {
    console.warn(
      "[BomStreamViewer] Teamcenter response did not contain a valid BOM root",
      payload
    );

    return null;
  }

  return transformTeamcenterNode(
    bomRoot,
    "teamcenter-root"
  );
}

/*
 * Configit transformation logic remains unchanged.
 */
function transformConfigitNodes(
  node: unknown,
  fallbackId: string
): TreeNodeData[] {
  const obj = asRecord(node);

  if (!obj) {
    return [];
  }

  const rawQty =
    obj.quantity ??
    obj.qty ??
    obj.amount ??
    obj.count;

  const quantity =
    typeof rawQty === "object" &&
    rawQty !== null &&
    "value" in rawQty
      ? `${String(
          (rawQty as Record<string, unknown>).value ?? ""
        )} ${String(
          (
            rawQty as Record<string, unknown>
          ).unit ?? ""
        )}`.trim()
      : getNumberOrString(rawQty);

  const childValues =
    getArray(obj.children) ??
    getArray(obj.nodes) ??
    getArray(obj.items) ??
    getArray(obj.bom) ??
    getArray(obj.bomItems) ??
    getArray(obj.boms) ??
    [];

  const children = childValues.flatMap(
    (child, index) =>
      transformConfigitNodes(
        child,
        `${fallbackId}-${index}`
      )
  );

  const productId = getString(obj.productId);
  const bomItemId = getString(obj.bomItemId);
  const bomId = getString(obj.bomId);
  const nodeId = getString(obj.nodeId);
  const nameValue = getString(obj.name);

  const bomItemsLength =
    getArray(obj.bomItems)?.length ?? 0;

  const bomsLength =
    getArray(obj.boms)?.length ?? 0;

  const isBomWrapper =
    !productId &&
    !bomItemId &&
    !nameValue &&
    (bomItemsLength > 0 || bomsLength > 0);

  const isNodeIdOnlyWrapper =
    !productId &&
    !bomItemId &&
    !nameValue &&
    Boolean(nodeId) &&
    children.length > 0;

  if (
    (isBomWrapper || isNodeIdOnlyWrapper) &&
    children.length > 0
  ) {
    return children;
  }

  const id =
    productId ??
    bomItemId ??
    bomId ??
    nodeId ??
    getString(obj.id) ??
    fallbackId;

  const name =
    productId ??
    bomItemId ??
    bomId ??
    nameValue ??
    nodeId ??
    getString(obj.id) ??
    "Configit node";

  const attributes: Record<
    string,
    string | number | boolean
  > = {};

  if (quantity !== undefined && quantity !== null) {
    attributes.Quantity = quantity;
  }

  return [
    {
      id: String(id),
      name: String(name),
      attributes,
      children,
    },
  ];
}

export function getConfigitRoot(
  payload: unknown
): TreeNodeData | null {
  const obj = asRecord(payload);

  if (!obj) {
    return null;
  }

  const bom =
    getArray(obj.bom) ??
    getArray(obj.nodes) ??
    getArray(obj.children) ??
    getArray(obj.items);

  if (!bom || bom.length === 0) {
    const roots = transformConfigitNodes(
      payload,
      "configit-root"
    );

    if (roots.length === 0) {
      return null;
    }

    if (roots.length === 1) {
      return {
        ...roots[0],
        id: "configit-root",
      };
    }

    return {
      id: "configit-root",
      name: "Configit BOM",
      attributes: {},
      children: roots,
    };
  }

  const productId =
    getString(obj.productId) ??
    getString(obj.productModel) ??
    getString(obj.productID);

  const packagePath = getString(obj.packagePath);

  const attributes: Record<
    string,
    string | number | boolean
  > = {};

  if (productId) {
    attributes["Product ID"] = productId;
  }

  if (packagePath) {
    attributes["Package Path"] = packagePath;
  }

  return {
    id: productId
      ? `configit-${productId}`
      : "configit-root",
    name: productId
      ? `Product ${productId}`
      : "Configit BOM",
    attributes,
    children: bom.flatMap((node, index) =>
      transformConfigitNodes(
        node,
        `configit-node-${index}`
      )
    ),
  };
}

/*
 * Windchill transformation logic remains unchanged.
 */
function transformWindchillNode(node: unknown, fallbackPath: string): TreeNodeData {
  const obj = asRecord(node) ?? {};
  const rawAttributes = asRecord(obj.attributes) ?? {};
  const attributes: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(rawAttributes)) {
    const normalized = getNumberOrString(value);
    if (normalized !== undefined) attributes[key] = normalized;
  }

  const itemId = getString(rawAttributes["Item ID"]) ?? getString(obj.PartNumber) ?? getString(obj.partNumber);
  const partId = getString(rawAttributes["Part ID"]) ?? getString(obj.PartId) ?? getString(obj.partId);
  const occurrenceId = getString(rawAttributes["Occurrence ID"]) ?? getString(obj.OccurrenceId) ?? getString(obj.id);
  const treePath = getString(rawAttributes["Tree Path"]) ?? fallbackPath;
  const quantity = getNumberOrString(obj.quantity ?? rawAttributes.Quantity);
  if (itemId) attributes["Item ID"] = itemId;
  if (partId) attributes["Part ID"] = partId;
  if (occurrenceId) attributes["Occurrence ID"] = occurrenceId;
  attributes["Tree Path"] = treePath;
  if (quantity !== undefined) attributes.Quantity = quantity;

  const children = getArray(obj.children) ?? getArray(obj.Components) ?? getArray(obj.components) ?? [];
  const id = occurrenceId || getString(obj.id) || `${fallbackPath}:${itemId || "node"}`;
  const name = getString(obj.name) ?? getString(obj.PartName) ?? itemId ?? id;

  return {
    id,
    name,
    attributes,
    children: children.map((child, index) => transformWindchillNode(child, `${treePath}/${index}`)),
  };
}

export function getWindchillRoot(payload: unknown): TreeNodeData | null {
  const obj = asRecord(payload);
  if (!obj) return null;
  const bom = getArray(obj.bom);
  if (!bom?.length) return null;
  return transformWindchillNode(bom[0], String(obj.productId ?? "windchill-root"));
}

function flattenLevels(
  root: TreeNodeData
): FlattenedLevels {
  const levels: TreeNodeData[][] = [];
  const ids = new Set<string>();

  let currentLevel: TreeNodeData[] = [root];
  let levelIndex = 0;

  while (currentLevel.length > 0) {
    levels[levelIndex] = currentLevel;

    const nextLevel: TreeNodeData[] = [];

    for (const node of currentLevel) {
      ids.add(node.id);

      if (
        Array.isArray(node.children) &&
        node.children.length > 0
      ) {
        nextLevel.push(...node.children);
      }
    }

    currentLevel = nextLevel;
    levelIndex += 1;
  }

  return {
    levels,
    ids,
  };
}

function computeVisibleIds(
  animation: FlattenedLevels | null,
  levelLimit: number
): Set<string> {
  if (!animation) {
    return new Set<string>();
  }

  const ids = new Set<string>();

  for (
    let level = 0;
    level <= levelLimit;
    level += 1
  ) {
    for (
      const node of animation.levels[level] ?? []
    ) {
      ids.add(node.id);
    }
  }

  return ids;
}

function IconForSource({
  source,
}: {
  source: BomSource;
}) {
  if (source === "teamcenter") {
    return (
      <IconPlugConnected className="h-4 w-4 text-emerald-300" />
    );
  }

  if (source === "windchill") {
    return (
      <IconBuildingFactory className="h-4 w-4 text-amber-300" />
    );
  }

  return (
    <IconBox className="h-4 w-4 text-indigo-300" />
  );
}

function TreeRow({
  node,
  style,
  dragHandle,
  isVisible,
}: NodeRendererProps<TreeNodeData> & {
  isVisible: boolean;
}) {
  const hasChildren = !node.isLeaf;

  return (
    <motion.div
      style={style}
      ref={dragHandle}
      initial={{
        opacity: 0,
        y: 6,
      }}
      animate={
        isVisible
          ? {
              opacity: 1,
              y: 0,
            }
          : {
              opacity: 0,
              y: 6,
            }
      }
      transition={{
        duration: 0.28,
        ease: "easeOut",
      }}
      className="flex items-center"
    >
      <div className="group flex w-full items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-2 shadow-sm shadow-slate-950/10">
        <button
          type="button"
          aria-label={
            hasChildren
              ? "Toggle children"
              : "Leaf node"
          }
          onClick={() => {
            if (hasChildren) {
              node.toggle();
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/70 bg-slate-900/20 text-slate-200 transition hover:bg-slate-900/40 hover:text-white"
        >
          {hasChildren ? (
            <motion.span
              initial={false}
              animate={{
                rotate: node.isOpen ? 90 : 0,
              }}
              transition={{
                duration: 0.18,
                ease: "easeOut",
              }}
            >
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-4 w-4 text-slate-500" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-slate-100 group-hover:text-white">
            {node.data.name}
          </div>

          {node.data.attributes &&
            Object.keys(node.data.attributes).length >
              0 && (
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {Object.entries(
                  node.data.attributes
                )
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="whitespace-nowrap"
                    >
                      <span className="text-slate-500">
                        {key}:
                      </span>{" "}
                      {String(value)}
                    </span>
                  ))}
              </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function BomStreamViewer({
  sources,
  showBoth,
}: {
  sources: {
    teamcenter: BomViewerKind;
    configit: BomViewerKind;
    windchill?: BomViewerKind;
  };
  showBoth: boolean;
}) {
  const [teamPayload, setTeamPayload] =
    useState<TreeNodeData | null>(null);

  const [configPayload, setConfigPayload] =
    useState<TreeNodeData | null>(null);

  const [windchillPayload, setWindchillPayload] =
    useState<TreeNodeData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [animLevelBySource, setAnimLevelBySource] =
    useState<Record<BomSource, number>>({
      teamcenter: 0,
      configit: 0,
      windchill: 0,
    });

  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();

    let isMounted = true;

    const fetchOnce = async (
      source: "configit" | "windchill"
    ): Promise<TreeNodeData | null> => {
      const config =
        source === "windchill"
          ? sources.windchill
          : sources.configit;

      if (!config) {
        return null;
      }

      const response = await fetch(config.endpoint, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(config.emptyMessage);
      }

      const json: unknown = await response.json();

      const jsonRecord = asRecord(json);

      if (!jsonRecord) {
        return null;
      }

      return config.transformPayload(jsonRecord);
    };

    const fetchTeamcenterWithRetry =
      async (): Promise<TreeNodeData | null> => {
        const config = sources.teamcenter;

        for (
          let attempt = 0;
          attempt < TEAMCENTER_MAX_FETCH_ATTEMPTS;
          attempt += 1
        ) {
          if (!isMounted) {
            return null;
          }

          try {
            console.info(
              "[BomStreamViewer] Fetching Teamcenter BOM",
              {
                endpoint: config.endpoint,
                attempt,
              }
            );

            const response = await fetch(
              config.endpoint,
              {
                cache: "no-store",
              }
            );

            const bodyText = await response.text();

            let json: unknown = null;

            if (bodyText) {
              try {
                json = JSON.parse(bodyText);
              } catch {
                json = bodyText;
              }
            }

            console.info(
              "[BomStreamViewer] Teamcenter BOM response",
              {
                endpoint: config.endpoint,
                attempt,
                status: response.status,
                ok: response.ok,
                json,
              }
            );

            if (response.ok) {
              const jsonRecord = asRecord(json);

              if (jsonRecord) {
                const root =
                  config.transformPayload(jsonRecord);

                if (root) {
                  console.info(
                    "[BomStreamViewer] Teamcenter BOM transformed successfully",
                    {
                      endpoint: config.endpoint,
                      attempt,
                      root,
                    }
                  );

                  return root;
                }
              }

              console.info(
                "[BomStreamViewer] Teamcenter response is successful but finalBom is not ready",
                {
                  endpoint: config.endpoint,
                  attempt,
                  json,
                }
              );
            }
          } catch (teamcenterError) {
            console.warn(
              "[BomStreamViewer] Teamcenter BOM request failed",
              {
                endpoint: config.endpoint,
                attempt,
                teamcenterError,
              }
            );
          }

          const hasMoreAttempts =
            attempt <
            TEAMCENTER_MAX_FETCH_ATTEMPTS - 1;

          if (hasMoreAttempts) {
            await wait(
              TEAMCENTER_RETRY_DELAY_MS
            );
          }
        }

        return null;
      };

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        setTeamPayload(null);

        const promises: Array<
          Promise<TreeNodeData | null>
        > = [fetchTeamcenterWithRetry()];

        if (showBoth && sources.windchill) {
          promises.push(
            fetchOnce("windchill").catch(
              (windchillError) => {
                console.error(
                  "[BomStreamViewer] Windchill load failed",
                  windchillError
                );

                return null;
              }
            )
          );
        } else if (showBoth) {
          promises.push(
            fetchOnce("configit").catch(
              (configitError) => {
                console.error(
                  "[BomStreamViewer] Configit load failed",
                  configitError
                );

                return null;
              }
            )
          );
        }

        const results =
          await Promise.all(promises);

        if (!isMounted) {
          return;
        }

        const teamcenterResult =
          results[0] ?? null;

        setTeamPayload(teamcenterResult);

        if (!teamcenterResult) {
          setError(
            sources.teamcenter.emptyMessage
          );
        }

        if (
          showBoth &&
          sources.windchill
        ) {
          setWindchillPayload(
            results[1] ?? null
          );
          setConfigPayload(null);
        } else if (showBoth) {
          setConfigPayload(
            results[1] ?? null
          );
          setWindchillPayload(null);
        } else {
          setConfigPayload(null);
          setWindchillPayload(null);
        }
      } catch (runError) {
        if (!isMounted) {
          return;
        }

        setError(
          runError instanceof Error
            ? runError.message
            : "Failed to load BOM"
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [sources, showBoth]);

  const teamAnimation = useMemo(
    () =>
      teamPayload
        ? flattenLevels(teamPayload)
        : null,
    [teamPayload]
  );

  const configAnimation = useMemo(
    () =>
      configPayload
        ? flattenLevels(configPayload)
        : null,
    [configPayload]
  );

  const windchillAnimation = useMemo(
    () =>
      windchillPayload
        ? flattenLevels(windchillPayload)
        : null,
    [windchillPayload]
  );

  useEffect(() => {
    if (
      !teamAnimation &&
      !configAnimation &&
      !windchillAnimation
    ) {
      return;
    }

    const startTime =
      startedAtRef.current ?? Date.now();

    let cancelled = false;
    let frameId: number | null = null;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const elapsed =
        Date.now() - startTime;

      const revealLevel = (
        levelCount: number
      ): number => {
        return Math.min(
          levelCount - 1,
          Math.floor(elapsed / 260)
        );
      };

      let animationComplete = true;

      setAnimLevelBySource((previous) => {
        const next = {
          ...previous,
        };

        if (teamAnimation) {
          next.teamcenter = revealLevel(
            teamAnimation.levels.length
          );

          if (
            next.teamcenter <
            teamAnimation.levels.length - 1
          ) {
            animationComplete = false;
          }
        }

        if (configAnimation) {
          next.configit = revealLevel(
            configAnimation.levels.length
          );

          if (
            next.configit <
            configAnimation.levels.length - 1
          ) {
            animationComplete = false;
          }
        }

        if (windchillAnimation) {
          next.windchill = revealLevel(
            windchillAnimation.levels.length
          );

          if (
            next.windchill <
            windchillAnimation.levels.length - 1
          ) {
            animationComplete = false;
          }
        }

        return next;
      });

      if (!animationComplete) {
        frameId =
          window.requestAnimationFrame(tick);
      }
    };

    frameId =
      window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    teamAnimation,
    configAnimation,
    windchillAnimation,
  ]);

  const renderOne = (source: BomSource) => {
    const config =
      source === "teamcenter"
        ? sources.teamcenter
        : source === "windchill"
          ? sources.windchill ??
            sources.configit
          : sources.configit;

    const payload =
      source === "teamcenter"
        ? teamPayload
        : source === "windchill"
          ? windchillPayload
          : configPayload;

    const animation =
      source === "teamcenter"
        ? teamAnimation
        : source === "windchill"
          ? windchillAnimation
          : configAnimation;

    const levelLimit = animation
      ? animLevelBySource[source]
      : 0;

    const treeData: TreeNodeData[] = payload
      ? [payload]
      : [];

    const visibleIds = computeVisibleIds(
      animation,
      levelLimit
    );

    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconForSource source={source} />

            <div>
              <div className="text-sm font-semibold text-white">
                {config.title}
              </div>

              <div className="text-xs text-slate-400">
                {config.kind === "teamcenter"
                  ? "Teamcenter Structure Manager"
                  : config.kind === "windchill"
                    ? "Windchill BOM"
                    : "Configit Family → Features"}
              </div>
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
          {payload && animation ? (
            <div className="h-[54vh] min-h-[380px] overflow-auto">
              <Tree<TreeNodeData>
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
                  const isVisible =
                    visibleIds.has(
                      nodeProps.node.data.id
                    ) ||
                    nodeProps.node.isRoot;

                  return (
                    <TreeRow
                      {...nodeProps}
                      isVisible={isVisible}
                    />
                  );
                }}
              </Tree>
            </div>
          ) : (
            <div className="flex h-[54vh] min-h-[380px] items-center justify-center rounded-lg border border-dashed border-slate-700/70">
              <div className="text-center">
                <IconHierarchy className="mx-auto h-8 w-8 text-slate-500" />

                <div className="mt-3 text-sm font-medium text-slate-200">
                  {config.emptyMessage}
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  Waiting for extracted JSON.
                </div>
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {showBoth ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderOne("teamcenter")}

          {sources.windchill
            ? renderOne("windchill")
            : renderOne("configit")}
        </div>
      ) : (
        renderOne("teamcenter")
      )}

      {(loading ||
        Boolean(
          teamPayload && teamAnimation
        ) ||
        Boolean(
          configPayload && configAnimation
        ) ||
        Boolean(
          windchillPayload &&
            windchillAnimation
        )) && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-4">
          <IconLayoutKanban className="mt-0.5 h-5 w-5 text-slate-400" />

          <div>
            <div className="text-sm font-medium text-white">
              Live BOM stream
            </div>

            <div className="text-xs text-slate-400">
              The backend JSON is already generated;
              the UI reveals it progressively to match
              an enterprise PLM experience.
            </div>
          </div>
        </div>
      )}

      <AnimatePresence />
    </div>
  );
}
