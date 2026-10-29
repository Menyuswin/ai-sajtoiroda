// Futási beállítások. Alapértelmezés: SZÁRAZ (dry) mód – nem megy ki levél, nem kell fizetős szolgáltatás.
// Éles módhoz: SAJTOIRODA_LIVE=1, és a kiválasztott levélküldő meg AI-kulcs beállítása.
export function getConfig(env = process.env) {
  return {
    live: env.SAJTOIRODA_LIVE === '1',
    dataDir: env.SAJTOIRODA_DATA || 'data',
    outDir: env.SAJTOIRODA_OUT || 'out',
    anthropicKey: env.ANTHROPIC_API_KEY || null,
    models: {
      classify: env.SAJTOIRODA_MODEL_CLASSIFY || 'claude-haiku-5-5',
      synthesize: env.SAJTOIRODA_MODEL_SYNTH || 'claude-sonnet-5-5',
    },
    mailer: env.SAJTOIRODA_MAILER || null, // éles módban kötelező; még nincs kiválasztva
  };
}
