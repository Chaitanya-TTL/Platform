import { useCallback, useRef, useState } from "react";

export type Measurement = { name: string; durationMs: number; recordedAt: string };

export function useBenchmark() {
  const starts = useRef(new Map<string, number>());
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const begin = useCallback((name: string) => { starts.current.set(name, performance.now()); }, []);
  const end = useCallback((name: string) => {
    const started = starts.current.get(name);
    if (started === undefined) return;
    const sample = { name, durationMs: Number((performance.now() - started).toFixed(2)), recordedAt: new Date().toISOString() };
    starts.current.delete(name);
    setMeasurements((current) => [sample, ...current.filter((item) => item.name !== name)].slice(0, 12));
  }, []);
  const reset = useCallback(() => setMeasurements([]), []);
  return { begin, end, measurements, reset };
}
