// Rezepte: Liste mit Bild + Editor mit Zutaten-Zeilen und Live-Bilanz.
import { db } from '../db.js';
import { balance, fmt, ICE_TYPES, evaluate, optimum, barStatus, serveTemperature, frozenVolumeL, massForFrozenVolumeL } from '../balance.js';
import { el, openModal, confirmDialog } from '../ui.js';
import { getConfig } from '../config.js';

export async function renderRecipes(root, { navigate }) {
  const recipes = (await db.getAll('recipes')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const ingredients = await db.getAll('ingredients');
  const ingById = new Map(ingredients.map((i) => [i.id, i]));

  const list = el('div', { class: 'list' });
  if (recipes.length === 0) {
    list.append(el('div', { class: 'empty', text: 'Noch keine Rezepte. Tippe auf +' }));
  }
  for (const r of recipes) {
    const b = balance(r.items || [], ingById);
    const thumb = el('img', { class: 'recipe-thumb', alt: r.name });
    if (r.image instanceof Blob) {
      const url = URL.createObjectURL(r.image);
      thumb.src = url;
      thumb.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    } else {
      thumb.src = placeholderThumb();
    }
    const ev = evaluate(b, r.type);
    const warn = Object.values(ev.metrics).filter((m) => m.status !== 'ok').length;
    const cookBtn = el('button', {
      class: 'cook-btn', title: 'Zubereiten', 'aria-label': 'Zubereiten',
      onClick: (e) => { e.stopPropagation(); openCook(r); },
    }, '🍳');
    list.append(
      el('div', { class: 'card recipe-card', onClick: () => openEditor(r) }, [
        thumb,
        el('div', { class: 'recipe-info' }, [
          el('h3', { text: r.name || 'Unbenannt' }),
          el('p', { text: `${fmt(b.total, 0)} g · ~${fmt(frozenVolumeL(b.total, r.overrun ?? 20), 2)} L · TS ${fmt(b.percent.totalSolids)}%` }),
          el('div', { style: 'margin-top:4px' }, [
            el('span', { class: 'tag', text: ev.type.label }),
            warn > 0
              ? el('span', { class: 'tag', style: 'margin-left:6px;color:#ffa94d', text: `⚠ ${warn} außerhalb` })
              : el('span', { class: 'tag', style: 'margin-left:6px;color:var(--ok)', text: '✓ in Norm' }),
          ]),
        ]),
        cookBtn,
      ])
    );
  }

  root.append(list);
  root.append(el('button', { class: 'fab', text: '+', 'aria-label': 'Rezept hinzufügen', onClick: () => openEditor() }));

  // Koch-Modus: Menge per Schieberegler wählen, dann eine große, abhakbare
  // Zutatenübersicht für die Zubereitung erzeugen.
  function openCook(r) {
    const b = balance(r.items || [], ingById);
    const overrun = r.overrun ?? 20;
    const expectedL = frozenVolumeL(b.total, overrun);
    openModal('🍳 Zubereiten – ' + (r.name || 'Rezept'), () => {
      const wrap = el('div', { class: 'list' });

      if (b.total <= 0) {
        wrap.append(el('p', { class: 'muted', text: 'Dieses Rezept hat noch keine Zutaten.' }));
        return wrap;
      }

      // Schieberegler: fertige Eismenge (mit Luft), 0,4–3 L in 0,1-Schritten.
      const initial = Math.min(3, Math.max(0.4, Math.round(expectedL / 0.1) * 0.1));
      const sliderVal = el('div', { class: 'cook-slider-val', text: `${fmt(initial, 1)} L` });
      const slider = el('input', { type: 'range', min: '0.4', max: '3', step: '0.1', value: String(initial) });
      slider.addEventListener('input', () => { sliderVal.textContent = `${fmt(parseFloat(slider.value), 1)} L`; });

      const out = el('div', {});
      // Gesamter Skalierungsblock – wird nach "Übersicht erstellen" ausgeblendet.
      const scaleBlock = el('div', { class: 'list' }, [
        el('div', { class: 'cook-expected' }, [
          el('div', { class: 'muted', text: 'Erwartete Menge (mit Aufschlag)' }),
          el('div', { class: 'cook-expected-val', text: `${fmt(expectedL, 2)} L` }),
        ]),
        el('label', { text: 'Gewünschte fertige Menge' }), sliderVal, slider,
        el('button', { type: 'button', class: 'btn primary block', text: 'Übersicht erstellen', onClick: () => {
          renderPrep(out, r, b, overrun, parseFloat(slider.value));
          scaleBlock.style.display = 'none';
          out.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        }}),
      ]);
      wrap.append(scaleBlock, out);
      return wrap;
    });
  }

  // Skalierte, abhakbare Zubereitungs-Übersicht in container rendern.
  function renderPrep(container, r, b, overrun, targetL) {
    const targetMass = massForFrozenVolumeL(targetL, overrun);
    const scale = b.total > 0 ? targetMass / b.total : 0;
    const rows = (r.items || []).filter((it) => it.ingredientId).map((it) => {
      const ing = ingById.get(it.ingredientId);
      const g = (Number(it.grams) || 0) * scale;
      const cb = el('input', { type: 'checkbox' });
      const row = el('label', { class: 'prep-row' }, [
        cb,
        el('span', { class: 'prep-amt', text: `${fmt(g, 0)} g` }),
        el('span', { class: 'prep-name', text: ing ? ing.name : '—' }),
      ]);
      cb.addEventListener('change', () => row.classList.toggle('done', cb.checked));
      return row;
    });

    container.replaceChildren(
      el('div', { class: 'prep-card' }, [
        el('div', { class: 'prep-head' }, [
          el('div', { class: 'prep-title', text: r.name || 'Rezept' }),
          el('div', { class: 'muted', text: `${fmt(targetL, 1)} L fertig · ${fmt(targetMass, 0)} g Mix · Aufschlag ${fmt(overrun, 0)} %` }),
        ]),
        el('div', { class: 'prep-list' }, rows),
        r.note ? el('div', { class: 'prep-note' }, [
          el('div', { class: 'muted', style: 'margin-bottom:2px', text: 'Notiz' }),
          el('div', { text: r.note }),
        ]) : null,
      ])
    );
  }

  function openEditor(existing) {
    openModal(existing ? 'Rezept bearbeiten' : 'Neues Rezept', (close) => {
      const r = existing ? { ...existing, items: (existing.items || []).map((x) => ({ ...x })) } : { items: [] };
      let imageBlob = r.image instanceof Blob ? r.image : null;

      const wrap = el('div', { class: 'list' });

      // Bild
      const preview = el('img', { class: 'recipe-thumb', style: 'width:96px;height:96px;' });
      const refreshPreview = () => {
        if (imageBlob) {
          const url = URL.createObjectURL(imageBlob);
          preview.src = url;
          preview.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        } else {
          preview.src = placeholderThumb();
        }
      };
      refreshPreview();
      const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) { imageBlob = fileInput.files[0]; refreshPreview(); }
      });
      wrap.append(
        el('div', { class: 'row' }, [
          preview,
          el('div', { class: 'list', style: 'flex:1' }, [
            el('button', { type: 'button', class: 'btn block', text: '📷 Bild wählen', onClick: () => fileInput.click() }),
            imageBlobBtn(),
          ]),
        ]),
        fileInput
      );
      function imageBlobBtn() {
        const btn = el('button', { type: 'button', class: 'btn block', text: 'Bild entfernen', onClick: () => { imageBlob = null; refreshPreview(); } });
        return btn;
      }

      // Name + Eistyp + Notiz
      const nameInput = el('input', { value: r.name || '', placeholder: 'z. B. Vanille-Gelato' });
      const typeSelect = el('select', {},
        ICE_TYPES.map((t) => el('option', { value: t.key, selected: (r.type || 'eiscreme') === t.key }, t.label))
      );
      typeSelect.addEventListener('change', () => drawSummary());
      const noteInput = el('textarea', { placeholder: 'Notizen, Zubereitung …' }, r.note || '');
      const overrunInput = el('input', { type: 'number', step: '1', min: '0', inputmode: 'decimal', value: String(r.overrun ?? 20) });
      overrunInput.addEventListener('input', () => drawSummary());
      wrap.append(
        el('label', { text: 'Name' }), nameInput,
        el('label', { text: 'Eistyp (Zielbereiche)' }), typeSelect,
        el('label', { text: 'Aufschlag in % (Luft beim Gefrieren)' }), overrunInput,
        el('label', { text: 'Notiz' }), noteInput
      );

      // Zutaten-Zeilen (alle Mengen in Gramm)
      wrap.append(el('label', { text: 'Zutaten (g)' }));
      const rowsBox = el('div', { class: 'list' });
      wrap.append(rowsBox);

      const summaryBox = el('div', { class: 'card' });
      wrap.append(summaryBox);

      function drawRows() {
        rowsBox.replaceChildren();
        r.items.forEach((item, idx) => {
          const sel = el('select', {},
            [el('option', { value: '' }, '— Zutat —')].concat(
              ingredients.map((i) => el('option', { value: i.id, selected: i.id === item.ingredientId }, i.name))
            )
          );
          sel.addEventListener('change', () => { item.ingredientId = sel.value ? Number(sel.value) : null; drawSummary(); });
          const qty = el('input', { type: 'number', inputmode: 'decimal', step: '1', value: item.grams ?? '', placeholder: 'g', style: 'max-width:72px' });
          qty.addEventListener('input', () => { item.grams = parseFloat(qty.value) || 0; drawSummary(); });
          const unitSuffix = el('span', { class: 'muted', style: 'min-width:24px;text-align:center', text: 'g' });
          const del = el('button', { type: 'button', class: 'btn danger', text: '✕', onClick: () => { r.items.splice(idx, 1); drawRows(); drawSummary(); } });
          rowsBox.append(el('div', { class: 'row', style: 'gap:8px' }, [
            el('div', { style: 'flex:1' }, [sel]), qty, unitSuffix, del,
          ]));
        });
        rowsBox.append(el('button', { type: 'button', class: 'btn block', text: '+ Zutat', onClick: () => { r.items.push({ ingredientId: null, grams: 0 }); drawRows(); drawSummary(); } }));
      }

      function drawSummary() {
        const b = balance(r.items, ingById);
        const ev = evaluate(b, typeSelect.value);
        const warn = Object.values(ev.metrics).filter((m) => m.status !== 'ok').length;
        const t = ev.type.ranges;
        // Eine gemeinsame Definition für Balken UND Kennwert-Kacheln, damit
        // Balken-Kürzel (in Klammern am Kachel-Label) immer zusammenpassen.
        const metrics = [
          { stat: 'Fett', bar: 'Fett', value: b.percent.fat, unit: '%', ev: ev.metrics.fat, range: t.fat },
          { stat: 'Zucker', bar: 'Zuck', value: b.percent.sugars, unit: '%', ev: ev.metrics.sugars, range: t.sugars },
          { stat: 'fettfr. Milchtr.', bar: 'MSNF', value: b.percent.msnf, unit: '%', ev: ev.metrics.msnf, range: t.msnf },
          { stat: 'Trockenmasse', bar: 'TS', value: b.percent.totalSolids, unit: '%', ev: ev.metrics.totalSolids, range: t.totalSolids },
          { stat: 'Süßkraft', bar: 'POD', value: b.pod, unit: '', ev: ev.metrics.pod, range: t.pod },
          { stat: 'PAC', bar: 'PAC', value: b.pac, unit: '', ev: ev.metrics.pac, range: t.pac },
          { stat: 'andere Feststoffe', bar: 'aFst', value: b.percent.otherSolids, unit: '%', ev: null, range: null },
          { stat: 'Wasser', bar: 'H₂O', value: b.percent.water, unit: '%', ev: null, range: null },
        ];

        const overrun = parseFloat(overrunInput.value) || 0;
        summaryBox.replaceChildren(
          el('div', { class: 'row', style: 'margin-bottom:8px' }, [
            el('strong', { text: 'Bilanz' }),
            el('span', { class: 'muted', text: `${fmt(b.total, 0)} g · ~${fmt(frozenVolumeL(b.total, overrun), 2)} L` }),
          ]),
          serveTempPanel(b),
          balanceChart(metrics),
          el('div', { class: 'stats' },
            metrics.map((m) => rated(`${m.stat} (${m.bar})`, m.value, m.unit, m.ev))
          ),
          warn === 0
            ? el('p', { class: 'muted', style: 'margin:10px 0 0;color:var(--ok)', text: `✓ Alle Kennwerte im Zielbereich für ${ev.type.label}.` })
            : el('p', { class: 'muted', style: 'margin:10px 0 0;color:#ffa94d', text: `⚠ ${warn} Kennwert(e) außerhalb des Zielbereichs für ${ev.type.label}.` })
        );
      }

      drawRows();
      drawSummary();

      // Aktionen
      const actions = el('div', { class: 'btn-row' });
      if (existing) {
        actions.append(el('button', { type: 'button', class: 'btn danger', text: 'Löschen', onClick: async () => {
          if (await confirmDialog(`„${existing.name}" wirklich löschen?`)) {
            await db.remove('recipes', existing.id);
            close();
            navigate('recipes');
          }
        }}));
      }
      actions.append(el('button', { type: 'button', class: 'btn primary block', text: 'Speichern', onClick: save }));
      wrap.append(actions);

      async function save() {
        const rec = {
          ...(existing || {}),
          name: nameInput.value.trim() || 'Unbenannt',
          type: typeSelect.value,
          overrun: parseFloat(overrunInput.value) || 0,
          note: noteInput.value,
          items: r.items.filter((it) => it.ingredientId),
          image: imageBlob || undefined,
        };
        await db.put('recipes', rec);
        close();
        navigate('recipes');
      }

      return wrap;
    });
  }
}

function stat(k, v) {
  return el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]);
}

// Empfohlene Speisetemperaturen: weich / optimal / fest. Abgeleitet aus dem
// Gefrierpunkt und dem Ziel-Anteil gefrorenen Wassers (Serviergrenze ± Bereich
// aus den Einstellungen). Gefrierpunkt selbst als Zusatzinfo darunter.
function serveTempPanel(b) {
  const { serveLimit, serveBand } = getConfig();
  // weich = weniger gefroren (wärmer), fest = mehr gefroren (kälter)
  const points = [
    { label: 'weich', frac: serveLimit - serveBand },
    { label: 'optimal', frac: serveLimit },
    { label: 'fest', frac: serveLimit + serveBand },
  ];
  const cells = points.map((p, i) =>
    el('div', { class: 'serve-cell' + (i === 1 ? ' is-optimal' : ''), title: `${fmt(p.frac, 0)} % gefrorenes Wasser` }, [
      el('div', { class: 'serve-lbl', text: p.label }),
      el('div', { class: 'serve-temp', text: b.freezingPoint ? `${fmt(serveTemperature(b.freezingPoint, p.frac))} °C` : '–' }),
      el('div', { class: 'serve-frac', text: `${fmt(p.frac, 0)} %` }),
    ])
  );
  return el('div', { class: 'serve-panel' }, [
    el('div', { class: 'serve-title', text: 'Empfohlene Speisetemperatur' }),
    el('div', { class: 'serve-grid' }, cells),
    el('div', { class: 'serve-foot muted', text: `Gefrierpunkt ${b.freezingPoint ? fmt(b.freezingPoint) + ' °C' : '–'} · Frostanteil ${fmt(serveLimit, 0)} % ±${fmt(serveBand, 0)}` }),
  ]);
}

// Balkengrafik aller Kennwerte. Balken MIT Zielbereich nutzen die bereichs-
// bezogene Skala (untere Grenze 60 %, Optimum 70 %, obere Grenze 80 %) und
// färben sich grün/gelb/rot. Balken OHNE Zielbereich (andere Feststoffe,
// Wasser) nutzen eine absolute Skala (Wert in % = Höhe) und bleiben grau.
function balanceChart(metrics) {
  const bars = metrics.map((m) => {
    let h, status, title;
    if (m.range) {
      const opt = optimum(m.range);
      const span = (m.range[1] - m.range[0]) || 1;
      h = Math.max(2, Math.min(100, 70 + ((m.value - opt) / span) * 20));
      const r = barStatus(m.value, m.range);
      status = r.status;
      title = `${fmt(m.value)} (Ziel ${m.range[0]}–${m.range[1]}${r.deviation ? `, ${fmt(r.deviation, 0)} % außerhalb` : ''})`;
    } else {
      h = Math.max(2, Math.min(100, m.value));
      status = 'none';
      title = `${fmt(m.value)} (kein Zielbereich)`;
    }
    return el('div', { class: 'bar-col' }, [
      el('div', { class: `bar-fill ${status}`, style: `height:${h}%`, title }),
    ]);
  });

  const labels = metrics.map((m) =>
    el('div', { class: 'bar-cell' }, [
      el('div', { class: 'bar-val', text: fmt(m.value, 0) }),
      el('div', { class: 'bar-lbl', text: m.bar }),
    ])
  );

  return el('div', { class: 'barchart' }, [
    el('div', { class: 'barchart-plot' }, [
      ...bars,
      el('div', { class: 'barchart-line maxline', title: 'obere Grenze des Zielbereichs' }),
      el('div', { class: 'barchart-line optline', title: 'Optimum (Bereichsmitte)' }),
      el('div', { class: 'barchart-line minline', title: 'untere Grenze des Zielbereichs' }),
    ]),
    el('div', { class: 'barchart-labels' }, labels),
    el('div', { class: 'muted', style: 'font-size:0.72rem;text-align:center;margin-top:2px', text: '— grün = Optimum · gelb = Bereichsgrenzen · grau = ohne Zielbereich' }),
  ]);
}

// Kennwert-Kachel mit optionaler Ampel-Bewertung gegen einen Zielbereich.
function rated(label, value, unit, metric) {
  const cls = metric ? `stat ${metric.status}` : 'stat';
  const children = [
    el('div', { class: 'k', text: label }),
    el('div', { class: 'v', text: `${fmt(value)}${unit ? ' ' + unit : ''}` }),
  ];
  if (metric) {
    children.push(el('div', { class: 't', text: `Ziel ${metric.range[0]}–${metric.range[1]}${unit ? ' ' + unit : ''}` }));
  }
  return el('div', { class: cls }, children);
}

function placeholderThumb() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#1b2740"/><text x="50%" y="54%" font-size="40" text-anchor="middle" fill="#9fb0c8">🍨</text></svg>'
  );
}
