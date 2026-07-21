"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ElementRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Billboard,
  GizmoHelper,
  GizmoViewport,
  Line as ThreeLine,
  OrbitControls,
  Text,
} from "@react-three/drei";
import {
  IconArrowsMaximize,
  IconBookmark,
  IconClipboard,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFocus2,
  IconInfoCircle,
  IconRefresh,
  IconRotate3d,
  IconX,
} from "@tabler/icons-react";
import * as THREE from "three";

import {
  buildVisualBomGraph,
  relationshipState,
} from "@/lib/bom-visualization";
import {
  buildFindings,
  layoutThreeBom,
  mixPosition,
  structuralHealth,
} from "@/lib/bom-three-layout";
import type {
  ComparisonStatus,
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type {
  CameraPreset,
  PositionedThreeBomNode,
  SavedViewpoint,
  ThreeAnalysisMode,
  ThreePosition,
} from "@/types/bom-three";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

const roleColors = {
  root: "#06b6d4",
  assembly: "#6366f1",
  subassembly: "#8b5cf6",
  component: "#64748b",
};
const statusColors: Record<ComparisonStatus, string> = {
  matched: "#10b981",
  changed: "#f59e0b",
  missing: "#f43f5e",
  "source-only": "#0ea5e9",
  probable: "#8b5cf6",
};
const analysisModes: Array<{ value: ThreeAnalysisMode; label: string }> = [
  { value: "structure", label: "Structure" },
  { value: "quantity", label: "Quantity" },
  { value: "comparison", label: "Comparison" },
  { value: "complexity", label: "Complexity" },
  { value: "impact", label: "Impact" },
];

export function BomThreeUniverseView({
  root,
  source,
  comparison,
  search,
  selectedId,
  onSelect,
  onFullScreen,
}: {
  root: TreeNodeData;
  source: SourceType;
  comparison?: Record<string, NodeComparison>;
  search: string;
  selectedId?: string;
  onSelect: (node: TreeNodeData) => void;
  onFullScreen: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [explosion, setExplosion] = useState(0);
  const [labels, setLabels] = useState(true);
  const [mode, setMode] = useState<ThreeAnalysisMode>("structure");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ preset: CameraPreset; tick: number }>({
    preset: "home",
    tick: 0,
  });
  const [showInsights, setShowInsights] = useState(true);
  const [savedViews, setSavedViews] = useState<SavedViewpoint[]>([]);

  const graph = useMemo(
    () => buildVisualBomGraph(root, source, comparison),
    [root, source, comparison],
  );
  const layout = useMemo(() => layoutThreeBom(graph), [graph]);
  const health = useMemo(
    () => structuralHealth(graph, comparison),
    [graph, comparison],
  );
  const findings = useMemo(
    () => buildFindings(graph, comparison),
    [graph, comparison],
  );
  const visibleIds = useMemo(() => {
    if (!isolatedId) return new Set(graph.nodes.map((n) => n.id));
    const ids = new Set<string>();
    const visit = (id: string) => {
      ids.add(id);
      for (const child of graph.byId[id]?.childIds ?? []) visit(child);
    };
    visit(isolatedId);
    return ids;
  }, [graph, isolatedId]);
  const searchMatchId = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (
      graph.nodes.find((n) =>
        `${n.name} ${n.itemId ?? ""} ${n.path.join(" ")}`
          .toLowerCase()
          .includes(q),
      )?.id ?? null
    );
  }, [graph, search]);
  const effectiveSelectedId = selectedId ?? searchMatchId ?? undefined;
  const activeId = hoveredId ?? effectiveSelectedId;
  const activeNode = activeId ? graph.byId[activeId] : undefined;

  useEffect(() => {
    const preventNativeDrag = (event: DragEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("dragstart", preventNativeDrag, true);
    return () =>
      window.removeEventListener("dragstart", preventNativeDrag, true);
  }, []);
  useEffect(() => {
    try {
      setSavedViews(
        JSON.parse(
          localStorage.getItem("bom-three-viewpoints") ?? "[]",
        ) as SavedViewpoint[],
      );
    } catch {
      setSavedViews([]);
    }
  }, []);
  useEffect(() => {
    if (searchMatchId)
      setCamera((v) => ({ preset: "selection", tick: v.tick + 1 }));
  }, [searchMatchId]);

  const focusNode = (nodeId: string) => {
    const raw = findNode(root, nodeId);
    if (raw) onSelect(raw);
    setCamera((v) => ({ preset: "selection", tick: v.tick + 1 }));
  };
  const saveViewpoint = () => {
    const name = activeNode?.name
      ? `${activeNode.name} · ${mode}`
      : `BOM ${mode} view`;
    const next = [
      ...savedViews,
      {
        id: crypto.randomUUID(),
        name,
        nodeId: activeNode?.id,
        mode,
        explosion,
        createdAt: new Date().toISOString(),
      },
    ].slice(-8);
    setSavedViews(next);
    localStorage.setItem("bom-three-viewpoints", JSON.stringify(next));
  };
  const restoreViewpoint = (view: SavedViewpoint) => {
    setMode(view.mode);
    setExplosion(view.explosion);
    if (view.nodeId) focusNode(view.nodeId);
    else setCamera((v) => ({ preset: "home", tick: v.tick + 1 }));
  };
  const analysisPayload = () => ({
    source,
    mode,
    selected: activeNode?.name,
    path: activeNode?.path,
    health: {
      largestBranch: health.largest?.name,
      deepestComponent: health.deepest?.name,
      missingIdentifiers: health.missingIds,
      changed: health.changed,
      unresolved: health.unresolved,
    },
    findings,
  });
  const copyAnalysis = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(analysisPayload(), null, 2),
    );
  };
  const downloadAnalysis = () => {
    const blob = new Blob([JSON.stringify(analysisPayload(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${source}-bom-3d-analysis.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const blockDrag = (event: ReactDragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={wrapperRef}
      draggable={false}
      onDragStart={blockDrag}
      onDragStartCapture={blockDrag}
      className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white"
      style={{
        height: "clamp(620px, 74vh, 850px)",
        minHeight: 620,
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
    >
      {/* <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-950/92 px-3 py-2 shadow-xl backdrop-blur">
          <p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-400">
            3D BOM Intelligence Universe
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            LMB rotate · RMB pan · wheel zoom · double-click isolate
          </p>
        </div>
        <div className="pointer-events-auto flex rounded-xl border border-slate-700 bg-slate-950/92 p-1 shadow-xl backdrop-blur">
          <Control
            label="Home"
            onClick={() => {
              setIsolatedId(null);
              setCamera((v) => ({ preset: "home", tick: v.tick + 1 }));
            }}
          >
            <IconRefresh />
          </Control>
          <Control
            label="Fit selected"
            onClick={() =>
              setCamera((v) => ({ preset: "selection", tick: v.tick + 1 }))
            }
          >
            <IconFocus2 />
          </Control>
          <Control
            label={labels ? "Hide labels" : "Show labels"}
            onClick={() => setLabels((v) => !v)}
          >
            {labels ? <IconEyeOff /> : <IconEye />}
          </Control>
          <Control label="Save viewpoint" onClick={saveViewpoint}>
            <IconBookmark />
          </Control>
          <Control label="Copy analysis" onClick={() => void copyAnalysis()}>
            <IconClipboard />
          </Control>
          <Control label="Download analysis" onClick={downloadAnalysis}>
            <IconDownload />
          </Control>
          <Control label="Full screen" onClick={onFullScreen}>
            <IconArrowsMaximize />
          </Control>
        </div>
      </div> */}

      {/* <div className="pointer-events-auto absolute left-3 top-[76px] z-30 flex flex-wrap gap-1 rounded-xl border border-slate-700 bg-slate-950/92 p-1.5 backdrop-blur">
        {analysisModes.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={
              mode === item.value
                ? "rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[9px] font-semibold text-white"
                : "rounded-lg px-2.5 py-1.5 text-[9px] text-slate-500 hover:bg-slate-800 hover:text-white"
            }
          >
            {item.label}
          </button>
        ))}
      </div> */}

      {isolatedId ? (
        <div className="absolute left-3 top-[122px] z-30 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
          <span>Isolated: {graph.byId[isolatedId]?.path.join(" / ")}</span>
          <button
            type="button"
            onClick={() => {
              setIsolatedId(null);
              setCamera((v) => ({ preset: "home", tick: v.tick + 1 }));
            }}
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <WebGLErrorBoundary>
        <Canvas
          camera={{
            position: [0, 7, Math.max(22, layout.maxExtent * 1.35)],
            fov: 46,
            near: 0.1,
            far: 1000,
          }}
          dpr={[1, 1.6]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.setClearColor("#020617");
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.domElement.draggable = false;
            gl.domElement.setAttribute("draggable", "false");
            gl.domElement.style.userSelect = "none";
            gl.domElement.style.webkitUserSelect = "none";
            gl.domElement.style.touchAction = "none";
            gl.domElement.addEventListener(
              "dragstart",
              (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
              },
              true,
            );
          }}
        >
          <Suspense fallback={null}>
            <UniverseScene
              graph={graph}
              layout={layout}
              visibleIds={visibleIds}
              explosion={explosion}
              labels={labels}
              mode={mode}
              selectedId={effectiveSelectedId}
              hoveredId={hoveredId}
              cameraCommand={camera}
              comparison={comparison}
              onHover={setHoveredId}
              onSelect={focusNode}
              onIsolate={(id) => {
                setIsolatedId(id === graph.rootId ? null : id);
                setCamera((v) => ({ preset: "selection", tick: v.tick + 1 }));
              }}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>

      {/* <div className="absolute bottom-3 left-3 z-30 w-[250px] rounded-xl border border-slate-700 bg-slate-950/92 p-3 backdrop-blur">
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <IconRotate3d className="h-4 w-4 text-cyan-400" />
            Explosion
          </span>
          <span>{Math.round(explosion * 100)}%</span>
        </div>
        <input
          aria-label="Exploded separation"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={explosion}
          onChange={(e) => setExplosion(Number(e.target.value))}
          className="mt-2 w-full accent-cyan-500"
        />
        <div className="mt-1 flex justify-between text-[8px] uppercase text-slate-600">
          <span>Compact</span>
          <span>Exploded</span>
        </div>
      </div> */}

      {/* <div className="absolute bottom-3 left-[270px] z-30 flex rounded-xl border border-slate-700 bg-slate-950/92 p-1 backdrop-blur">
        {(["front", "top", "side"] as CameraPreset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setCamera((v) => ({ preset, tick: v.tick + 1 }))}
            className="rounded-lg px-2.5 py-1.5 text-[9px] capitalize text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            {preset}
          </button>
        ))}
      </div> */}

      {showInsights ? (
        <IntelligenceRail
          graph={graph}
          health={health}
          findings={findings}
          activeNode={activeNode}
          comparison={activeNode ? comparison?.[activeNode.id] : undefined}
          savedViews={savedViews}
          onFinding={focusNode}
          onRestore={restoreViewpoint}
          onClose={() => setShowInsights(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowInsights(true)}
          className="absolute top-3 right-3 z-30 rounded-xl border border-slate-700 bg-slate-950/92 px-3 py-2 text-[10px] text-cyan-300"
        >
          <IconInfoCircle stroke={2} />
        </button>
      )}
    </div>
  );
}

function UniverseScene({
  graph,
  layout,
  visibleIds,
  explosion,
  labels,
  mode,
  selectedId,
  hoveredId,
  cameraCommand,
  comparison,
  onHover,
  onSelect,
  onIsolate,
}: {
  graph: VisualBomGraph;
  layout: ReturnType<typeof layoutThreeBom>;
  visibleIds: Set<string>;
  explosion: number;
  labels: boolean;
  mode: ThreeAnalysisMode;
  selectedId?: string;
  hoveredId: string | null;
  cameraCommand: { preset: CameraPreset; tick: number };
  comparison?: Record<string, NodeComparison>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onIsolate: (id: string) => void;
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const relationship = useMemo(
    () => relationshipState(graph, selectedId ?? null),
    [graph, selectedId],
  );
  const positions = useMemo(
    () =>
      Object.fromEntries(
        layout.nodes.map((n) => [
          n.id,
          mixPosition(n.compactPosition, n.explodedPosition, explosion),
        ]),
      ),
    [layout, explosion],
  );
  return (
    <>
      <ambientLight intensity={0.82} />
      <directionalLight
        position={[10, 14, 12]}
        intensity={2.2}
        color="#dbeafe"
      />
      <pointLight
        position={[-12, -6, -12]}
        intensity={45}
        color="#22d3ee"
        distance={60}
      />
      <fog attach="fog" args={["#020617", 48, 118]} />
      <gridHelper
        args={[120, 40, "#164e63", "#0f172a"]}
        position={[0, -15, 0]}
      />
      <CameraDirector
        controlsRef={controlsRef}
        command={cameraCommand}
        selectedId={selectedId}
        positions={positions}
        maxExtent={layout.maxExtent}
      />
      {graph.edges.map((edge) => {
        if (!visibleIds.has(edge.sourceId) || !visibleIds.has(edge.targetId))
          return null;
        const a = positions[edge.sourceId],
          b = positions[edge.targetId];
        if (!a || !b) return null;
        const ancestor =
          !!selectedId &&
          relationship.ancestorIds.has(edge.sourceId) &&
          (relationship.ancestorIds.has(edge.targetId) ||
            edge.targetId === selectedId);
        const descendant =
          !!selectedId &&
          (edge.sourceId === selectedId ||
            relationship.descendantIds.has(edge.sourceId)) &&
          relationship.descendantIds.has(edge.targetId);
        const related = !selectedId || ancestor || descendant;
        const color = ancestor
          ? "#f59e0b"
          : descendant
            ? "#10b981"
            : edge.comparisonStatus
              ? statusColors[edge.comparisonStatus]
              : "#38bdf8";
        return (
          <ThreeLine
            key={edge.id}
            points={[a, b]}
            color={color}
            lineWidth={ancestor || descendant ? 2.5 : 1}
            transparent
            opacity={related ? 0.75 : 0.05}
          />
        );
      })}
      {layout.nodes.map((node) => {
        if (!visibleIds.has(node.id)) return null;
        const related =
          !selectedId ||
          node.id === selectedId ||
          relationship.ancestorIds.has(node.id) ||
          relationship.descendantIds.has(node.id) ||
          relationship.siblingIds.has(node.id);
        return (
          <ThreeNode
            key={node.id}
            node={node}
            position={positions[node.id]}
            selected={node.id === selectedId}
            hovered={node.id === hoveredId}
            related={related}
            showLabel={labels}
            mode={mode}
            comparison={comparison?.[node.id]}
            onHover={onHover}
            onSelect={onSelect}
            onIsolate={onIsolate}
          />
        );
      })}
      <GizmoHelper alignment="bottom-right" margin={[88, 88]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="white"
        />
      </GizmoHelper>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableRotate
        enableZoom
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        minDistance={5}
        maxDistance={180}
        zoomSpeed={0.75}
        panSpeed={0.9}
        rotateSpeed={0.55}
      />
    </>
  );
}

function ThreeNode({
  node,
  position,
  selected,
  hovered,
  related,
  showLabel,
  mode,
  comparison,
  onHover,
  onSelect,
  onIsolate,
}: {
  node: PositionedThreeBomNode;
  position: ThreePosition;
  selected: boolean;
  hovered: boolean;
  related: boolean;
  showLabel: boolean;
  mode: ThreeAnalysisMode;
  comparison?: NodeComparison;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onIsolate: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const quantity = Math.max(1, Number.parseFloat(node.quantity ?? "1") || 1);
  const base = node.isRoot ? 1.15 : node.isAssembly ? 0.82 : 0.56;
  const radius =
    mode === "quantity"
      ? base * Math.min(2, 1 + Math.log2(quantity) * 0.18)
      : mode === "complexity"
        ? base * Math.min(1.9, 1 + node.complexityScore * 0.018)
        : base;
  const role = node.isRoot
    ? roleColors.root
    : node.isAssembly
      ? node.level === 1
        ? roleColors.assembly
        : roleColors.subassembly
      : roleColors.component;
  const color =
    mode === "comparison" && comparison
      ? statusColors[comparison.status]
      : mode === "complexity"
        ? complexityColor(node.complexityScore)
        : mode === "impact" && selected
          ? "#ffffff"
          : role;
  useFrame((_, delta) => {
    if (!ref.current) return;
    const scale = selected ? 1.28 : hovered ? 1.14 : 1;
    ref.current.scale.lerp(
      new THREE.Vector3(scale, scale, scale),
      Math.min(1, delta * 10),
    );
    ref.current.position.lerp(
      new THREE.Vector3(...position),
      Math.min(1, delta * 8),
    );
  });
  const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.stopPropagation();
  return (
    <group ref={ref} position={position}>
      <mesh
        onPointerOver={(e) => {
          stop(e);
          document.body.style.cursor = "pointer";
          onHover(node.id);
        }}
        onPointerOut={(e) => {
          stop(e);
          document.body.style.cursor = "default";
          onHover(null);
        }}
        onClick={(e) => {
          stop(e);
          onSelect(node.id);
        }}
        onDoubleClick={(e) => {
          stop(e);
          if (node.isAssembly) onIsolate(node.id);
        }}
      >
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || hovered ? 0.65 : 0.18}
          roughness={0.3}
          metalness={0.32}
          transparent
          opacity={related ? 1 : 0.1}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius + 0.1, 24, 18]} />
        <meshBasicMaterial
          color={comparison ? statusColors[comparison.status] : "#94a3b8"}
          wireframe
          transparent
          opacity={selected ? 0.95 : comparison ? 0.62 : 0.16}
        />
      </mesh>
      {showLabel && related ? (
        <Billboard position={[0, radius + 0.68, 0]} follow>
          <Text
            fontSize={node.isRoot ? 0.5 : 0.35}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor="#020617"
            maxWidth={5}
          >
            {shortLabel(node.name, 28)}
          </Text>
          <Text
            position={[0, -0.42, 0]}
            fontSize={0.22}
            color="#67e8f9"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor="#020617"
          >{`L${node.level + 1}${node.itemId ? ` · ${node.itemId}` : ""}`}</Text>
        </Billboard>
      ) : null}
    </group>
  );
}

function CameraDirector({
  controlsRef,
  command,
  selectedId,
  positions,
  maxExtent,
}: {
  controlsRef: RefObject<ElementRef<typeof OrbitControls> | null>;
  command: { preset: CameraPreset; tick: number };
  selectedId?: string;
  positions: Record<string, ThreePosition>;
  maxExtent: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = selectedId ? positions[selectedId] : undefined;
    const d = Math.max(22, maxExtent * 1.35);
    let pos: ThreePosition = [0, Math.max(7, maxExtent * 0.25), d];
    let look: ThreePosition = [0, 0, 0];
    if (command.preset === "front") pos = [0, 0, d];
    else if (command.preset === "top") pos = [0, d, 0.01];
    else if (command.preset === "side") pos = [d, 0, 0];
    else if (command.preset === "selection" && target) {
      look = target;
      const v = new THREE.Vector3(...target);
      const dir =
        v.lengthSq() > 0.01
          ? v.clone().normalize()
          : new THREE.Vector3(0.5, 0.35, 1).normalize();
      const p = v.clone().add(dir.multiplyScalar(8));
      pos = [p.x, p.y, p.z];
    }
    camera.position.set(...pos);
    controls.target.set(...look);
    controls.update();
  }, [camera, command, controlsRef, maxExtent, positions, selectedId]);
  return null;
}

function IntelligenceRail({
  graph,
  health,
  findings,
  activeNode,
  comparison,
  savedViews,
  onFinding,
  onRestore,
  onClose,
}: {
  graph: VisualBomGraph;
  health: ReturnType<typeof structuralHealth>;
  findings: ReturnType<typeof buildFindings>;
  activeNode?: VisualBomNode;
  comparison?: NodeComparison;
  savedViews: SavedViewpoint[];
  onFinding: (id: string) => void;
  onRestore: (v: SavedViewpoint) => void;
  onClose: () => void;
}) {
  const parent = activeNode?.parentId
    ? graph.byId[activeNode.parentId]
    : undefined;
  return (
    <aside className="absolute bottom-3 right-3 top-[76px] z-30 w-[330px] overflow-auto rounded-2xl border border-slate-700 bg-slate-950/94 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-400">
          BOM intelligence
        </p>
        <button type="button" onClick={onClose}>
          <IconX className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric value={health.changed} label="Changed" />
        <Metric value={health.unresolved} label="Unresolved" />
        <Metric value={health.missingIds} label="No ID" />
      </div>
      <Section title="Structural health">
        <InfoLine label="Largest" value={health.largest?.name ?? "None"} />
        <InfoLine label="Deepest" value={health.deepest?.name ?? "None"} />
        <InfoLine label="Levels" value={String(graph.maxLevel + 1)} />
      </Section>
      {activeNode ? (
        <Section title="Selected branch">
          <h3 className="text-sm font-semibold text-white">
            {activeNode.name}
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            {activeNode.path.join(" › ")}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric value={activeNode.childIds.length} label="Children" />
            <Metric value={activeNode.descendantCount} label="Below" />
            <Metric value={activeNode.leafCount} label="Leaves" />
          </div>
          <div className="mt-3 text-[10px] leading-5 text-slate-400">
            <p>Parent: {parent?.name ?? "None"}</p>
            <p>Quantity: {activeNode.quantity ?? "Not provided"}</p>
            {comparison ? (
              <>
                <p className="mt-2 text-white">
                  {comparison.status} ·{" "}
                  {Math.round(comparison.confidence * 100)}%
                </p>
                <p>{comparison.reasoning.summary}</p>
                {comparison.reasoning.details.slice(0, 3).map((d) => (
                  <p key={d}>• {d}</p>
                ))}
              </>
            ) : null}
          </div>
        </Section>
      ) : null}
      <Section title="Attention required">
        <div className="space-y-2">
          {findings.length ? (
            findings.slice(0, 6).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFinding(f.nodeId)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left hover:border-cyan-500/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${f.severity === "high" ? "bg-rose-500" : f.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`}
                  />
                  <b className="text-[10px] text-slate-200">{f.title}</b>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-slate-500">
                  {f.detail}
                </p>
              </button>
            ))
          ) : (
            <p className="text-[10px] text-emerald-400">
              No priority findings detected.
            </p>
          )}
        </div>
      </Section>
      {savedViews.length ? (
        <Section title="Saved viewpoints">
          <div className="space-y-1">
            {savedViews.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onRestore(v)}
                className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                {v.name}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </aside>
  );
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm font-semibold text-white">
            3D rendering unavailable
          </p>
          <p className="mt-2 text-xs text-slate-500">
            WebGL could not initialize. Return to Tree or Constellation.
          </p>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Control({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
    >
      {children}
    </button>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-slate-800 pt-3">
      <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[.15em] text-slate-600">
        {title}
      </h4>
      {children}
    </section>
  );
}
function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
      <b className="block text-sm text-white">{value}</b>
      <span className="text-[8px] uppercase text-slate-600">{label}</span>
    </div>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-slate-900 py-1 text-[10px]">
      <span className="w-16 text-slate-600">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}
function findNode(root: TreeNodeData, id: string): TreeNodeData | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
function shortLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function complexityColor(score: number) {
  if (score > 30) return "#f43f5e";
  if (score > 15) return "#f59e0b";
  if (score > 7) return "#eab308";
  return "#22c55e";
}
