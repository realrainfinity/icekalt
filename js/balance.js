// Bilanzierungs-Logik: aus Zutaten-Mengen die Eis-Kennwerte berechnen.
// Zutaten-Felder sind Prozentangaben bezogen auf 100 g der Zutat.

export const METRICS = [
  { key: 'fat', label: 'Fett' },
  { key: 'sugars', label: 'Zucker' },
  { key: 'msnf', label: 'fettfreie Milchtr.' },
  { key: 'otherSolids', label: 'andere Feststoffe' },
];

// recipeItems: [{ ingredientId, grams }]
// ingredientsById: Map<id, ingredient>
export function balance(recipeItems, ingredientsById) {
  const total = recipeItems.reduce((s, it) => s + (Number(it.grams) || 0), 0);
  const mass = { fat: 0, sugars: 0, msnf: 0, otherSolids: 0 };
  let podMass = 0;      // Süßkraft, bezogen auf Saccharose=100
  let pacMass = 0;      // Gefrierpunkt senkende Kraft (über Zucker)
  let saltMass = 0;     // NaCl-Masse (g), starker Gefrierpunktsenker
  let glycerolMass = 0; // Glycerin-Masse (g), starker Gefrierpunktsenker

  for (const it of recipeItems) {
    const ing = ingredientsById.get(it.ingredientId);
    if (!ing) continue;
    const g = Number(it.grams) || 0;
    mass.fat += (g * (ing.fat || 0)) / 100;
    mass.sugars += (g * (ing.sugars || 0)) / 100;
    mass.msnf += (g * (ing.msnf || 0)) / 100;
    mass.otherSolids += (g * (ing.otherSolids || 0)) / 100;
    saltMass += (g * (ing.nacl || 0)) / 100;
    glycerolMass += (g * (ing.glycerol || 0)) / 100;
    // POD/PAC wirken auf den Zuckeranteil der Zutat.
    const sugarG = (g * (ing.sugars || 0)) / 100;
    podMass += (sugarG * (ing.pod || 0)) / 100;
    pacMass += (sugarG * (ing.pac || 0)) / 100;
  }

  const totalSolids = mass.fat + mass.sugars + mass.msnf + mass.otherSolids;
  const water = Math.max(total - totalSolids, 0);
  const pct = (x) => (total > 0 ? (x / total) * 100 : 0);

  // Initialer Gefrierpunkt (°C) über die Saccharose-Äquivalent-Molalität.
  // pacMass = Zuckermenge in Saccharose-Äquivalent (g). Zusätzlich senkt die
  // MSNF den Gefrierpunkt: ~54,5 % davon ist Laktose (M≈342 wie Saccharose),
  // hinzu kommen die Mineralsalze der Milch, die wegen kleiner Molmasse +
  // Ionen-Dissoziation überproportional wirken. In der Eisliteratur wird die
  // MSNF daher als grob saccharose-äquivalent in voller Masse angesetzt
  // (Faktor ~1,0 statt nur 0,545 für Laktose allein).
  // Salz (NaCl) ist ein starker Gefrierpunktsenker: es dissoziiert in 2 Ionen
  // (i=2) und hat M=58,44 g/mol -> je Gramm ~11,7× wirksamer als Saccharose
  // ((2/58,44)/(1/342) ≈ 11,7). Glycerin zerfällt NICHT (i=1), M=92,09 g/mol
  // -> je Gramm ~3,7× wirksamer als Saccharose (342/92,09 ≈ 3,71). Alle als
  // Saccharose-Äquivalent addiert. Kf(Wasser)=1,86 °C·kg/mol, M=342 g/mol.
  // Privatgebrauch-Näherung.
  const msnfEq = mass.msnf * 1.0;
  const saltEq = saltMass * 11.7;
  const glycerolEq = glycerolMass * 3.71;
  const freezingPoint = water > 0 ? -1.86 * ((pacMass + msnfEq + saltEq + glycerolEq) / 342) / (water / 1000) : 0;

  return {
    total,
    mass,
    grams: { ...mass, totalSolids, water },
    percent: {
      fat: pct(mass.fat),
      sugars: pct(mass.sugars),
      msnf: pct(mass.msnf),
      otherSolids: pct(mass.otherSolids),
      totalSolids: pct(totalSolids),
      water: pct(water),
    },
    pod: pct(podMass), // relative Süßkraft in % der Mischung
    pac: pct(pacMass), // relative PAC in % der Mischung
    freezingPoint,     // initialer Gefrierpunkt in °C (negativ)
  };
}

export function fmt(n, digits = 1) {
  return (Number(n) || 0).toFixed(digits);
}

// Speisetemperatur (°C) bei einem bestimmten Anteil gefrorenen Wassers.
// Beim Gefrierpunkt (f=0) entspricht sie dem initialen Gefrierpunkt; je mehr
// Wasser gefriert, desto konzentrierter wird die Restlösung und desto kälter
// muss es sein -> T(f) = Gefrierpunkt / (1 - f). f als Anteil 0..1.
// fractionPct = Anteil in % (z. B. 75). Liefert 0, wenn kein Gefrierpunkt da.
export function serveTemperature(freezingPoint, fractionPct) {
  if (!freezingPoint) return 0;
  const f = Math.min(Math.max(fractionPct / 100, 0), 0.99);
  return freezingPoint / (1 - f);
}

// Mix-Dichte (g/ml) für die Volumenabschätzung. Eismix liegt typisch bei ~1,1.
export const MIX_DENSITY = 1.1;

// Volumen des flüssigen Mixes (L) aus der Gesamtmasse (g).
export function mixVolumeL(massG) {
  return (Number(massG) || 0) / MIX_DENSITY / 1000;
}

// Volumen des fertigen Eises (L) inkl. Luftaufschlag (overrun in %).
export function frozenVolumeL(massG, overrunPct = 0) {
  return mixVolumeL(massG) * (1 + (Number(overrunPct) || 0) / 100);
}

// Benötigte Mix-Masse (g) für ein Ziel-Volumen fertigen Eises (L).
export function massForFrozenVolumeL(volL, overrunPct = 0) {
  return ((Number(volL) || 0) * 1000 / (1 + (Number(overrunPct) || 0) / 100)) * MIX_DENSITY;
}

// ---- Profi-Modell: Eistypen mit Zielbereichen (% der Gesamtmischung) ----
// Werte als grobe Handwerks-Richtwerte; pro Typ min/max je Kennwert.
// Zusätzlich Zielbereiche für POD (Süßempfinden) und PAC (Schöpfbarkeit).
export const ICE_TYPES = [
  {
    key: 'eiscreme',
    label: 'Eiscreme (Milchbasis)',
    ranges: {
      fat: [10, 20],
      sugars: [14, 22],
      msnf: [7, 12],
      totalSolids: [36, 46],
      pod: [12, 20],
      pac: [22, 28],
    },
  },
  {
    key: 'gelato',
    label: 'Gelato',
    ranges: {
      fat: [4, 10],
      sugars: [16, 24],
      msnf: [8, 12],
      totalSolids: [32, 42],
      pod: [14, 22],
      pac: [24, 30],
    },
  },
  {
    key: 'sorbet',
    label: 'Sorbet (Fruchteis)',
    ranges: {
      fat: [0, 2],
      sugars: [22, 32],
      msnf: [0, 2],
      totalSolids: [28, 36],
      pod: [20, 30],
      pac: [28, 34],
    },
  },
];

export function getIceType(key) {
  return ICE_TYPES.find((t) => t.key === key) || ICE_TYPES[0];
}

// Bewertet einen Wert gegen einen Zielbereich:
// 'low' (unter min), 'ok' (im Bereich), 'high' (über max), 'none' (kein Ziel).
export function rate(value, range) {
  if (!range) return 'none';
  const [min, max] = range;
  if (value < min) return 'low';
  if (value > max) return 'high';
  return 'ok';
}

// Optimaler Wert eines Zielbereichs = dessen Mitte.
export function optimum(range) {
  return range ? (range[0] + range[1]) / 2 : 0;
}

// Ampel-Status für die Balkengrafik:
//  'ok'   = innerhalb des Zielbereichs (grün)
//  'warn' = außerhalb, aber < 20 % vom nächsten Bereichsrand (gelb)
//  'bad'  = >= 20 % außerhalb (rot)
//  'none' = kein Zielbereich vorhanden
// deviation = Abweichung in % relativ zum nächsten Bereichsrand.
export function barStatus(value, range) {
  if (!range) return { status: 'none', deviation: 0 };
  const [min, max] = range;
  if (value >= min && value <= max) return { status: 'ok', deviation: 0 };
  const edge = value < min ? min : max;
  const deviation = edge > 0 ? (Math.abs(value - edge) / edge) * 100 : 100;
  return { status: deviation >= 20 ? 'bad' : 'warn', deviation };
}

// Liefert eine Bewertung je Kennwert für einen Eistyp.
// b = Ergebnis von balance(); typeKey = Schlüssel aus ICE_TYPES.
export function evaluate(b, typeKey) {
  const type = getIceType(typeKey);
  const out = {};
  for (const key of Object.keys(type.ranges)) {
    const value = key === 'pod' || key === 'pac' ? b[key] : b.percent[key];
    out[key] = { value, range: type.ranges[key], status: rate(value, type.ranges[key]) };
  }
  return { type, metrics: out };
}
