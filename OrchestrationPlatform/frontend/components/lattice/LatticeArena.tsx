"use client";
import { memo, Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, GizmoHelper, GizmoViewport, Line, OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { EnterpriseSource, SourceSearchResult } from "@/types/item-explorer";
import type { LatticeInspectorTarget } from "@/types/lattice";
import { latticeSourceMeta, latticeSources } from "@/lib/lattice/source-meta";

const positions: Record<EnterpriseSource, [number, number, number]> = {
  teamcenter: [-8.2, 4.8, -1.4], windchill: [8.2, 4.8, -1.4], sap: [8.2, -4.8, -1.4], configit: [-8.2, -4.8, -1.4],
};

type Props = {
  results: SourceSearchResult[];
  selected: Partial<Record<EnterpriseSource, string>>;
  centerLabel: string;
  active: LatticeInspectorTarget;
  reducedMotion: boolean;
  onInspect: (target: LatticeInspectorTarget) => void;
  onFitReady: (fit: () => void) => void;
};

export function LatticeArena(props: Props) {
  return <Canvas camera={{ position: [0, 0, 24], fov: 44, near: .1, far: 200 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}>
    <Suspense fallback={null}><Scene {...props}/></Suspense>
  </Canvas>;
}

function Scene({ results, selected, centerLabel, active, reducedMotion, onInspect, onFitReady }: Props) {
  const controls = useRef<any>(null);
  const bySource = useMemo(() => Object.fromEntries(results.map((item) => [item.source, item])) as Partial<Record<EnterpriseSource, SourceSearchResult>>, [results]);
  const fit = () => {
    if (!controls.current) return;
    controls.current.target.set(0, 0, 0);
    controls.current.object.position.set(0, 0, 24);
    controls.current.update();
  };
  onFitReady(fit);
  return <>
    <color attach="background" args={["#020817"]}/><fog attach="fog" args={["#020817", 28, 72]}/>
    <ambientLight intensity={.9}/><directionalLight position={[6, 12, 10]} intensity={2}/><pointLight position={[0, 0, 6]} color="#22d3ee" intensity={34} distance={40}/>
    <gridHelper args={[70, 70, "#123047", "#081827"]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -6]}/>
    {[4.2, 7.2, 10.4].map((radius) => <Ring key={radius} radius={radius}/>)}
    {latticeSources.map((source) => {
      const result = bySource[source];
      const position = positions[source];
      const status = result?.status ?? "idle";
      const connected = Boolean(selected[source]);
      return <group key={source}>
        <Connection start={[0,0,0]} end={position} color={stateColor(source, status, connected)} active={status === "searching" || connected} reducedMotion={reducedMotion}/>
        <SourceNode source={source} position={position} result={result} selected={connected} active={active?.kind === "source" && active.source === source} reducedMotion={reducedMotion} onClick={() => onInspect({ kind: "source", source })}/>
        {(result?.candidates ?? []).slice(0, 4).map((candidate, index) => <CandidateSatellite key={candidate.candidateId} source={source} position={position} index={index} count={Math.min(result?.candidates.length ?? 0, 4)} selected={selected[source] === candidate.candidateId}/>) }
      </group>;
    })}
    <CentralNode label={centerLabel} active={active?.kind === "item"} onClick={() => onInspect({ kind: "item" })}/>
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} minDistance={12} maxDistance={42} maxPolarAngle={Math.PI * .7} minPolarAngle={Math.PI * .3}/>
    <GizmoHelper alignment="bottom-right" margin={[72,72]}><GizmoViewport axisColors={["#ef4444","#22c55e","#3b82f6"]} labelColor="white"/></GizmoHelper>
  </>;
}

function Ring({ radius }: { radius: number }) {
  const points = useMemo(() => Array.from({ length: 96 }, (_, i) => { const a = i / 95 * Math.PI * 2; return [Math.cos(a)*radius, Math.sin(a)*radius, -3] as [number,number,number]; }), [radius]);
  return <Line points={points} color="#13425b" lineWidth={.8} transparent opacity={.45}/>;
}

function Connection({ start, end, color, active, reducedMotion }: { start: [number,number,number]; end: [number,number,number]; color: string; active: boolean; reducedMotion: boolean }) {
  const pulse = useRef<THREE.Mesh>(null);
  const path = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(...start), new THREE.Vector3(end[0]*.48, end[1]*.18, 2), new THREE.Vector3(...end)), [start, end]);
  const points = useMemo(() => path.getPoints(44).map((p) => [p.x,p.y,p.z] as [number,number,number]), [path]);
  useFrame(({ clock }) => { if (pulse.current && active && !reducedMotion) pulse.current.position.copy(path.getPoint((clock.elapsedTime * .18) % 1)); });
  return <><Line points={points} color={color} lineWidth={active ? 2.2 : 1} transparent opacity={active ? .86 : .24}/>{active ? <mesh ref={pulse}><sphereGeometry args={[.12,12,10]}/><meshBasicMaterial color={color}/></mesh> : null}</>;
}

const SourceNode = memo(function SourceNode({ source, position, result, selected, active, reducedMotion, onClick }: { source: EnterpriseSource; position: [number,number,number]; result?: SourceSearchResult; selected: boolean; active: boolean; reducedMotion: boolean; onClick: () => void }) {
  const group = useRef<THREE.Group>(null); const meta = latticeSourceMeta[source];
  useFrame(({ clock }) => { if (group.current && !reducedMotion && result?.status === "searching") group.current.rotation.z = Math.sin(clock.elapsedTime * 2) * .035; });
  return <group ref={group} position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
    <mesh><boxGeometry args={[2.4,1.5,.42]}/><meshStandardMaterial color={active ? meta.color : "#071426"} emissive={meta.color} emissiveIntensity={selected ? .75 : result?.status === "searching" ? .5 : .18} metalness={.45} roughness={.35}/></mesh>
    <mesh position={[0,0,-.24]}><boxGeometry args={[2.58,1.68,.05]}/><meshBasicMaterial color={stateColor(source, result?.status ?? "idle", selected)} transparent opacity={active ? .9 : .46}/></mesh>
    <Billboard position={[0,.15,.28]}><Text fontSize={.34} color="#f8fafc" anchorX="center" anchorY="middle">{meta.label}</Text><Text position={[0,-.48,0]} fontSize={.17} color={meta.color} anchorX="center">{statusLabel(result, selected)}</Text></Billboard>
  </group>;
});

function CandidateSatellite({ source, position, index, count, selected }: { source: EnterpriseSource; position: [number,number,number]; index: number; count: number; selected: boolean }) {
  const meta = latticeSourceMeta[source]; const angle = (index / Math.max(1,count)) * Math.PI * 2; const x = position[0] + Math.cos(angle) * 1.75, y = position[1] + Math.sin(angle) * 1.35;
  return <mesh position={[x,y,-.4]}><sphereGeometry args={[selected ? .18 : .11,12,10]}/><meshBasicMaterial color={selected ? "#ffffff" : meta.color} transparent opacity={selected ? 1 : .7}/></mesh>;
}

function CentralNode({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <group onClick={(e) => { e.stopPropagation(); onClick(); }}><mesh><cylinderGeometry args={[2.25,2.25,.52,64]}/><meshStandardMaterial color={active ? "#0e7490" : "#041426"} emissive="#06b6d4" emissiveIntensity={.62} metalness={.5} roughness={.28}/></mesh><mesh position={[0,0,.3]}><torusGeometry args={[2.34,.05,10,96]}/><meshBasicMaterial color="#22d3ee"/></mesh><Billboard position={[0,.15,.34]}><Text fontSize={label.length > 24 ? .35 : .46} maxWidth={3.5} textAlign="center" color="#f8fafc" anchorX="center" anchorY="middle">{label}</Text><Text position={[0,-.62,0]} fontSize={.18} color="#67e8f9" anchorX="center">LATTICE CONTEXT</Text></Billboard></group>;
}

function statusLabel(result: SourceSearchResult | undefined, selected: boolean) { if (selected) return "Resolved"; if (!result) return "Ready"; return ({ searching:"Searching", complete:`${result.candidates.length} candidates`, empty:"No match", failed:"Unavailable", "timed-out":"Timed out", cancelled:"Cancelled", unsupported:"ID search only", idle:"Ready" } as const)[result.status]; }
function stateColor(source: EnterpriseSource, status: SourceSearchResult["status"], selected: boolean) { if (selected) return latticeSourceMeta[source].color; if (status === "failed" || status === "timed-out") return "#fb7185"; if (status === "unsupported") return "#fbbf24"; if (status === "empty" || status === "cancelled") return "#64748b"; return latticeSourceMeta[source].color; }
