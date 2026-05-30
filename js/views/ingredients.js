// Zutaten-Verwaltung: Liste + Anlegen/Bearbeiten/Löschen.
import { db } from '../db.js';
import { el, openModal, confirmDialog } from '../ui.js';
import { openNutritionHelper } from '../nutrition.js';

const CATEGORIES = ['Milchprodukte', 'Zucker', 'Früchte', 'Fette', 'Zusatzstoffe', 'Sonstiges'];

// Alle Mengen werden in Gramm geführt und gerechnet.
const UNIT = 'g';

const FIELDS = [
  { key: 'fat', label: 'Fett %' },
  { key: 'sugars', label: 'Zucker %' },
  { key: 'msnf', label: 'fettfr. Milchtr. %' },
  { key: 'otherSolids', label: 'andere Feststoffe %' },
  { key: 'nacl', label: 'Salz % (Gefrierpkt.)' },
  { key: 'glycerol', label: 'Glycerin % (Gefrierpkt.)' },
  { key: 'pod', label: 'POD (Süßkraft)' },
  { key: 'pac', label: 'PAC' },
];

export async function renderIngredients(root, { navigate }) {
  const items = (await db.getAll('ingredients')).sort((a, b) => a.name.localeCompare(b.name));

  const list = el('div', { class: 'list' });
  if (items.length === 0) {
    list.append(el('div', { class: 'empty', text: 'Noch keine Zutaten. Tippe auf +' }));
  }
  for (const ing of items) {
    list.append(
      el('div', { class: 'card', onClick: () => openForm(ing) }, [
        el('div', { class: 'row' }, [
          el('div', {}, [
            el('h3', { text: ing.name, style: 'margin:0 0 2px;font-size:1rem;' }),
            el('span', { class: 'tag', text: ing.category || 'Sonstiges' }),
            ing.source === 'off' ? el('span', { class: 'tag', style: 'margin-left:6px', text: 'OFF' }) : null,
          ]),
          el('div', { class: 'muted', text: `Fett ${ing.fat || 0}% · Zucker ${ing.sugars || 0}% · je 100 ${UNIT}` }),
        ]),
      ])
    );
  }

  root.append(list);
  root.append(el('button', { class: 'fab', text: '+', 'aria-label': 'Zutat hinzufügen', onClick: () => openForm() }));

  function openForm(existing) {
    openModal(existing ? 'Zutat bearbeiten' : 'Neue Zutat', (close) => {
      const v = existing || {};
      const inputs = {};
      const form = el('form', { class: 'list' });

      // Herkunfts-/Produktdaten (z. B. von Open Food Facts übernommen).
      // Werden mitgespeichert und bei OFF-Quelle samt Link angezeigt.
      let meta = {
        barcode: v.barcode || '',
        nutriments: v.nutriments || null,
        ingredientsText: v.ingredientsText || '',
        offUrl: v.offUrl || '',
        source: v.source || 'manual',
      };

      const nameInput = el('input', { value: v.name || '', required: true, placeholder: 'z. B. Vollmilch 3,5%' });
      form.append(el('label', { text: 'Name' }), nameInput);

      const catSelect = el('select', {},
        CATEGORIES.map((c) => el('option', { value: c, selected: v.category === c }, c))
      );
      form.append(el('label', { text: 'Kategorie' }), catSelect);

      // Helfer: Kennwerte aus einer Nährwerttabelle (je 100 g) berechnen.
      const helperHint = el('p', { class: 'muted', style: 'display:none;margin:4px 0 0;color:var(--ok)' });
      const helperBtn = el('button', {
        type: 'button', class: 'btn block', text: '🧮 Aus Nährwerttabelle berechnen',
        onClick: () => openNutritionHelper((result) => {
          // Überschreiben: berechnete Werte in die Felder eintragen.
          for (const f of FIELDS) {
            if (result[f.key] !== undefined) inputs[f.key].value = result[f.key];
          }
          // Produkt-/Herkunftsdaten übernehmen (falls von OFF geholt).
          if (result.meta) {
            meta = { ...meta, ...result.meta };
            if (result.meta.source === 'off' && !nameInput.value.trim() && result.meta.productName) {
              nameInput.value = result.meta.productName;
            }
          }
          helperHint.textContent = '✓ Aus Nährwerttabelle übernommen – Werte überschrieben. POD/PAC bitte prüfen.';
          helperHint.style.display = 'block';
          renderSource();
        }),
      });
      form.append(helperBtn, helperHint);

      // Barcode (EAN) – manuell oder aus OFF.
      const barcodeInput = el('input', { value: meta.barcode, inputmode: 'numeric', placeholder: 'EAN (optional)' });
      barcodeInput.addEventListener('input', () => { meta.barcode = barcodeInput.value.trim(); });
      form.append(el('label', { text: 'Barcode (EAN)' }), barcodeInput);

      // Zutatenliste (von OFF oder selbst gepflegt).
      const ingrText = el('textarea', { placeholder: 'Zutatenliste (z. B. von der Verpackung)' }, meta.ingredientsText || '');
      ingrText.addEventListener('input', () => { meta.ingredientsText = ingrText.value; });
      form.append(el('label', { text: 'Zutatenliste' }), ingrText);

      // Quelle-/Herkunfts-Anzeige (OFF-Link + Nährwerte je 100 g).
      const sourceBox = el('div', {});
      form.append(sourceBox);
      function renderSource() {
        sourceBox.replaceChildren();
        const n = meta.nutriments;
        const children = [];
        if (meta.source === 'off' && meta.offUrl) {
          children.push(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
            el('span', { class: 'tag', text: 'Quelle: Open Food Facts' }),
            el('a', { href: meta.offUrl, target: '_blank', rel: 'noopener', class: 'muted', text: 'Produkt ansehen ↗' }),
          ]));
        }
        if (n) {
          children.push(el('div', { class: 'muted', style: 'font-size:0.78rem',
            text: `Nährwerte/100 g: Fett ${n.fat ?? '–'} · KH ${n.carbs ?? '–'} · Zucker ${n.sugars ?? '–'} · Eiweiß ${n.protein ?? '–'} · Salz ${n.salt ?? '–'}` }));
        }
        if (children.length) sourceBox.append(el('div', { class: 'card', style: 'padding:10px' }, children));
      }
      renderSource();

      const grid = el('div', { class: 'grid-2' });
      for (const f of FIELDS) {
        const input = el('input', { type: 'number', step: '0.1', value: v[f.key] ?? '', inputmode: 'decimal' });
        inputs[f.key] = input;
        grid.append(el('div', {}, [el('label', { text: f.label }), input]));
      }
      // Kennwerte sind Prozente bezogen auf 100 g der Zutat.
      form.append(el('label', { text: `Kennwerte je 100 ${UNIT}` }), grid);

      const actions = el('div', { class: 'btn-row' });
      if (existing) {
        actions.append(
          el('button', { type: 'button', class: 'btn danger', text: 'Löschen', onClick: async () => {
            if (await confirmDialog(`„${existing.name}" wirklich löschen?`)) {
              await db.remove('ingredients', existing.id);
              close();
              navigate('ingredients');
            }
          }})
        );
      }
      actions.append(el('button', { type: 'submit', class: 'btn primary block', text: 'Speichern' }));
      form.append(actions);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rec = {
          ...(existing || {}),
          name: nameInput.value.trim(),
          category: catSelect.value,
          barcode: meta.barcode || '',
          ingredientsText: meta.ingredientsText || '',
          nutriments: meta.nutriments || null,
          offUrl: meta.offUrl || '',
          source: meta.source || 'manual',
        };
        for (const f of FIELDS) rec[f.key] = parseFloat(inputs[f.key].value) || 0;
        if (!rec.name) return;
        await db.put('ingredients', rec);
        close();
        navigate('ingredients');
      });

      return form;
    });
  }
}
