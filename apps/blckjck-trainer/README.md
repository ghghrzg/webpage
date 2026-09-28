# European Blackjack Trainer

Mobile-first React/TypeScript-App für das Regelprofil **Wiesbaden Rules**. Vollständig clientseitig, ohne Konto, Tracking, externe Fonts oder Echtgeldfunktionen. Das ursprüngliche [Konzept](concept.md) bleibt unverändert erhalten.

## Starten

Node.js 22 oder neuer. Aus dem Repository-Hauptverzeichnis:

```sh
npm run install:blckjck-trainer
npm run dev:blckjck-trainer
```

Die Entwicklungsversion läuft unter `http://127.0.0.1:3002/contents/blckjck_trainer/`.

```sh
npm run test:blckjck-trainer
npm run build:blckjck-trainer
```

Der Build liegt in `contents/blckjck_trainer/` und passt zur vorhandenen GitHub-Pages-Seite samt automatischer Inhaltsliste und Custom Domain. Die vorhandenen `install:all`, `build:all` und `build:changed` entdecken das Projekt automatisch.

## Umgesetzt

- Adaptives Training mit Hard-, Soft-, Paar- und ENHC-Gruppen; Lernhinweise; Schwachstellen; manuelle Merkliste mit Pin, Erledigt-Status und Einzel-Drill.
- Casino-Test mit 100 Entscheidungen und Auswertung erst am Ende. Antwortzeit pausiert in anderen App-Bereichen, Einstellungen und bei verborgenem Browser-Tab.
- Ein zentraler, unveränderlicher Strategiedatensatz mit legalen Double-/Split-Fallbacks. 360 einzelne Tabellenzellen, davon 340 mit trainierbaren Entscheidungen; 21 wird im Spiel automatisch beendet.
- Sechs echte simulierte Decks ohne Zurücklegen, korrekte Ass-Wertung, ENHC, S17, 3:2, Double 9–11, DAS, vier Split-Hände, Ass-Split, Insurance und Even Money.
- Strategiehinweise vor/nach der Aktion oder deaktiviert. Erstversuch, Empfehlung und tatsächliche Aktion werden getrennt gespeichert.
- Lokale Statistiken einschließlich vier Vertrauens-Kategorien, Lernstand-Matrix, Sitzungsverlauf und manuell abhakbarem 3-Tage-Plan.
- Dunkel/hell/System, Desktop-Tastatursteuerung, installierbare Offline-PWA, geprüfter JSON-Import und Export.
- Laufende Spielrunden werden automatisch exakt fortgesetzt, einschließlich Shoe und bereits abgezogener Einsätze. Neue Trainer-Sessions beginnen beim Neuladen; ein laufender Casino-Test wird dabei nicht fortgesetzt, sein bisheriger Fortschritt bleibt als unvollständige Session erhalten.

## Plausibilitätsprüfung und bewusste Grenzen

Die `:chatgpt-content-reference`-Angaben im Konzept sind keine auflösbaren Quellen. Reale Quellen und Annahmen stehen in [docs/rules.md](docs/rules.md). Besonders:

1. Die zentralen Regeln wurden mit öffentlich zugänglichen Spielbank-Unterlagen abgeglichen.
2. **Ass-Re-Split bleibt unklar**; das Arbeitsprofil setzt `resplitAces: false`. Die Engine modelliert die Option ausdrücklich.
3. Die Strategie folgt der gelieferten ENHC-Matrix. Sie ist **kein solver-verifiziertes mathematisches Optimum für exakt Wiesbaden**. Ein unabhängiger Solver-Abgleich bleibt offen. Keine stillen Änderungen anhand einer US-Strategie.
4. Die ENHC-Abrechnung nimmt Verlust aller zusätzlichen Einsätze bei Dealer-Blackjack an; die öffentlich gelesenen Wiesbadener Regeln erläutern diesen Spezialfall nicht separat.
5. Ab weniger als 100 Karten wird **zwischen** Runden frisch gemischt. Keine Behauptung über die reale Mischmaschine oder deren Penetration.
6. Joker und TWINS/Crazy Twins fehlen bewusst; sie sind für die regulären Hände nicht nötig. Classic-Asset-Themes und weitere Regelprofile sind nicht umgesetzt.
7. Das Training bewertet tabellarische Entscheidungen, keine Gewinnchancen oder finanzielle Eignung. „Sicher“ heißt lediglich „nicht als unsicher markiert“. Die Tages-Challenge wird vom Nutzer selbst abgehakt.

## Tests und CI

```sh
cd apps/blckjck-trainer
npm test
npm run build
npm run test:e2e
```

Die Browsertests verwenden unter Windows das installierte Edge; unter CI Playwright Chromium. Für andere lokale Systeme `npx playwright install chromium` ausführen und `PLAYWRIGHT_CHANNEL=chromium` setzen.

Unit-Tests decken jede Tabellenzelle inklusive Karten-Kanonisierung, ENHC-Ausnahmen, relevante Spielübergänge und Auszahlungen, Unsicherheit und Backup-Validierung ab. Ein deterministischer Langlauf prüft 500 Runden einschließlich Kartenbestand und Wiederherstellung.

Die E2E-Tests prüfen Desktop und emuliertes iPhone, 320-Pixel-Layout, Warnmodi, Rundenspeicherung, JSON, den vollständigen Casino-Test und einen echten Offline-Reload über den Service Worker. Screenshots liegen lokal in `test-results/`.

`.github/workflows/blackjack-checks.yml` prüft und baut die App und stellt nur nach erfolgreichen Tests ein statisches Artefakt bereit. **Es ersetzt oder aktiviert kein Deployment**: Die Veröffentlichung erfolgt weiterhin über die bestehende Pages-Konfiguration dieses Repositorys. Gebaute Dateien unter `contents/` müssen gemeinsam mit den Quellen eingecheckt werden. Ein verbindlicher Test-Gate für die bestehende branchbasierte Pages-Veröffentlichung muss in den Repository-Einstellungen konfiguriert werden.

## Architektur und Speicherung

`src/core/` ist unabhängig von React: Karten, Regeln, Strategie, Engine, Training und validierte Persistenz. `src/pages/` enthält die vier Bereiche und Einstellungen. Es gibt keine Live-Abfragen beim Spielen und keine fremden Kartenbilder.

`european-blackjack-trainer:v1` ist der lokale Speicher-Schlüssel. Version 1 ist die erste Version; unbekannte zukünftige Versionen werden abgelehnt, bevor Daten ersetzt werden. Ein späteres Versionsupgrade benötigt eine explizite Migration vor `parseBackup`. Defekte lokale Daten werden unter `european-blackjack-trainer:v1:recovery` gesichert. Speicherfehler werden angezeigt. Importgrenze: 5 MB. Begrenzt werden nur Detailverläufe: 50 Sessions, 200 Spielentscheidungen und 50 Zeiten/10 Antworten je Zelle; Gesamtsummen bleiben erhalten.

Ein Browser-Tab ist der aktive Speicherbesitzer; parallele Tabs synchronisieren Spielstände nicht. Backups lassen sich zwischen Geräten übertragen.

## Unabhängiges Lernprojekt

Keine Verbindung zu, Beauftragung durch oder Unterstützung von Spielbank Wiesbaden. Nur virtuelles Übungsgeld. Quellcode dieser App: MIT; Hinweise zu eingebundenen Bibliotheken in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
