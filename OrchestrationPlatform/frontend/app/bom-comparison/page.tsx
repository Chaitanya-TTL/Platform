"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory,
  IconDatabase,
  IconFileSpreadsheet,
  IconGripVertical,
  IconPlus,
  IconPlugConnected,
  IconX,
  IconCancel,
} from "@tabler/icons-react";
import { AddComparisonSourceModal } from "@/components/AddComparisonSourceModal";
import {
  getConfigitRoot,
  getTeamcenterRoot,
  getWindchillRoot,
} from "@/components/BomStreamViewer";
import { ComparisonLoader } from "@/components/ComparisonLoader";
import { ComparisonSetupModal } from "@/components/ComparisonSetupModal";
import { ComparisonSummary } from "@/components/ComparisonSummary";
import { ConfigitForm } from "@/components/ConfigitForm";
import { ExcelBomImportWorkspace } from "@/components/excel-import/ExcelBomImportWorkspace";
import { PipelineForm } from "@/components/PipelineForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SAPForm } from "@/components/SAPForm";
import { SapOperationalImpactPanel } from "@/components/SapOperationalImpactPanel";
import { WindchillForm } from "@/components/WindchillForm";
import { startSapExtraction, subscribeToProgress, type PipelineProgress } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-errors";
import { compareMultipleBoms } from "@/lib/bom-comparison";
import { resolveRequirementContext } from "@/lib/requirement-context";
import type {
  ComparisonFilter,
  ComparisonSelection,
  ComparisonSessionState,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { RemoveSourceDialog } from "@/components/source-workflow/RemoveSourceDialog";
import { WindchillChangeReviewWorkspace } from "@/components/windchill/WindchillChangeReviewWorkspace";
import type {
  WindchillRevisionComparisonResult,
  WindchillVersion,
  WindchillVersionList,
} from "@/types/windchill-revision";
import type {
  WindchillChangeImpactFilter,
  WindchillChangeImpactResult,
} from "@/types/windchill-change-impact";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
type Category = "PLM" | "ERP" | "CPQ" | "DATA";
type Active = { type: SourceType; category: Category };
type Transition = "enter" | "exit" | "add" | null;
type SourceDefinition = {
  type: SourceType;
  label: string;
  category: Category;
  description: string;
  icon: ReactNode;
};

const defs: SourceDefinition[] = [
  {
    type: "teamcenter",
    label: "Teamcenter",
    category: "PLM",
    description: "Run Teamcenter extraction.",
    icon: <IconPlugConnected className="h-6 w-6" />,
  },
  {
    type: "windchill",
    label: "Windchill",
    category: "PLM",
    description: "Extract a Windchill hierarchy.",
    icon: <IconBuildingFactory className="h-6 w-6" />,
  },
  {
    type: "sap",
    label: "SAP",
    category: "ERP",
    description: "Extract an SAP material BOM.",
    icon: <IconDatabase className="h-6 w-6" />,
  },
  {
    type: "configit",
    label: "Configit",
    category: "CPQ",
    description: "Resolve a Configit product model.",
    icon: <IconBox className="h-6 w-6" />,
  },
  {
    type: "excel",
    label: "Excel BOM",
    category: "DATA",
    description: "Map, validate and preview an XLSX bill of materials.",
    icon: <IconFileSpreadsheet className="h-6 w-6" />,
  },
];
const labels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  sap: "SAP",
  configit: "Configit",
  excel: "Excel BOM",
};
const meta = (type: SourceType) => defs.find((item) => item.type === type)!;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
function scalar(value: unknown) {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}
function sapNode(value: unknown, path: string): TreeNodeData {
  const node = record(value) ?? {};
  const material = text(node.itemId) || text(node.id) || path;
  const name = text(node.name) || material;
  const attributes: Record<string, string | number | boolean> = {
    "Item ID": material,
  };
  const sequence = text(node.sequence);
  const qty = scalar(node.qty);
  const revision = text(node.revId);
  if (sequence) attributes.Sequence = sequence;
  if (qty !== undefined) attributes.Qty = qty;
  if (revision) attributes["Rev ID"] = revision;
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    id: `${path}-${material}`,
    name,
    attributes,
    children: children.map((child, index) =>
      sapNode(child, `${path}-${index}`),
    ),
  };
}
function getSapRoot(payload: unknown): TreeNodeData | null {
  const response = record(payload);
  if (!response) return null;
  const body = record(response.payload) ?? response;
  const finalBom = record(body.finalBom) ?? record(response.finalBom) ?? body;
  const root =
    record(finalBom.bomRoot) ??
    record(finalBom.bomRootNode) ??
    record(body.bomRoot) ??
    record(body.bomRootNode);
  return root ? sapNode(root, "sap-root") : null;
}

export default function Page() {
  const [active, setActive] = useState<Active[]>([]);
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<"categories" | "options">("categories");
  const [category, setCategory] = useState<Category | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [teamcenterItemId, setTeamcenterItemId] = useState<string | null>(null);
  const [tcRun, setTcRun] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [sapJob, setSapJob] = useState<string | null>(null);
  const [sapRun, setSapRun] = useState(false);
  const [sapProgress, setSapProgress] = useState<PipelineProgress | null>(null);
  const [sapRequest, setSapRequest] = useState<{ materialId: string; plant: string; includeImpact: boolean } | null>(null);
  const [cfgActive, setCfgActive] = useState(false);
  const [cfgRun, setCfgRun] = useState(false);
  const [product, setProduct] = useState<string | null>(null);
  const [cfgRefresh, setCfgRefresh] = useState(0);
  const [wcActive, setWcActive] = useState(false);
  const [wcRun, setWcRun] = useState(false);
  const [part, setPart] = useState<string | null>(null);
  const [wcRefresh, setWcRefresh] = useState(0);
  const [wcRevisionPart, setWcRevisionPart] = useState<string | null>(null);
  const [wcVersions, setWcVersions] = useState<WindchillVersion[]>([]);
  const [wcFromVersion, setWcFromVersion] = useState("");
  const [wcToVersion, setWcToVersion] = useState("");
  const [wcVersionLoading, setWcVersionLoading] = useState(false);
  const [wcRevisionLoading, setWcRevisionLoading] = useState(false);
  const [wcRevisionError, setWcRevisionError] = useState<string | null>(null);
  const [wcRevisionResult, setWcRevisionResult] =
    useState<WindchillRevisionComparisonResult | null>(null);
  const [wcChangeLoading, setWcChangeLoading] = useState(false);
  const [wcChangeError, setWcChangeError] = useState<string | null>(null);
  const [wcChangeImpact, setWcChangeImpact] =
    useState<WindchillChangeImpactResult | null>(null);
  const [wcChangeFilter, setWcChangeFilter] =
    useState<WindchillChangeImpactFilter>("all");
  const [wcReviewOpen, setWcReviewOpen] = useState(false);
  const [excelRoot, setExcelRoot] = useState<TreeNodeData | null>(null);
  const [dragged, setDragged] = useState<SourceType | null>(null);
  const [roots, setRoots] = useState<Partial<Record<SourceType, TreeNodeData>>>(
    {},
  );
  const [session, setSession] = useState<ComparisonSessionState>("idle");
  const [primary, setPrimary] = useState<SourceType | null>(null);
  const [compared, setCompared] = useState<SourceType[]>([]);
  const [filter, setFilter] = useState<ComparisonFilter>("all");
  const [transition, setTransition] = useState<Transition>(null);
  const [addModal, setAddModal] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<SourceType | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<SourceType | null>(null);

  const ready = useMemo(
    () =>
      active.map((item) => item.type).filter((type) => Boolean(roots[type])),
    [active, roots],
  );
  const result = useMemo(
    () =>
      session === "active" && primary
        ? compareMultipleBoms(primary, compared, roots, labels)
        : null,
    [session, primary, compared, roots],
  );
  const comparing = session === "active" && Boolean(result);
  const included = primary ? [primary, ...compared] : [];
  const remaining = ready.filter((source) => !included.includes(source));
  const visible = comparing
    ? active.filter((item) => included.includes(item.type))
    : active;
  const groups = (["PLM", "ERP", "CPQ", "DATA"] as Category[])
    .map((groupCategory) => ({
      category: groupCategory,
      sources: visible.filter((item) => item.category === groupCategory),
    }))
    .filter((group) => group.sources.length);
  const options = defs
    .filter((def) => !active.some((item) => item.type === def.type))
    .map((def) => ({ ...def, value: def.type, disabled: false }));

  const closeModal = () => {
    setModal(false);
    setView("categories");
    setCategory(null);
  };
  const addSource = (type: SourceType) => {
    setActive((current) =>
      current.some((item) => item.type === type)
        ? current
        : [...current, { type, category: meta(type).category }],
    );
    closeModal();
  };
  const onReady = useCallback(
    (source: SourceType, root: TreeNodeData | null) =>
      setRoots((current) => {
        const next = { ...current };
        if (root) next[source] = root;
        else delete next[source];
        return next;
      }),
    [],
  );
  const submitTc = useCallback(
    (id: string, _payload?: unknown, submittedItemId?: string) => {
      if (!id.trim()) return toast.error("Teamcenter request could not be started", { description: "No request reference was returned." });
      setJob(id);
      setTeamcenterItemId(submittedItemId?.trim() || null);
      setTcRun(true);
      setProgress(null);
    },
    [],
  );
  const submitSap = useCallback((id: string, request?: { materialId: string; plant: string; includeImpact: boolean }) => {
    if (!id.trim()) return toast.error("SAP request could not be started", { description: "No request reference was returned." });
    setSapJob(id);
    setSapRun(true);
    setSapProgress(null);
    if (request) setSapRequest(request);
  }, []);
  const retrySap = useCallback(async () => {
    if (!sapRequest) return;
    try {
      toast.loading("Running SAP analysis again...", { id: "sap-retry" });
      const result = await startSapExtraction({ materialId: sapRequest.materialId, plant: sapRequest.plant, includeSapBusinessImpact: sapRequest.includeImpact });
      submitSap(result.jobId, sapRequest);
      toast.success("SAP request restarted", { id: "sap-retry", description: `${sapRequest.materialId} · Plant ${sapRequest.plant}` });
    } catch (cause) {
      const outcome = userFacingError("sap", cause);
      toast.error(outcome.title, { id: "sap-retry", description: outcome.message });
    }
  }, [sapRequest, submitSap]);

  useEffect(() => {
    if (!job || !tcRun) return;
    return subscribeToProgress(
      job,
      setProgress,
      (message) => { const outcome = userFacingError("teamcenter", message); toast.error(outcome.title, { description: outcome.message }); },
      () => toast.success("Teamcenter request completed", { description: "The latest extraction result is ready for review." }),
    );
  }, [job, tcRun]);
  useEffect(() => {
    if (!sapJob || !sapRun) return;
    return subscribeToProgress(
      sapJob,
      setSapProgress,
      (message) => { const outcome = userFacingError("sap", message); toast.error(outcome.title, { description: outcome.message }); },
      () => toast.success("SAP request completed", { description: "Available structure and business-impact results are ready." }),
    );
  }, [sapJob, sapRun]);

  const loadWindchillVersions = async (partId: string) => {
    setWcRevisionPart(partId);
    setWcVersionLoading(true);
    setWcRevisionError(null);
    setWcRevisionResult(null);
    try {
      const response = await fetch(
        `/api/bom-windchill?operation=versions&partId=${encodeURIComponent(partId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | WindchillVersionList
        | { error?: string };
      if (!response.ok || !("versions" in payload))
        throw new Error(
          "error" in payload
            ? payload.error || "Unable to load revisions"
            : "Unable to load revisions",
        );
      setWcVersions(payload.versions);
      setWcFromVersion(payload.versions[0]?.label ?? "");
      setWcToVersion(payload.versions.at(-1)?.label ?? "");
    } catch (cause) {
      setWcVersions([]);
      setWcRevisionError(
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      setWcVersionLoading(false);
    }
  };

  const compareWindchillVersions = async () => {
    if (
      !wcRevisionPart ||
      !wcFromVersion ||
      !wcToVersion ||
      wcFromVersion === wcToVersion
    )
      return;
    setWcRevisionLoading(true);
    setWcRevisionError(null);
    try {
      const response = await fetch(
        `/api/bom-windchill?operation=compare&partId=${encodeURIComponent(wcRevisionPart)}&from=${encodeURIComponent(wcFromVersion)}&to=${encodeURIComponent(wcToVersion)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | WindchillRevisionComparisonResult
        | { error?: string };
      if (!response.ok || !("summary" in payload))
        throw new Error(
          "error" in payload
            ? payload.error || "Unable to compare revisions"
            : "Unable to compare revisions",
        );
      setWcRevisionResult(payload);
    } catch (cause) {
      setWcRevisionError(
        cause instanceof Error ? cause.message : String(cause),
      );
    } finally {
      setWcRevisionLoading(false);
    }
  };

  const findWindchillChanges = async (partId: string) => {
    if (!roots.windchill) return;
    setWcChangeLoading(true);
    setWcChangeError(null);
    try {
      const response = await fetch(
        `/api/bom-windchill?operation=change-impact&partId=${encodeURIComponent(partId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | WindchillChangeImpactResult
        | { error?: string };
      if (!response.ok || !("impactMap" in payload))
        throw new Error(
          "error" in payload
            ? payload.error || "Unable to find associated changes"
            : "Unable to find associated changes",
        );
      setWcChangeImpact(payload);
      setWcChangeFilter("all");
      if (!payload.summary.changeNotices)
        toast.info("No associated Change Notices found.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setWcChangeImpact(null);
      setWcChangeError(message);
      toast.error(message);
    } finally {
      setWcChangeLoading(false);
    }
  };

  const start = (selection: ComparisonSelection) => {
    setPrimary(selection.leftSource);
    setCompared([selection.rightSource]);
    setSession("preparing");
    setTransition("enter");
  };
  const addComparisonSource = (source: SourceType) => {
    setAddModal(false);
    setPendingAdd(source);
    setTransition("add");
  };
  const complete = useCallback(() => {
    if (transition === "enter") setSession("active");
    if (transition === "add" && pendingAdd) {
      setCompared((current) =>
        current.includes(pendingAdd) ? current : [...current, pendingAdd],
      );
      setPendingAdd(null);
    }
    if (transition === "exit") {
      setSession("idle");
      setPrimary(null);
      setCompared([]);
      setFilter("all");
    }
    setTransition(null);
  }, [transition, pendingAdd]);

  const remove = (type: SourceType) => {
    setPendingRemoval(null);
    setActive((current) => current.filter((item) => item.type !== type));
    onReady(type, null);
    if (included.includes(type)) {
      setSession("idle");
      setPrimary(null);
      setCompared([]);
    }
    if (type === "teamcenter") {
      setJob(null);
      setTeamcenterItemId(null);
      setTcRun(false);
      setProgress(null);
    }
    if (type === "sap") {
      setSapJob(null);
      setSapRun(false);
      setSapProgress(null);
      setSapRequest(null);
    }
    if (type === "configit") {
      setCfgActive(false);
      setCfgRun(false);
      setProduct(null);
    }
    if (type === "excel") setExcelRoot(null);
    if (type === "windchill") {
      setWcActive(false);
      setWcRun(false);
      setPart(null);
      setWcRevisionPart(null);
      setWcVersions([]);
      setWcRevisionResult(null);
      setWcRevisionError(null);
      setWcChangeImpact(null);
      setWcChangeError(null);
      setWcChangeFilter("all");
      setWcReviewOpen(false);
    }
  };
  const drop = (target: SourceType, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (
      !dragged ||
      dragged === target ||
      meta(dragged).category !== meta(target).category
    )
      return setDragged(null);
    setActive((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.type === dragged);
      const to = next.findIndex((item) => item.type === target);
      const [moved] = next.splice(from, 1);
      next.splice(from < to ? to - 1 : to, 0, moved);
      return next;
    });
    setDragged(null);
  };
  const mapFor = (source: SourceType) => result?.maps[source];
  const counterpart = (source: SourceType) =>
    source === primary
      ? compared.map((item) => labels[item]).join(" + ")
      : primary
        ? labels[primary]
        : undefined;

  const panelFor = (source: Active) => {
    if (source.type === "excel")
      return (
        <>
          <ExcelBomImportWorkspace onBomReady={setExcelRoot} />
          {excelRoot ? (
            <div className="mt-4">
              <SourceBomPanel
                source="excel"
                title="DATA"
                endpoint=""
                transformPayload={() => excelRoot}
                payloadOverride={excelRoot}
                active
                onBomReady={onReady}
                comparisonMode={Boolean(comparing)}
                comparison={mapFor("excel")}
                comparisonFilter={filter}
                counterpartLabel={counterpart("excel")}
              />
            </div>
          ) : null}
        </>
      );
    if (source.type === "teamcenter")
      return (
        <>
          <PipelineForm onSubmit={submitTc} isLoading={tcRun} />
          <div className="mt-4">
            {/* {roots.teamcenter ? (
              <RequirementContextBanner
                requirement={resolveRequirementContext(
                  "teamcenter",
                  teamcenterItemId,
                )}
              />
            ) : null} */}
            <SourceBomPanel
              source="teamcenter"
              title="PLM"
              endpoint={
                job ? `${API_BASE}/pipeline/bom/${encodeURIComponent(job)}` : ""
              }
              transformPayload={getTeamcenterRoot}
              active={Boolean(job)}
              onLoadComplete={() => setTcRun(false)}
              onBomReady={onReady}
              progress={progress}
              comparisonMode={Boolean(comparing)}
              comparison={mapFor("teamcenter")}
              comparisonFilter={filter}
              counterpartLabel={counterpart("teamcenter")}
            />
          </div>
        </>
      );
    if (source.type === "windchill")
      return (
        <>
          <WindchillForm
            onLoadVersions={loadWindchillVersions}
            onFindChanges={findWindchillChanges}
            isVersionLoading={wcVersionLoading}
            isChangeLoading={wcChangeLoading}
            changeDisabled={!roots.windchill}
            loaded={Boolean(roots.windchill)}
            onOpenReview={() => setWcReviewOpen(true)}
            onSubmit={(id) => {
              setWcActive(true);
              setWcRun(true);
              setPart(id);
              setWcRevisionPart(id);
              setWcVersions([]);
              setWcRevisionResult(null);
              setWcChangeImpact(null);
              setWcChangeError(null);
              setWcReviewOpen(false);
              setWcRefresh((value) => value + 1);
            }}
            isRunning={wcRun}
          />
          {wcReviewOpen && part ? (
            <WindchillChangeReviewWorkspace
              productId={part}
              root={roots.windchill ?? null}
              versions={wcVersions}
              from={wcFromVersion}
              to={wcToVersion}
              revisionLoading={wcRevisionLoading || wcVersionLoading}
              revisionError={wcRevisionError}
              revisionResult={wcRevisionResult}
              changeLoading={wcChangeLoading}
              changeError={wcChangeError}
              changeImpact={wcChangeImpact}
              onFromChange={setWcFromVersion}
              onToChange={setWcToVersion}
              onCompare={compareWindchillVersions}
              onLoadVersions={() => loadWindchillVersions(part)}
              onLoadChanges={() => findWindchillChanges(part)}
              onClose={() => setWcReviewOpen(false)}
            />
          ) : null}
          <div className="mt-4">
            {/* {roots.windchill ? (
              <RequirementContextBanner
                requirement={resolveRequirementContext("windchill", part)}
              />
            ) : null} */}
            <SourceBomPanel
              source="windchill"
              title="PLM"
              endpoint={
                part
                  ? `/api/bom-windchill?partId=${encodeURIComponent(part)}`
                  : "/api/bom-windchill"
              }
              transformPayload={getWindchillRoot}
              active={wcActive}
              refreshSignal={wcRefresh}
              onLoadComplete={() => setWcRun(false)}
              onBomReady={onReady}
              comparisonMode={Boolean(comparing)}
              comparison={mapFor("windchill")}
              comparisonFilter={filter}
              counterpartLabel={counterpart("windchill")}
              changeImpact={wcChangeImpact}
              changeImpactFilter={wcChangeFilter}
            />
          </div>
        </>
      );
    if (source.type === "configit")
      return (
        <>
          <ConfigitForm
            onSubmit={(id) => {
              setCfgActive(false);
              onReady("configit", null);
              setCfgRun(true);
              setProduct(id);
              setCfgRefresh((value) => value + 1);
            }}
            isRunning={cfgRun}
          />
          <div className="mt-4">
            {/* {roots.configit ? (
                <RequirementContextBanner
                  requirement={resolveRequirementContext("configit", product)}
                />
              ) : null} */}
            <SourceBomPanel
              source="configit"
              title="CPQ"
              endpoint={
                product
                  ? `/api/bom-configit?productId=${encodeURIComponent(product)}`
                  : "/api/bom-configit"
              }
              transformPayload={getConfigitRoot}
              active={cfgRun || cfgActive}
              refreshSignal={cfgRefresh}
              onLoadComplete={(status) => { setCfgRun(false); setCfgActive(status === "ready"); }}
              onBomReady={onReady}
              comparisonMode={Boolean(comparing)}
              comparison={mapFor("configit")}
              comparisonFilter={filter}
              counterpartLabel={counterpart("configit")}
            />
          </div>
        </>
      );
    return (
      <>
        <SAPForm onSubmit={submitSap} isLoading={sapRun} />
        <div className="mt-4">
          <SourceBomPanel
            source="sap"
            title="ERP"
            endpoint={
              sapJob
                ? `${API_BASE}/pipeline/bom/${encodeURIComponent(sapJob)}`
                : ""
            }
            transformPayload={getSapRoot}
            active={Boolean(sapJob)}
            onLoadComplete={() => setSapRun(false)}
            onBomReady={onReady}
            progress={sapProgress}
            comparisonMode={Boolean(comparing)}
            comparison={mapFor("sap")}
            comparisonFilter={filter}
            counterpartLabel={counterpart("sap")}
            onRetryRequest={sapRequest ? retrySap : undefined}
          />
          <SapOperationalImpactPanel jobId={sapJob} active={Boolean(sapJob)} />
        </div>
      </>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,.10),transparent_42%),linear-gradient(135deg,#020617,#0f172a_48%,#111827)] dark:text-slate-50">
      <QuickStartModal
        open={modal}
        onClose={closeModal}
        categories={[
          {
            label: "ALM",
            value: "ALM",
            description: "Codebeamer",
            icon: <IconCancel className="h-6 w-6" />,
          },
                    {
            label: "CPQ",
            value: "CPQ",
            description: "Configit",
            icon: <IconBox className="h-6 w-6" />,
          },
          {
            label: "PLM",
            value: "PLM",
            description: "Teamcenter, Windchill",
            icon: <IconPlugConnected className="h-6 w-6" />,
          },
          {
            label: "ERP",
            value: "ERP",
            description: "SAP",
            icon: <IconDatabase className="h-6 w-6" />,
          },
          {
            label: "Service",
            value: "Service",
            description: "Servigistics",
            icon: <IconBox className="h-6 w-6" />,
          },

          {
            label: "Data",
            value: "DATA",
            description: "Excel",
            icon: <IconFileSpreadsheet className="h-6 w-6" />,
          },
        ]}
        options={options}
        currentView={view}
        selectedCategory={category}
        onOpenCategory={(value) => {
          setCategory(value as Category);
          setView("options");
        }}
        onBack={() => setView("categories")}
        onSelect={(value) => addSource(value as SourceType)}
      />
      <ComparisonSetupModal
        open={session === "selecting"}
        readySources={ready}
        labels={labels}
        initialSelection={
          primary && compared[0]
            ? { leftSource: primary, rightSource: compared[0] }
            : null
        }
        onClose={() => setSession(comparing ? "active" : "idle")}
        onStart={start}
      />
      <AddComparisonSourceModal
        open={addModal}
        availableSources={remaining}
        labels={labels}
        onClose={() => setAddModal(false)}
        onAdd={addComparisonSource}
      />
      <RemoveSourceDialog open={Boolean(pendingRemoval)} sourceLabel={pendingRemoval ? labels[pendingRemoval] : "source"} hasData={Boolean(pendingRemoval && roots[pendingRemoval])} onCancel={() => setPendingRemoval(null)} onConfirm={() => pendingRemoval && remove(pendingRemoval)} />
      <AnimatePresence>
        {transition ? (
          <ComparisonLoader
            mode={transition}
            left={primary ?? undefined}
            right={compared[0]}
            addedSource={pendingAdd ?? undefined}
            labels={labels}
            onComplete={complete}
          />
        ) : null}
      </AnimatePresence>

      <div className="platform-page flex min-h-[calc(100vh-64px)] flex-col platform-section-gap">
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-[#080d18] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Source workspace</p>
            <p className="mt-0.5 text-xs text-slate-500">{active.length} added · {ready.length} ready for comparison</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700"><IconPlus className="h-4 w-4"/>Add source</button>
            {comparing ? <button onClick={() => setTransition("exit")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white"><IconArrowLeft className="h-4 w-4"/>Back to workspace</button> : <button disabled={ready.length < 2} onClick={() => setSession("selecting")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-45"><IconArrowsExchange className="h-4 w-4"/>Compare BOMs</button>}
          </div>
        </section>
        {result ? (
          <ComparisonSummary
            result={result}
            filter={filter}
            onFilterChange={setFilter}
            sourceLabels={labels}
            canAddSource={remaining.length > 0}
            onAddSource={() => setAddModal(true)}
          />
        ) : null}
        {!active.length ? (
          <section className="flex min-h-[52vh] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-[#080d18]/75">
            <div className="max-w-md">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"><IconPlus className="h-5 w-5" /></span>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">Add your first source</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Connect a PLM, ERP, CPQ, or spreadsheet source to inspect its structure and prepare a comparison.</p>
              <button onClick={() => setModal(true)} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500"><IconPlus className="h-4 w-4" />Add source</button>
            </div>
          </section>
        ) : (
          <div className="bom-groups flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
            {groups.map((group) => (
              <section
                key={group.category}
                className="bom-source-group flex-none snap-start rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/70 sm:p-4 lg:min-w-0 lg:basis-0"
                style={{ flexGrow: group.sources.length }}
              >
                <div className="mb-4 flex justify-between">
                  <b className="text-xs uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    {group.category}
                  </b>
                  <span className="text-xs text-slate-500">
                    {group.sources.length} visible
                  </span>
                </div>
                <div
                  className="bom-source-grid grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${group.sources.length}, minmax(0, 1fr))`,
                  }}
                >
                  {group.sources.map((source) => (
                    <article
                      key={source.type}
                      draggable={!comparing}
                      onDragStart={() => setDragged(source.type)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(source.type, event)}
                      className="bom-source-card min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/80 sm:p-4"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                        <h2 className="min-w-0 truncate text-lg font-semibold">
                          {labels[source.type]}
                          {source.type === primary && comparing ? (
                            <span className="ml-2 rounded-full bg-cyan-50 px-2 py-1 text-xs uppercase text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                              Primary
                            </span>
                          ) : null}
                        </h2>
                        <div className="flex shrink-0 gap-2">
                          {!comparing ? (
                            <IconGripVertical className="h-5 w-5 text-slate-400" />
                          ) : null}
                          <button
                            onClick={() => setPendingRemoval(source.type)}
                            aria-label={`Remove ${labels[source.type]}`}
                          >
                            <IconX className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      {panelFor(source)}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
