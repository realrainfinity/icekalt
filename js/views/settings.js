// Einstellungen: Statistik, Servier-Parameter, Backup (Export/Import), Reset.
import { db, exportData, importData } from '../db.js';
import { el, confirmDialog } from '../ui.js';
import { getConfig, setConfig } from '../config.js';

export async function renderSettings(root, { navigate }) {
  const [nRecipes, nIngredients] = await Promise.all([db.count('recipes'), db.count('ingredients')]);

  // Übersicht
  root.append(
    el('div', { class: 'card' }, [
      el('div', { class: 'row', style: 'margin-bottom:8px' }, [el('strong', { text: 'Datenbestand' }), el('span', { class: 'muted', text: 'lokal (IndexedDB)' })]),
      el('div', { class: 'stats' }, [
        stat('Rezepte', String(nRecipes)),
        stat('Zutaten', String(nIngredients)),
      ]),
    ])
  );

  // Servier-Parameter (steuern die Speisetemperatur-Anzeige im Rezept)
  const cfg = getConfig();
  const limitInput = el('input', { type: 'number', step: '1', min: '0', max: '100', inputmode: 'decimal', value: String(cfg.serveLimit) });
  const bandInput = el('input', { type: 'number', step: '1', min: '0', max: '50', inputmode: 'decimal', value: String(cfg.serveBand) });
  const saveServe = () => setConfig({
    serveLimit: parseFloat(limitInput.value) || 0,
    serveBand: parseFloat(bandInput.value) || 0,
  });
  limitInput.addEventListener('change', saveServe);
  bandInput.addEventListener('change', saveServe);
  root.append(
    el('div', { class: 'card' }, [
      el('strong', { text: 'Speisetemperatur' }),
      el('p', { class: 'muted', text: 'Bestimmt die drei empfohlenen Temperaturen (weich / optimal / fest) im Bilanzkopf eines Rezepts.' }),
      el('div', { class: 'grid-2' }, [
        el('div', {}, [el('label', { text: 'Serviergrenze in %' }), limitInput]),
        el('div', {}, [el('label', { text: 'Temp.-Bereich +/- in %' }), bandInput]),
      ]),
    ])
  );

  // Backup
  const status = el('p', { class: 'muted' });
  const fileInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const replace = await confirmDialog('Vorhandene Daten ERSETZEN? Abbrechen = an Bestand anhängen.');
      await importData(data, { replace });
      status.textContent = 'Import abgeschlossen.';
      navigate('settings');
    } catch (e) {
      status.textContent = 'Fehler beim Import: ' + e.message;
    }
  });

  root.append(
    el('div', { class: 'card' }, [
      el('strong', { text: 'Backup' }),
      el('p', { class: 'muted', text: 'Alle Rezepte (inkl. Bilder) und Zutaten als JSON sichern oder wiederherstellen.' }),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn primary block', text: '⬇ Exportieren', onClick: doExport }),
        el('button', { class: 'btn block', text: '⬆ Importieren', onClick: () => fileInput.click() }),
      ]),
      fileInput,
      status,
    ])
  );

  // Gefahrenzone
  root.append(
    el('div', { class: 'card' }, [
      el('strong', { text: 'Zurücksetzen' }),
      el('p', { class: 'muted', text: 'Löscht alle Rezepte und Zutaten unwiderruflich von diesem Gerät.' }),
      el('button', { class: 'btn danger block', text: 'Alle Daten löschen', onClick: async () => {
        if (await confirmDialog('Wirklich ALLE Daten löschen?')) {
          await db.clear('recipes');
          await db.clear('ingredients');
          navigate('settings');
        }
      }}),
    ])
  );

  root.append(el('p', { class: 'muted', style: 'text-align:center;margin-top:16px', text: 'ICEkalt · v1' }));

  async function doExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `icekalt-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Export gestartet.';
  }
}

function stat(k, v) {
  return el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]);
}
