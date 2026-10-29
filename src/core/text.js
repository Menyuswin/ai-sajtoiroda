// Közös szövegsegédek: ékezet- és kisbetű-független összehasonlítás.
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Naptári nap (ÉÉÉÉ-HH-NN) az ügyfél időzónájában.
export function dayKey(date, tz = 'Europe/Budapest') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}
