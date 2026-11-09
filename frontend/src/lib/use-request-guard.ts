"use client";

import { useCallback, useEffect, useRef } from "react";

// Ignore late UI updates without aborting a request that might save backend data.
export function useRequestGuard() {
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  return useCallback(() => {
    const ticket = ++generation.current;
    return () => mounted.current && generation.current === ticket;
  }, []);
}
