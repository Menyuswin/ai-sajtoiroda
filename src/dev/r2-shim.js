// R2-kompatibilis helyettesítő (memóriában) a teszteléshez és a helyi bemutatóhoz: put / get / delete.
export function createR2Shim() {
  const store = new Map();
  return {
    async put(key, value, opts = {}) { store.set(key, { bytes: new Uint8Array(value), meta: opts.httpMetadata || {} }); },
    async get(key) {
      const o = store.get(key);
      return o ? { body: new Blob([o.bytes]).stream(), arrayBuffer: async () => o.bytes.slice().buffer, httpMetadata: o.meta, size: o.bytes.length } : null;
    },
    async delete(key) { for (const k of [].concat(key)) store.delete(k); },
    _keys: () => [...store.keys()],
  };
}
