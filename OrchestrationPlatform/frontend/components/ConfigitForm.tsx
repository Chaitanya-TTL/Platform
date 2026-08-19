"use client";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatefulButtonDemo } from "./StatefulButton";
import { SourceField, SourceRequestPanel, sourceInputClass } from "@/components/source-workflow/SourceRequestPanel";

interface ConfigitFormProps { onSubmit: (workItemId: string, productModel: string) => void; isRunning: boolean }
export function ConfigitForm({ onSubmit, isRunning }: ConfigitFormProps) {
  const [productId, setProductId] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const value = productId.trim();
    if (!value) { setError("Enter a Configit Product ID to continue."); return; }
    toast.loading("Resolving Configit product model...", { id: "configit-start" });
    onSubmit(value, value);
    toast.success("Configit extraction started", { id: "configit-start", description: `Resolving ${value}.` });
  };
  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <SourceRequestPanel title="Resolve Configit product" description="Configit currently requires an exact Product ID." error={error}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><SourceField label="Product ID"><input value={productId} onChange={(e) => { setProductId(e.target.value); setError(""); }} placeholder="002403" disabled={isRunning} className={sourceInputClass}/></SourceField></div>
        <StatefulButtonDemo isLoading={isRunning} disabled={isRunning} idleLabel="Resolve product" loadingLabel="Resolving" />
      </div>
    </SourceRequestPanel>
  </motion.form>;
}
