import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const run = useCallback(() => {
    const myGen = ++gen.current;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => { if (myGen === gen.current) { setData(d); setLoading(false); } })
      .catch((e) => {
        if (myGen !== gen.current) return;
        setError(e instanceof ApiError ? e.message : "Unexpected error. Please try again.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, reload: run };
}
