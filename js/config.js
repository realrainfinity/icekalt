// App-Einstellungen (klein, synchron) – in localStorage gehalten.
// serveLimit = Ziel-Anteil gefrorenen Wassers (%) für die optimale Konsistenz.
// serveBand  = +/- Bereich (%) um die Serviergrenze (weich / optimal / fest).

const KEY = 'icekalt-config';

const DEFAULTS = {
  serveLimit: 75, // Serviergrenze in % gefrorenem Wasser
  serveBand: 3,   // Temp.-Bereich +/- in %
};

export function getConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
