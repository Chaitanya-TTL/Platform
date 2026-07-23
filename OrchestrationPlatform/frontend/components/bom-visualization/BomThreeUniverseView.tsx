"use client";
import {
  Component,
  Suspense,
  useMemo,
  useRef,
  useState,
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
import { IconArrowsMaximize, IconInfoCircle, IconX } from "@tabler/icons-react";
import * as THREE from "three";
import { RequirementSnapshotCard } from "@/components/bom-requirements/RequirementSnapshotCard";
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
  ThreeAnalysisMode,
  ThreePosition,
} from "@/types/bom-three";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";
import type { RequirementTraceResult } from "@/types/requirement-trace";
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
export function BomThreeUniverseView({
  root,
  source,
  comparison,
  search,
  selectedId,
  onSelect,
  onFullScreen,
  requirementTraceEnabled = false,
  requirementResult,
}: {
  root: TreeNodeData;
  source: SourceType;
  comparison?: Record<string, NodeComparison>;
  search: string;
  selectedId?: string;
  onSelect: (node: TreeNodeData) => void;
  onFullScreen: () => void;
  requirementTraceEnabled?: boolean;
  requirementResult?: RequirementTraceResult | null;
}) {
  const [explosion] = useState(0),
    [labels] = useState(true),
    [mode] = useState<ThreeAnalysisMode>("structure"),
    [hovered, setHovered] = useState<string | null>(null),
    [isolated, setIsolated] = useState<string | null>(null),
    [camera, setCamera] = useState<{ preset: CameraPreset; tick: number }>({
      preset: "home",
      tick: 0,
    }),
    [insights, setInsights] = useState(true);
  const graph = useMemo(
      () => buildVisualBomGraph(root, source, comparison),
      [root, source, comparison],
    ),
    layout = useMemo(() => layoutThreeBom(graph), [graph]),
    health = useMemo(
      () => structuralHealth(graph, comparison),
      [graph, comparison],
    ),
    findings = useMemo(
      () => buildFindings(graph, comparison),
      [graph, comparison],
    ),
    visibleIds = useMemo(() => {
      if (!isolated) return new Set(graph.nodes.map((node) => node.id));
      const ids = new Set<string>();
      const visit = (id: string) => {
        ids.add(id);
        for (const child of graph.byId[id]?.childIds ?? []) visit(child);
      };
      visit(isolated);
      return ids;
    }, [graph, isolated]),
    searchMatch = useMemo(() => {
      const q = search.trim().toLowerCase();
      return q
        ? (graph.nodes.find((node) =>
            `${node.name} ${node.itemId ?? ""} ${node.path.join(" ")}`
              .toLowerCase()
              .includes(q),
          )?.id ?? null)
        : null;
    }, [graph, search]),
    effective = selectedId ?? searchMatch ?? undefined,
    active = hovered ?? effective,
    activeNode = active ? graph.byId[active] : undefined;
  const focus = (id: string) => {
    const raw = findNode(root, id);
    if (raw) onSelect(raw);
    setCamera((value) => ({ preset: "selection", tick: value.tick + 1 }));
  };
  return (
    <div
      className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white"
      style={{
        height: "clamp(620px,74vh,850px)",
        minHeight: 620,
        touchAction: "none",
      }}
    >
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
            gl.domElement.style.touchAction = "none";
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
              selectedId={effective}
              hoveredId={hovered}
              cameraCommand={camera}
              comparison={comparison}
              requirementTraceEnabled={requirementTraceEnabled}
              onHover={setHovered}
              onSelect={focus}
              onIsolate={(id) => {
                setIsolated(id === graph.rootId ? null : id);
                setCamera((value) => ({
                  preset: "selection",
                  tick: value.tick + 1,
                }));
              }}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>
      {requirementTraceEnabled && requirementResult ? (
        <RequirementSnapshotCard
          result={requirementResult}
          className="absolute left-5 top-5 z-40"
        />
      ) : null}
      <button
        type="button"
        onClick={onFullScreen}
        className="absolute bottom-4 left-4 z-30 rounded-xl border border-slate-700 bg-slate-950/90 p-2 text-slate-400 hover:text-white"
        aria-label="Full screen"
      >
        <IconArrowsMaximize className="h-4 w-4" />
      </button>
      {insights ? (
        <IntelligenceRail
          graph={graph}
          health={health}
          findings={findings}
          activeNode={activeNode}
          comparison={activeNode ? comparison?.[activeNode.id] : undefined}
          onFinding={focus}
          onClose={() => setInsights(false)}
        />
      ) : (
        <button
          onClick={() => setInsights(true)}
          className="absolute right-3 top-3 z-30 rounded-xl border border-slate-700 bg-slate-950/92 p-2 text-cyan-300"
        >
          <IconInfoCircle />
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
  requirementTraceEnabled,
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
  requirementTraceEnabled: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onIsolate: (id: string) => void;
}) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null),
    relationship = useMemo(
      () => relationshipState(graph, selectedId ?? null),
      [graph, selectedId],
    ),
    positions = useMemo(
      () =>
        Object.fromEntries(
          layout.nodes.map((node) => [
            node.id,
            mixPosition(node.compactPosition, node.explodedPosition, explosion),
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
        controlsRef={controls}
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
              edge.targetId === selectedId),
          descendant =
            !!selectedId &&
            (edge.sourceId === selectedId ||
              relationship.descendantIds.has(edge.sourceId)) &&
            relationship.descendantIds.has(edge.targetId),
          related = !selectedId || ancestor || descendant,
          color = ancestor
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
            traceSelected={requirementTraceEnabled && node.id === selectedId}
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
        ref={controls}
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
        minDistance={5}
        maxDistance={180}
      />
    </>
  );
}
function ThreeNode({
  node,
  position,
  selected,
  traceSelected,
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
  traceSelected: boolean;
  hovered: boolean;
  related: boolean;
  showLabel: boolean;
  mode: ThreeAnalysisMode;
  comparison?: NodeComparison;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onIsolate: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null),
    pulse = useRef<THREE.Mesh>(null),
    quantity = Math.max(1, Number.parseFloat(node.quantity ?? "1") || 1),
    base = node.isRoot ? 1.15 : node.isAssembly ? 0.82 : 0.56,
    radius =
      mode === "quantity"
        ? base * Math.min(2, 1 + Math.log2(quantity) * 0.18)
        : mode === "complexity"
          ? base * Math.min(1.9, 1 + node.complexityScore * 0.018)
          : base,
    role = node.isRoot
      ? roleColors.root
      : node.isAssembly
        ? node.level === 1
          ? roleColors.assembly
          : roleColors.subassembly
        : roleColors.component,
    color =
      mode === "comparison" && comparison
        ? statusColors[comparison.status]
        : role;
  useFrame(({ clock }, delta) => {
    if (ref.current) {
      const scale = selected ? 1.28 : hovered ? 1.14 : 1;
      ref.current.scale.lerp(
        new THREE.Vector3(scale, scale, scale),
        Math.min(1, delta * 10),
      );
      ref.current.position.lerp(
        new THREE.Vector3(...position),
        Math.min(1, delta * 8),
      );
    }
    if (pulse.current && traceSelected) {
      const scale = 1.1 + (Math.sin(clock.elapsedTime * 3) + 1) * 0.18;
      pulse.current.scale.setScalar(scale);
      const material = pulse.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.15 + (Math.sin(clock.elapsedTime * 3) + 1) * 0.18;
    }
  });
  const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.stopPropagation();
  return (
    <group ref={ref} position={position}>
      <mesh
        onPointerOver={(event) => {
          stop(event);
          document.body.style.cursor = "pointer";
          onHover(node.id);
        }}
        onPointerOut={(event) => {
          stop(event);
          document.body.style.cursor = "default";
          onHover(null);
        }}
        onClick={(event) => {
          stop(event);
          onSelect(node.id);
        }}
        onDoubleClick={(event) => {
          stop(event);
          if (node.isAssembly) onIsolate(node.id);
        }}
      >
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={traceSelected ? "#8b5cf6" : color}
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
      {traceSelected ? (
        <mesh ref={pulse}>
          <sphereGeometry args={[radius + 0.28, 32, 24]} />
          <meshBasicMaterial
            color="#a78bfa"
            wireframe
            transparent
            opacity={0.35}
          />
        </mesh>
      ) : null}
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
            color={traceSelected ? "#c4b5fd" : "#67e8f9"}
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
  useMemo(() => null, []);
  useFrame(() => {});
  const last = useRef(-1);
  useFrame(() => {
    if (last.current === command.tick) return;
    last.current = command.tick;
    const controls = controlsRef.current;
    if (!controls) return;
    const target = selectedId ? positions[selectedId] : undefined,
      d = Math.max(22, maxExtent * 1.35);
    let pos: ThreePosition = [0, Math.max(7, maxExtent * 0.25), d],
      look: ThreePosition = [0, 0, 0];
    if (command.preset === "selection" && target) {
      look = target;
      const v = new THREE.Vector3(...target),
        direction =
          v.lengthSq() > 0.01
            ? v.clone().normalize()
            : new THREE.Vector3(0.5, 0.35, 1).normalize(),
        point = v.clone().add(direction.multiplyScalar(8));
      pos = [point.x, point.y, point.z];
    }
    camera.position.set(...pos);
    controls.target.set(...look);
    controls.update();
  });
  return null;
}
function IntelligenceRail({
  graph,
  health,
  findings,
  activeNode,
  comparison,
  onFinding,
  onClose,
}: {
  graph: VisualBomGraph;
  health: ReturnType<typeof structuralHealth>;
  findings: ReturnType<typeof buildFindings>;
  activeNode?: VisualBomNode;
  comparison?: NodeComparison;
  onFinding: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute bottom-3 right-3 top-[76px] z-30 w-[330px] overflow-auto rounded-2xl border border-slate-700 bg-slate-950/94 p-4 shadow-2xl">
      <div className="flex justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-400">
          BOM intelligence
        </p>
        <button onClick={onClose}>
          <IconX className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric value={health.changed} label="Changed" />
        <Metric value={health.unresolved} label="Unresolved" />
        <Metric value={health.missingIds} label="No ID" />
      </div>
      {activeNode ? (
        <Section title="Selected branch">
          <h3 className="text-sm font-semibold">{activeNode.name}</h3>
          <p className="mt-1 text-[10px] text-slate-500">
            {activeNode.path.join(" › ")}
          </p>
          {comparison ? (
            <p className="mt-3 text-[10px] text-slate-300">
              {comparison.status} · {Math.round(comparison.confidence * 100)}%
            </p>
          ) : null}
        </Section>
      ) : null}
      <Section title="Attention required">
        <div className="space-y-2">
          {findings.slice(0, 6).map((finding) => (
            <button
              key={finding.id}
              onClick={() => onFinding(finding.nodeId)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left"
            >
              <b className="text-[10px]">{finding.title}</b>
              <p className="mt-1 text-[9px] text-slate-500">{finding.detail}</p>
            </button>
          ))}
        </div>
      </Section>
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
      <div className="flex h-full items-center justify-center text-center">
        <p>3D rendering unavailable. Return to Tree or Constellation.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-slate-800 pt-3">
      <h4 className="mb-2 text-[9px] font-bold uppercase text-slate-600">
        {title}
      </h4>
      {children}
    </section>
  );
}
function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
      <b className="block text-sm">{value}</b>
      <span className="text-[8px] uppercase text-slate-600">{label}</span>
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
