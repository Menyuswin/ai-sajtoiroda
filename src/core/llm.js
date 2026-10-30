// AI-illesztő. Két mód:
//  - 'mock': nincs hálózat, nincs költség; a mód a munkatárs saját szabályalapú tartalékát használja;
//  - 'anthropic': Claude API (ANTHROPIC_API_KEY kell).
export function createLlm({ mode = 'mock', key = null, models, fetchImpl = fetch }) {
  if (mode === 'mock') return { mode: 'mock', complete: null };
  if (mode !== 'anthropic') throw new Error(`Ismeretlen AI-mód: ${mode}`);
  if (!key) throw new Error('ANTHROPIC_API_KEY nincs megadva');
  return {
    mode,
    async complete({ task, system, user, maxTokens = 1500 }) {
      const model = models[task];
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error(`AI-hiba: HTTP ${res.status}`);
      const data = await res.json();
      return (data.content || []).map(b => b.text || '').join('');
    },
  };
}

// A promptok (monitoring/prompts/*.md szövege) szakaszokra bontása és kitöltése.
// A szöveget a hívó adja (fájlból vagy a csomagba építve), így Cloudflare Workerben is működik.
export function loadPrompt(md, vars) {
  const section = (title) => {
    const m = md.match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
    return m ? m[1].trim() : '';
  };
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  });
  const system = fill(section('Rendszerutasítás'));
  const user = fill([section('Bemenet'), section('Kimenet')].filter(Boolean).join('\n\n'));
  return { system, user };
}

// Az első JSON-objektum kinyerése a modell válaszából.
export function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('nincs JSON a válaszban');
  return JSON.parse(m[0]);
}
