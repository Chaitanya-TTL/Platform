"use client";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatefulButtonDemo } from "./StatefulButton";
import { SourceField, SourceRequestPanel, sourceInputClass } from "@/components/source-workflow/SourceRequestPanel";

interface ConfigitFormProps {
  onSubmit: (packagePath: string, productIdOverride?: string) => void;
  isRunning: boolean;
}

export function ConfigitForm({ onSubmit, isRunning }: ConfigitFormProps) {
  const [packagePath, setPackagePath] = useState("screwjack");
  const [productId, setProductId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = packagePath.trim();
    if (!value) { setError("Enter a Configit package path to continue."); return; }
    setError("");
    toast.loading("Resolving Configit package...", { id: "configit-start" });
    onSubmit(value, productId.trim() || undefined);
    toast.success("Configit extraction started", { id: "configit-start", description: `Resolving package ${value}.` });
  };

  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <SourceRequestPanel title="Resolve Configit package" description="Enter a logical package path. Configit resolves the latest package version and configurable root product automatically." error={error}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <SourceField label="Package path"><input value={packagePath} onChange={(event) => { setPackagePath(event.target.value); setError(""); }} placeholder="screwjack" disabled={isRunning} className={sourceInputClass} /></SourceField>
          <button type="button" onClick={() => setAdvanced((value) => !value)} className="mt-2 text-xs font-semibold text-cyan-600 dark:text-cyan-300">{advanced ? "Hide product override" : "Advanced: Product ID override"}</button>
        </div>
        <StatefulButtonDemo isLoading={isRunning} disabled={isRunning} idleLabel="Resolve package" loadingLabel="Resolving" />
      </div>
      {advanced ? <div className="mt-3"><SourceField label="Product ID override (optional)"><input value={productId} onChange={(event) => setProductId(event.target.value)} placeholder="Use only when a package has multiple configurable products" disabled={isRunning} className={sourceInputClass} /></SourceField></div> : null}
    </SourceRequestPanel>
  </motion.form>;
}
