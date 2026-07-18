export function createListenerRegistry() {
  const unsubs = new Set();

  function track(unsub) {
    if (typeof unsub !== 'function') return () => {};
    unsubs.add(unsub);

    return () => {
      if (!unsubs.has(unsub)) return;
      try {
        unsub();
      } catch {
        // no-op
      }
      unsubs.delete(unsub);
    };
  }

  function clearAll() {
    for (const unsub of Array.from(unsubs)) {
      try {
        unsub();
      } catch {
        // no-op
      }
    }
    unsubs.clear();
  }

  return { track, clearAll, size: () => unsubs.size };
}
