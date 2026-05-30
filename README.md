# ICEkalt – Eis-Bilanzierung (PWA)

Progressive Web App zum Bilanzieren von Speiseeis. Rezepte werden aus Zutaten
zusammengesetzt; die App berechnet Fett, Zucker, fettfreie Milchtrockenmasse,
andere Feststoffe, Gesamttrockenmasse, Wasser, POD (Süßkraft), PAC sowie
Gefrierpunkt und empfohlene Speisetemperatur.

## Funktionen

- **Rezepte** – Editor mit Zutaten-Zeilen und Live-Bilanz, Eistyp-Zielbereiche
  mit Ampel-Balkengrafik, Gefrierpunkt + Speisetemperatur, Koch-Modus mit
  skalierbarer, abhakbarer Zutatenliste.
- **Zutaten** – Stammdaten mit Kennwerten je 100 g; optionaler Helfer zur
  Berechnung aus einer Nährwerttabelle inkl. Anbindung an
  [Open Food Facts](https://world.openfoodfacts.org) (Suche nach Name/Barcode).
- **Einstellungen** – Servier-Parameter, Backup (JSON-Export/Import), Reset.

Alle Mengen werden massenbasiert in **Gramm** geführt. Daten liegen lokal im
Browser (IndexedDB), kein Server, kein Konto.

## Projektstruktur

```
index.html              App-Shell + Bottom-Tab-Navigation
manifest.webmanifest    PWA-Manifest
sw.js                   Service Worker (Offline-Cache)
css/styles.css          Styling
js/app.js               Routing
js/db.js                IndexedDB-Zugriff, Seed, Export/Import
js/balance.js           Bilanzierung
js/nutrition.js         Nährwert-Helfer / Open Food Facts
js/ui.js                DOM-/Modal-Helfer
js/views/               Rezepte, Zutaten, Einstellungen
icons/                  App-Icons
```
