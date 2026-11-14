/** Serialize optional service ownership across asynchronous imports and mode changes. */
export function createLocalAdapterOwner({ isNative, loadFactory, ErrorType = Error }) {
  let current, generation = 0, closed = false, closing = Promise.resolve();
  const unavailable = () => new ErrorType('Use the selected Codex or Claude Code client for this connection. Local adapters are optional in Advanced compatibility.');
  const assertCurrent = expected => { if (closed || isNative() || expected !== undefined && expected !== generation) throw unavailable(); };
  async function get() {
    assertCurrent(); await closing; assertCurrent();
    if (!current) {
      const expected = generation;
      const pending = Promise.resolve().then(loadFactory).then(factory => {
        assertCurrent(expected); // Never construct/read legacy sessions after a Native switch.
        const services = factory(); services.start(); return services;
      });
      current = pending;
      pending.catch(() => { if (current === pending) current = undefined; });
    }
    return current;
  }
  function retire() {
    generation++;
    const previous = current; current = undefined;
    closing = closing.then(async () => {
      let services;
      try { services = await previous; } catch { return; } // A cancelled import created no owner.
      if (services) await services.close();
    });
    return closing;
  }
  return {
    get,
    async modeChanged(wasNative) {
      if (wasNative === isNative()) return;
      if (isNative()) await retire();
      else { generation++; await get(); }
    },
    async close() { closed = true; await retire(); },
  };
}
