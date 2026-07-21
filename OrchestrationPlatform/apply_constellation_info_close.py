from pathlib import Path
import sys

frontend = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
constellation = frontend / "components" / "bom-visualization" / "BomConstellationView.tsx"
panel = frontend / "components" / "SourceBomPanel.tsx"
for file in (constellation, panel):
    if not file.exists():
        raise SystemExit(f"Required file not found: {file}")

def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not find {label}. No files were written.")
    return text.replace(old, new, 1)

ct = constellation.read_text(encoding="utf-8")
pt = panel.read_text(encoding="utf-8")
ct = replace_once(ct, '  IconRotateClockwise,\n} from "@tabler/icons-react";', '  IconRotateClockwise,\n  IconX,\n} from "@tabler/icons-react";', 'IconX import')
ct = replace_once(ct, '  selectedId,\n  onSelect,\n  onFullScreen,', '  selectedId,\n  onSelect,\n  onClearSelection,\n  onFullScreen,', 'component props')
ct = replace_once(ct, '  selectedId?: string;\n  onSelect: (node: TreeNodeData) => void;\n  onFullScreen: () => void;', '  selectedId?: string;\n  onSelect: (node: TreeNodeData) => void;\n  onClearSelection: () => void;\n  onFullScreen: () => void;', 'component prop type')
ct = replace_once(ct, '  const [showLegend, setShowLegend] = useState(false);', '  const [showLegend, setShowLegend] = useState(false);\n  const [tooltipDismissed, setTooltipDismissed] = useState(false);', 'dismissal state')
ct = replace_once(ct, '  const activeId = hoveredId ?? selectedId;\n  const activeNode = activeId ? graph.byId[activeId] : undefined;', '  const activeId = hoveredId ?? selectedId;\n  const activeNode =\n    !tooltipDismissed && activeId ? graph.byId[activeId] : undefined;', 'active node')
ct = replace_once(ct, '''                onSelect={(id) => {
                  const raw = findNode(root, id);
                  if (raw) onSelect(raw);
                }}''', '''                onSelect={(id) => {
                  const raw = findNode(root, id);
                  if (raw) {
                    setTooltipDismissed(false);
                    onSelect(raw);
                  }
                }}''', 'node select')
ct = replace_once(ct, '''            descendants={descendants(graph, activeNode.id)}
          />''', '''            descendants={descendants(graph, activeNode.id)}
            onClose={() => {
              setHoveredId(null);
              setTooltipDismissed(true);
              onClearSelection();
            }}
          />''', 'tooltip callback')
ct = replace_once(ct, '  descendants: descendantNodes,\n}: {\n  node: VisualBomNode;', '  descendants: descendantNodes,\n  onClose,\n}: {\n  node: VisualBomNode;', 'tooltip props')
ct = replace_once(ct, '  ancestors: VisualBomNode[];\n  descendants: VisualBomNode[];\n}) {', '  ancestors: VisualBomNode[];\n  descendants: VisualBomNode[];\n  onClose: () => void;\n}) {', 'tooltip prop type')
ct = replace_once(ct, '''        <span className="rounded-lg border border-slate-700 px-2 py-1 text-[9px] text-slate-400">
          {node.source}
        </span>''', '''        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-lg border border-slate-700 px-2 py-1 text-[9px] text-slate-400">
            {node.source}
          </span>
          <button
            data-control="true"
            type="button"
            title="Close node information"
            aria-label="Close node information"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>''', 'close button')
pt = replace_once(pt, '''                  selectedId={selected?.id}
                  onSelect={handleNodeSelection}
                  onFullScreen={() => setFullScreen(true)}
                />''', '''                  selectedId={selected?.id}
                  onSelect={handleNodeSelection}
                  onClearSelection={() => setSelected(null)}
                  onFullScreen={() => setFullScreen(true)}
                />''', 'SourceBomPanel callback')
constellation.write_text(ct, encoding="utf-8")
panel.write_text(pt, encoding="utf-8")
print("[OK] Constellation information-panel close button applied")
