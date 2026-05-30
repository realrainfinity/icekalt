# ICEkalt – Eis-Bilanzierung (PWA)

Lokale Progressive Web App zum Bilanzieren von Speiseeis. Rezepte werden aus
Zutaten zusammengesetzt; die App berechnet Fett, Zucker, fettfreie
Milchtrockenmasse, andere Feststoffe, Gesamttrockenmasse, Wasser sowie POD
(Süßkraft) und PAC (Gefrierpunkt-Senkung).

## Funktionsumfang (Grundgerüst)

- **Rezepte** – Liste mit Bild, Editor mit Zutaten-Zeilen und Live-Bilanz.
  Jedes Rezept hat einen **Eistyp** (Eiscreme / Gelato / Sorbet) mit
  hinterlegten Zielbereichen; Kennwerte außerhalb der Norm werden farbig
  (Ampel) markiert und in der Liste als Warnung gezählt. Im Bilanz-Block zeigt
  eine **Balkengrafik** alle Kennwerte (Fett, Zucker, MSNF, andere Feststoffe,
  TS, Wasser, POD, PAC). Balken mit Zielbereich sind **bereichsbezogen**
  skaliert: untere Grenze → 60 %, Optimum → 70 %, obere Grenze → 80 % Höhe; eine
  **grüne Linie** markiert das Optimum, zwei **hellgelbe Linien** die
  Bereichsgrenzen. Balkenfarbe: **grün** im Zielbereich, **gelb** bei < 20 % und
  **rot** bei ≥ 20 % Abweichung vom nächsten Bereichsrand; Kennwerte ohne
  Zielbereich (Wasser, andere Feststoffe) erscheinen **grau** (absolute Skala).
  Im Bilanz-Kopf zeigt ein Panel die **empfohlene Speisetemperatur** in drei
  Stufen (**weich / optimal / fest**), berechnet aus dem Gefrierpunkt und dem
  Ziel-Anteil gefrorenen Wassers; der **Gefrierpunkt** steht als Zusatzinfo
  darunter. Die zwei Parameter dafür (**Serviergrenze %** und **Bereich ±%**)
  stehen in den Einstellungen (Default 75 % / 3 %). Über das Feld **Aufschlag
  in %** (Default 20) wird aus der Mix-Masse die **fertige Liter-Menge**
  geschätzt (Mix-Dichte ~1,1 g/ml) und neben der Gramm-Menge angezeigt. Ein
  **Koch-Button (🍳)** je Rezept öffnet den Zubereitungs-Modus: Zielmenge per
  Schieberegler (0,4–3 L in 0,2-Schritten) wählen → große, **abhakbare
  Zutatenliste** mit skalierten Mengen plus Notiz.
- **Zutaten** – Stammdaten (Kategorie, Barcode/EAN, Kennwerte je 100 g,
  Nährwerte und Zutatenliste), CRUD. Optionaler Helfer
  **„🧮 Aus Nährwerttabelle berechnen"**: aus den Pflichtangaben der
  EU-Nährwerttabelle (je 100 g) werden Fett, Zucker, Trockenmasse, MSNF und
  andere Feststoffe abgeleitet; POD/PAC über eine **Zuckerart-Auswahl**.
  Milchprodukt-Schalter ordnet die Laktose der fettfreien Milchtrockenmasse zu.
  Per **Suche bei [Open Food Facts](https://world.openfoodfacts.org)** (nach
  **Name oder Barcode/EAN**) werden Nährwerte und Zutatenliste automatisch
  geholt; bei mehreren Namenstreffern erscheint eine **Auswahlliste**. Die
  Zuckerart wird aus der Zutatenliste erkannt. Bei **mehreren Zuckern** wird POD/PAC als nach Menge
  **gewichteter Mittelwert** gebildet. Aus OFF geholte Zutaten speichern den
  **Link zur Produktseite**. Logik in `js/nutrition.js`.
- **Einstellungen** – Datenbestand, Backup (Export/Import als JSON inkl. Bilder), Zurücksetzen.

Zielbereiche je Eistyp stehen in `js/balance.js` (`ICE_TYPES`) und lassen sich
dort an die eigene Rezeptur-Schule anpassen.

> Maßeinheit: Alle Mengen werden in **Gramm (g)** geführt und massenbasiert
> gerechnet. Die Einheit „g" wird in allen Eingabe- und Infofeldern angezeigt.

## Speicher-Backend

**IndexedDB** (siehe `js/db.js`). Begründung: ~100 Rezepte mit je einem Bild und
~300 Zutaten passen problemlos in die IndexedDB-Quota moderner Android-Browser.
Bilder werden als **Blob** gespeichert (kein Base64-Overhead, kein
localStorage-Limit). Alles bleibt offline auf dem Gerät; kein Server, kein Konto.

## Projektstruktur

```
index.html              App-Shell + Bottom-Tab-Navigation
manifest.webmanifest    PWA-Manifest (Name, Icons, Farben)
sw.js                   Service Worker (Offline-Cache)
css/styles.css          Mobile-first Styling, Dark/Light
js/app.js               Routing zwischen den drei Rubriken
js/db.js                IndexedDB-Zugriff, Seed, Export/Import
js/balance.js           Bilanzierungs-Berechnung
js/nutrition.js         Helfer: Eis-Kennwerte aus Nährwerttabelle
js/ui.js                DOM-/Modal-Helfer
js/views/recipes.js     Rezepte
js/views/ingredients.js Zutaten
js/views/settings.js    Einstellungen
icons/                  App-Icons (SVG)
```

## Lokal starten (Visual Studio)

PWAs brauchen einen Webserver (Service Worker laufen nicht über `file://`).

- **Visual Studio**: Ordner über *Datei → Öffnen → Website…* öffnen und mit
  *Strg+F5* starten – VS hostet die Dateien dann über `http://localhost:<port>`.
- Alternativ ein beliebiger Static-Server, z. B.:
  ```powershell
  npx serve .
  # oder
  python -m http.server 8080
  ```
  Dann `http://localhost:8080` im Browser öffnen.

## Auf dem Samsung S25 installieren

Der Homescreen-Eintrag erfordert **HTTPS** (Ausnahme: `localhost` auf demselben
Gerät). Empfohlen: einmalig statisch hosten, z. B. GitHub Pages, Netlify oder
Cloudflare Pages – einfach den Ordner deployen.

1. Die HTTPS-URL im **Chrome** oder **Samsung Internet** auf dem S25 öffnen.
2. Menü (⋮) → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
3. ICEkalt erscheint mit eigenem Icon und startet im Vollbild (`standalone`).

> Hinweis Icons: Aktuell als SVG hinterlegt (von aktuellen Android-Browsern
> unterstützt). Bei Bedarf zusätzlich PNGs in 192×192 und 512×512 erzeugen und
> im `manifest.webmanifest` ergänzen.

## Nach Änderungen

`CACHE_VERSION` in `sw.js` erhöhen, damit der Service Worker die neue
App-Shell ausliefert.
