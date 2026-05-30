// Helfer "Aus Nährwerttabelle": rechnet aus den Pflichtangaben einer
// EU-Nährwerttabelle (je 100 g) die Eis-Kennwerte für eine Zutat aus.
// Optional: Produkt per Barcode (EAN) bei Open Food Facts abrufen.
//
// Eindeutig ableitbar:  Fett, Zucker, Trockenmasse, Wasser.
// Mit Annahme:          MSNF (bei Milchprodukten) bzw. andere Feststoffe.
// Aus der Zutatenliste: Zuckerart -> POD/PAC. Bei mehreren Zuckern wird ein
//                       nach Menge gewichteter Mittelwert gebildet.

import { el, openModal } from './ui.js';

const OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
export const offProductUrl = (barcode) => `https://world.openfoodfacts.org/product/${barcode}`;

// Süßkraft (POD) und gefrierpunktsenkende Kraft (PAC) je Zuckerart,
// relativ zu Saccharose = 100. Richtwerte aus der Eis-Bilanzierung.
export const SUGAR_TYPES = [
  { key: 'none',     label: 'kein Zucker / unbekannt', pod: 0,   pac: 0 },
  { key: 'sucrose',  label: 'Saccharose (Haushaltszucker)', pod: 100, pac: 100 },
  { key: 'dextrose', label: 'Dextrose (Traubenzucker)', pod: 70,  pac: 190 },
  { key: 'fructose', label: 'Fructose (Fruchtzucker)', pod: 170, pac: 190 },
  { key: 'invert',   label: 'Invertzucker', pod: 125, pac: 190 },
  { key: 'glucoseDE60', label: 'Glukosesirup DE60', pod: 50, pac: 110 },
  { key: 'glucoseDE40', label: 'Glukosesirup DE40', pod: 35, pac: 80 },
  { key: 'glucoseDE21', label: 'Glukose DE21 (atomisiert)', pod: 22, pac: 45 },
  { key: 'lactose',  label: 'Laktose (Milchzucker)', pod: 16, pac: 100 },
  { key: 'honey',    label: 'Honig', pod: 130, pac: 190 },
];

const sugarByKey = (key) => SUGAR_TYPES.find((s) => s.key === key) || SUGAR_TYPES[0];

// Stichwort-Erkennung: spezifische Zucker zuerst, "Zucker"/"sugar" zuletzt
// (sonst würde "Traubenzucker" fälschlich als Saccharose erkannt).
const SUGAR_MATCHERS = [
  { key: 'glucoseDE60', ids: ['en:glucose-syrup', 'en:glucose'], words: ['glukosesirup', 'glucose syrup', 'glukose-sirup', 'glukose'] },
  { key: 'dextrose', ids: ['en:dextrose'], words: ['dextrose', 'traubenzucker'] },
  { key: 'fructose', ids: ['en:fructose'], words: ['fructose', 'fruktose', 'fruchtzucker'] },
  { key: 'invert', ids: ['en:invert-sugar', 'en:invert-sugar-syrup'], words: ['invertzucker', 'invert sugar'] },
  { key: 'lactose', ids: ['en:lactose'], words: ['laktose', 'lactose', 'milchzucker'] },
  { key: 'honey', ids: ['en:honey'], words: ['honig', 'honey'] },
  { key: 'sucrose', ids: ['en:sugar', 'en:sucrose', 'en:cane-sugar', 'en:brown-sugar', 'en:beet-sugar'], words: ['rohrzucker', 'saccharose', 'zucker', 'sugar', 'sucrose'] },
];

const clamp = (n) => Math.max(0, Math.round((Number(n) || 0) * 10) / 10);
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Erkennt Zuckerarten in einem OFF-Produkt (strukturierte Liste bevorzugt,
// sonst der Klartext). Liefert [{ key, percent|null }] in Reihenfolge.
export function detectSugars(product = {}) {
  const found = [];
  const ings = Array.isArray(product.ingredients) ? product.ingredients : [];
  for (const ing of ings) {
    const id = (ing.id || '').toLowerCase();
    const text = (ing.text || '').toLowerCase();
    const m = SUGAR_MATCHERS.find((s) => s.ids.includes(id) || s.words.some((w) => text.includes(w)));
    if (m) {
      const pct = Number(ing.percent ?? ing.percent_estimate);
      found.push({ key: m.key, percent: isFinite(pct) && pct > 0 ? pct : null });
    }
  }
  if (found.length) return found;

  // Fallback: Klartext nach Kommas zerlegen und Stichworte suchen.
  const txt = (product.ingredients_text_de || product.ingredients_text || '').toLowerCase();
  if (!txt) return found;
  for (const part of txt.split(/[,;()]/)) {
    const m = SUGAR_MATCHERS.find((s) => s.words.some((w) => part.includes(w)));
    if (m && !found.some((f) => f.key === m.key)) found.push({ key: m.key, percent: null });
  }
  return found;
}

// Gewichteter Mittelwert ("goldener Schnitt") für POD/PAC bei mehreren Zuckern.
// Gewichtung nach Mengenanteil (percent), sonst nach Reihenfolge in der Liste.
export function blendSugars(found = []) {
  if (!found.length) return null;
  const haveAll = found.every((f) => f.percent != null);
  const weighted = found.map((f, i) => ({ ...f, w: haveAll ? f.percent : found.length - i }));
  const total = weighted.reduce((s, f) => s + f.w, 0) || 1;
  let pod = 0, pac = 0;
  for (const f of weighted) {
    const t = sugarByKey(f.key);
    pod += (t.pod || 0) * (f.w / total);
    pac += (t.pac || 0) * (f.w / total);
  }
  const labels = weighted.map((f) => {
    const name = sugarByKey(f.key).label.replace(/ \(.*\)$/, '');
    return haveAll ? `${name} ${round1(f.w)}%` : name;
  });
  return { pod: round1(pod), pac: round1(pac), labels, count: weighted.length };
}

// label: { fat, carbs, sugars, protein, salt, fiber } je 100 g
// opts:  { isMilk, pod, pac }  (pod/pac bereits aus Zuckerart bestimmt)
// -> { fat, sugars, msnf, otherSolids, nacl, pod, pac, totalSolids, water }
export function deriveFromLabel(label, { isMilk = false, pod = 0, pac = 0 } = {}) {
  const fat = clamp(label.fat);
  const carbs = clamp(label.carbs);
  const sugars = clamp(label.sugars);
  const protein = clamp(label.protein);
  const salt = clamp(label.salt);
  const fiber = clamp(label.fiber);

  // Trockenmasse ≈ Summe aller nicht-Wasser-Bestandteile. Kohlenhydrate
  // schließen den Zucker bereits ein; Ballaststoffe werden separat geführt.
  const totalSolids = clamp(fat + carbs + fiber + protein + salt);
  const water = clamp(Math.max(100 - totalSolids, 0));

  let out;
  if (isMilk) {
    // Bei Milchprodukten zählen alle fettfreien Feststoffe (inkl. Laktose)
    // zur MSNF; der Label-Zucker wird nicht separat geführt (Doppelzählung).
    out = { fat, sugars: 0, msnf: clamp(totalSolids - fat), otherSolids: 0, pod: 0, pac: 0 };
  } else {
    out = { fat, sugars, msnf: 0, otherSolids: clamp(totalSolids - fat - sugars), pod: round1(pod), pac: round1(pac) };
  }
  // Salzangabe (NaCl-Äquivalent) für die Gefrierpunkt-Berechnung mitführen.
  return { ...out, nacl: salt, totalSolids, water };
}

// Wandelt ein rohes OFF-Produktobjekt in unser internes Format um.
function parseProduct(p, code) {
  const n = p.nutriments || {};
  return {
    barcode: code,
    productName: p.product_name || '',
    ingredientsText: p.ingredients_text_de || p.ingredients_text || '',
    offUrl: offProductUrl(code),
    nutriments: {
      fat: round1(n.fat_100g),
      carbs: round1(n.carbohydrates_100g),
      sugars: round1(n.sugars_100g),
      protein: round1(n.proteins_100g),
      salt: round1(n.salt_100g),
      fiber: round1(n.fiber_100g),
    },
    sugars: detectSugars(p),
  };
}

// Ruft ein Produkt bei Open Food Facts per Barcode ab. Wirft bei Fehler/Not-Found.
export async function fetchOFF(barcode) {
  const code = String(barcode).replace(/\s+/g, '');
  if (!code) throw new Error('Bitte einen Barcode (EAN) eingeben.');
  const fields = 'product_name,ingredients_text_de,ingredients_text,ingredients,nutriments';
  const res = await fetch(`${OFF_API}${encodeURIComponent(code)}.json?fields=${fields}`);
  if (!res.ok) throw new Error(`Netzwerkfehler (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) throw new Error('Produkt nicht gefunden.');
  return parseProduct(data.product, code);
}

// Sucht Produkte bei Open Food Facts per Freitext (Name/Marke).
// Liefert eine Kurz-Trefferliste [{ code, name, brands }] zur Auswahl.
export async function searchOFF(query, { pageSize = 12 } = {}) {
  const term = String(query).trim();
  if (!term) throw new Error('Bitte einen Suchbegriff eingeben.');
  const params = new URLSearchParams({
    search_terms: term,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    fields: 'code,product_name,brands',
  });
  const res = await fetch(`${OFF_SEARCH}?${params.toString()}`);
  if (!res.ok) throw new Error(`Netzwerkfehler (${res.status})`);
  const data = await res.json();
  const products = Array.isArray(data.products) ? data.products : [];
  return products
    .filter((p) => p.code)
    .map((p) => ({ code: p.code, name: p.product_name || '(ohne Namen)', brands: p.brands || '' }));
}

// Öffnet das Helfer-Modal. onApply(result) erhält Kennwerte + meta (Quelle).
export function openNutritionHelper(onApply) {
  openModal('Aus Nährwerttabelle', (close) => {
    const wrap = el('div', { class: 'list' });

    // --- Open Food Facts: Suche per Name oder Barcode ---
    const queryInput = el('input', { type: 'text', placeholder: 'Name oder EAN, z. B. „Vollmilch" oder 4001686301227' });
    const offStatus = el('p', { class: 'muted', style: 'margin:4px 0 0' });
    const resultsBox = el('div', { class: 'list', style: 'margin-top:8px' });
    const searchBtn = el('button', { type: 'button', class: 'btn block', text: '🔍 Bei Open Food Facts suchen' });
    wrap.append(
      el('div', { class: 'card' }, [
        el('label', { text: 'Produkt suchen (Name oder Barcode)' }), queryInput,
        searchBtn, offStatus, resultsBox,
      ])
    );

    // gemerkte Quelle nach erfolgreicher OFF-Abfrage
    let meta = { barcode: '', productName: '', ingredientsText: '', offUrl: '', nutriments: null, source: 'manual' };

    wrap.append(el('p', { class: 'muted', text: 'Oder Werte von der Verpackung (je 100 g) direkt eintragen:' }));

    // --- Eingabefelder der Nährwerttabelle ---
    const fields = [
      { key: 'fat', label: 'Fett (g)' },
      { key: 'carbs', label: 'Kohlenhydrate (g)' },
      { key: 'sugars', label: '– davon Zucker (g)' },
      { key: 'protein', label: 'Eiweiß (g)' },
      { key: 'salt', label: 'Salz (g)' },
      { key: 'fiber', label: 'Ballaststoffe (g, optional)' },
    ];
    const inputs = {};
    const grid = el('div', { class: 'grid-2' });
    for (const f of fields) {
      const input = el('input', { type: 'number', step: '0.1', min: '0', inputmode: 'decimal', placeholder: '0' });
      input.addEventListener('input', updatePreview);
      inputs[f.key] = input;
      grid.append(el('div', {}, [el('label', { text: f.label }), input]));
    }
    wrap.append(grid);

    // --- Milchprodukt-Schalter ---
    const milkInput = el('input', { type: 'checkbox' });
    milkInput.addEventListener('change', () => { syncSugarState(); updatePreview(); });
    wrap.append(
      el('label', { class: 'check-row' }, [
        milkInput,
        el('span', { text: 'Milchprodukt (Zucker = Laktose → zählt zur fettfreien Milchtrockenmasse)' }),
      ])
    );

    // --- Zuckerart für POD/PAC (inkl. erkannter Mischung) ---
    let mixture = null; // { pod, pac, labels, count } aus detectSugars/blendSugars
    const sugarSelect = el('select', {});
    sugarSelect.addEventListener('change', updatePreview);
    const sugarNote = el('p', { class: 'muted', style: 'margin:4px 0 0' });
    const sugarBlock = el('div', {}, [
      el('label', { text: 'Zuckerart (für POD/PAC)' }), sugarSelect, sugarNote,
    ]);
    wrap.append(sugarBlock);

    function fillSugarOptions(selectKey) {
      sugarSelect.replaceChildren();
      if (mixture) {
        sugarSelect.append(el('option', { value: '__mix__', selected: selectKey === '__mix__' },
          `Mischung erkannt (${mixture.count} Zucker)`));
      }
      for (const s of SUGAR_TYPES) {
        sugarSelect.append(el('option', { value: s.key, selected: selectKey === s.key }, s.label));
      }
    }
    fillSugarOptions('sucrose');

    function currentPodPac() {
      if (sugarSelect.value === '__mix__' && mixture) return { pod: mixture.pod, pac: mixture.pac };
      const s = sugarByKey(sugarSelect.value);
      return { pod: s.pod, pac: s.pac };
    }

    function syncSugarState() {
      const milk = milkInput.checked;
      sugarSelect.disabled = milk;
      sugarBlock.style.opacity = milk ? '0.5' : '1';
      sugarNote.textContent = mixture && !milk
        ? `Gewichteter Mittelwert aus: ${mixture.labels.join(', ')} → POD ${mixture.pod}, PAC ${mixture.pac}`
        : '';
    }

    // --- Live-Vorschau ---
    const preview = el('div', { class: 'card' });
    wrap.append(el('label', { text: 'Ergebnis (wird übernommen)' }), preview);

    function read() {
      const o = {};
      for (const f of fields) o[f.key] = inputs[f.key].value;
      return o;
    }
    function current() {
      const { pod, pac } = currentPodPac();
      return deriveFromLabel(read(), { isMilk: milkInput.checked, pod, pac });
    }
    function cell(k, v) {
      return el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]);
    }
    function updatePreview() {
      const r = current();
      preview.replaceChildren(
        el('div', { class: 'stats' }, [
          cell('Fett', `${r.fat} %`),
          cell('Zucker', `${r.sugars} %`),
          cell('fettfr. Milchtr.', `${r.msnf} %`),
          cell('andere Feststoffe', `${r.otherSolids} %`),
          cell('Trockenmasse', `${r.totalSolids} %`),
          cell('Wasser', `${r.water} %`),
          cell('Salz', `${r.nacl} %`),
          cell('POD', String(r.pod)),
          cell('PAC', String(r.pac)),
        ])
      );
    }

    // --- OFF-Logik: Suche, Trefferliste, Produkt laden ---

    // Übernimmt ein geladenes Produkt in Felder, Zuckerart und Vorschau.
    function loadProduct(off) {
      for (const f of fields) {
        const val = off.nutriments[f.key];
        inputs[f.key].value = val ? val : '';
      }
      mixture = off.sugars.length > 1 ? blendSugars(off.sugars) : null;
      const single = off.sugars.length === 1 ? off.sugars[0].key : null;
      const looksMilk = off.sugars.some((s) => s.key === 'lactose') && off.sugars.length === 1;
      milkInput.checked = looksMilk;
      fillSugarOptions(mixture ? '__mix__' : single || 'sucrose');
      syncSugarState();

      meta = {
        barcode: off.barcode,
        productName: off.productName,
        ingredientsText: off.ingredientsText,
        offUrl: off.offUrl,
        nutriments: off.nutriments,
        source: 'off',
      };
      offStatus.style.color = 'var(--ok)';
      const zut = off.ingredientsText ? off.ingredientsText.slice(0, 80) + (off.ingredientsText.length > 80 ? '…' : '') : '—';
      offStatus.textContent = `✓ ${off.productName || 'Produkt'} geladen. Zutaten: ${zut}`;
      updatePreview();
    }

    // Lädt ein Produkt per Barcode und übernimmt es.
    async function loadByCode(code) {
      resultsBox.replaceChildren();
      offStatus.style.color = '';
      offStatus.textContent = 'Produkt wird geladen …';
      try {
        loadProduct(await fetchOFF(code));
      } catch (e) {
        offStatus.style.color = 'var(--danger)';
        offStatus.textContent = '⚠ ' + e.message;
      }
    }

    // Zeigt die Trefferliste; Klick auf einen Treffer lädt das Produkt.
    function showResults(list) {
      resultsBox.replaceChildren();
      if (!list.length) {
        offStatus.style.color = 'var(--danger)';
        offStatus.textContent = '⚠ Keine Treffer. Suchbegriff anpassen oder Werte manuell eingeben.';
        return;
      }
      offStatus.style.color = '';
      offStatus.textContent = `${list.length} Treffer – bitte auswählen:`;
      for (const r of list) {
        resultsBox.append(
          el('button', { type: 'button', class: 'btn block', style: 'text-align:left', onClick: () => loadByCode(r.code) }, [
            el('div', {}, [
              el('div', { text: r.name, style: 'font-weight:600' }),
              el('div', { class: 'muted', style: 'font-size:0.78rem', text: [r.brands, r.code].filter(Boolean).join(' · ') }),
            ]),
          ])
        );
      }
    }

    // Entscheidet anhand der Eingabe: reine Ziffern -> Barcode, sonst Namenssuche.
    async function runSearch() {
      const q = queryInput.value.trim();
      if (!q) { offStatus.style.color = 'var(--danger)'; offStatus.textContent = '⚠ Bitte Name oder Barcode eingeben.'; return; }
      searchBtn.disabled = true;
      resultsBox.replaceChildren();
      offStatus.style.color = '';
      offStatus.textContent = 'Suche bei Open Food Facts …';
      try {
        const isBarcode = /^\d{6,}$/.test(q.replace(/\s+/g, ''));
        if (isBarcode) {
          loadProduct(await fetchOFF(q));
        } else {
          showResults(await searchOFF(q));
        }
      } catch (e) {
        offStatus.style.color = 'var(--danger)';
        offStatus.textContent = '⚠ ' + e.message;
      } finally {
        searchBtn.disabled = false;
      }
    }
    searchBtn.addEventListener('click', runSearch);
    queryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

    // --- Hinweis + Aktionen ---
    wrap.append(el('p', { class: 'muted', text: '⚠ „Übernehmen" überschreibt bereits eingetragene Kennwerte im Zutaten-Formular. POD/PAC sind Richtwerte – bitte prüfen.' }));

    const actions = el('div', { class: 'btn-row' });
    actions.append(
      el('button', { type: 'button', class: 'btn block', text: 'Abbrechen', onClick: close }),
      el('button', { type: 'button', class: 'btn primary block', text: 'Übernehmen', onClick: () => {
        const r = current();
        close();
        // War die Eingabe ein Barcode (und kein Produkt geladen), als EAN merken.
        const typed = queryInput.value.replace(/\s+/g, '');
        const fallbackBarcode = /^\d{6,}$/.test(typed) ? typed : '';
        onApply({
          fat: r.fat, sugars: r.sugars, msnf: r.msnf, otherSolids: r.otherSolids, nacl: r.nacl, pod: r.pod, pac: r.pac,
          meta: { ...meta, barcode: meta.barcode || fallbackBarcode },
        });
      }})
    );
    wrap.append(actions);

    syncSugarState();
    updatePreview();
    return wrap;
  });
}
