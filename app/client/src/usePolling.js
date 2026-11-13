import { useEffect, useRef } from 'react';

// Calls fn immediately and then every `ms` milliseconds until the component unmounts.
export default function usePolling(fn, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) ref.current(); };
    tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms]);
}
