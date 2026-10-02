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
- **Strategy-Ranges** im eigenen Tab „Ranges“: 17 Kategorien aus der zentralen Matrix, jeweils alle zehn Dealer-Karten als 2×5-Raster. Aktion wählen und tippen oder über mehrere Felder wischen; „Alles“ und „Rest“ füllen mit der gewählten Aktion. Undo nimmt einen ganzen Wischstrich oder Füllvorgang zurück. Nach zehn Antworten zeigt „Prüfen“ Treffer, Korrekturen und die zusammenhängenden Dealer-Ranges; „Weiter“ startet die nächste Kategorie. Zufällige, nach Kategoriefehlern gewichtete Auswahl ohne direkte Wiederholung. H/S/D/P wählen die Aktion auch per Tastatur; Strg/Cmd+Z macht die letzte Markierung rückgängig.
- **Ranges-Übersicht** zeigt alle 17 Kategorien mit Lösungen, Durchgängen, fehlerfreien Durchgängen, Fehlerquote und letztem Übungsdatum. Ungeübte Kategorien sind ausdrücklich gekennzeichnet. **Karten anzeigen** ersetzt den Range-Namen durch zwei passende zufällige Karten; Range und Summe erscheinen erst nach „Prüfen“. Echte Paare gehören nur zu Paar-Kategorien, 10,10 bleibt 10,10. Für Hard 17+ kommen als eindeutige Zwei-Karten-Hände daher 17–19 infrage. Karten und Range teilen sich dieselbe Kategorie-Statistik. Die Einstellung `rangeCards` bleibt gespeichert und wird bei alten Backups mit `false` ergänzt. Kartenbereich, Korrekturzeile und Action-Bar reservieren ihre Höhe, sodass Umschalten und Prüfen das Raster nicht verschieben.
- **Grenzfälle priorisieren** ist standardmäßig aktiv: ENHC-Ausnahmen, Soft 18, Paare und Zellen an Strategiegrenzen kommen deutlich häufiger vor. Einfache Situationen bleiben als Wiederholung enthalten. Ausschalten liefert die bisherige breite adaptive Mischung; der Casino-Test bleibt gleichverteilt.
- **Hand zu Ende spielen** wechselt im Trainer zwischen Einzelentscheidungen und kompletten Runden mit Hit, Double, Split, Folgeentscheidungen und Dealer-Abrechnung. Jede eigene Entscheidung zählt separat. Nach dem Feedback führt „Weiterspielen“ zur nächsten Entscheidung; die automatische Fortsetzung lässt sich in den Einstellungen aktivieren. Der Trainings-Shoe entfernt die gezeigten Ausgangskarten aus sechs Decks und zieht danach ohne Zurücklegen. Versicherung wird im Trainer abgelehnt; Trainingsrunden beeinflussen das Free-Play-Guthaben nicht. Wechsel des Handmodus startet eine neue Übung.
- **Handsumme anzeigen** lässt sich direkt im Trainer, im Spiel und in den Einstellungen abschalten. Dann fehlen Spieler- und Dealer-Summen einschließlich Soft-Kennzeichnung; nur die Karten bleiben sichtbar. Feedback nach der Entscheidung kann die gerade beantwortete Hand benennen. Alle drei Schalter werden gespeichert.
- Karten werden in beiden Modi einzeln animiert ausgeteilt und nachgezogen. Der Dealer deckt seine weiteren Karten nacheinander auf. Die Antwortuhr und Eingaben warten auf das Ende des Austeilens. Die Betriebssystem-Einstellung für reduzierte Bewegung schaltet diese Animationen und Wartezeiten ab.
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

### Strategy-Ranges manuell testen

Entwicklungsserver starten und `http://127.0.0.1:3002/contents/blckjck_trainer/#ranges` öffnen.

1. Aktion wählen, einzelne Karten markieren und überschreiben. Von 2 auf 8 ziehen: Die ganze Range 2–8 wird markiert und während des Ziehens hinterlegt. Vor dem Loslassen auf 6 zurückziehen: Nur 2–6 bleibt ausgewählt; 7 und 8 erhalten ihre vorherigen Markierungen zurück. Das funktioniert auch rückwärts. Undo soll den gesamten Strich zurücknehmen.
2. „Rest“ soll nur offene Felder füllen, „Alles“ alle zehn überschreiben. Beide Vorgänge müssen sich mit einem Undo zurücknehmen lassen. „Prüfen“ bleibt bis zur zehnten Antwort gesperrt.
3. Mit absichtlichen Fehlern prüfen: ✓/✕, richtige Aktion, Gesamtpunktzahl und Range-Merksatz kontrollieren. Danach dürfen Antworten nicht mehr verändert werden. „Weiter“ öffnet eine andere, leere Kategorie.
4. Zwischen Tabs wechseln: Die laufende Aufgabe bleibt erhalten. Seite neu laden: Die Kategorie-Statistiken bleiben gespeichert; die laufende Aufgabe startet neu. Export/Import enthält die Ranges; „Statistiken zurücksetzen“ löscht sie ebenfalls.
5. Auf dem eigenen Smartphone im Hoch- und Querformat sowie im hellen Theme prüfen: Wischen im Raster markiert Karten, Scrollen außerhalb bleibt möglich, die Action-Bar überlappt die untere Navigation nicht.
6. „Übersicht“ öffnen: alle 17 Lösungen und lokale Statistiken kontrollieren. Zur Übung zurückkehren und „Karten anzeigen“ einschalten: keine Range oder Summe vor dem Prüfen; die Karten bleiben unverändert und das Raster behält seine Position. Nach „Weiter“ ist die neue Summe wieder verborgen.

`.github/workflows/blackjack-checks.yml` prüft und baut die App und stellt nur nach erfolgreichen Tests ein statisches Artefakt bereit. **Es ersetzt oder aktiviert kein Deployment**: Die Veröffentlichung erfolgt weiterhin über die bestehende Pages-Konfiguration dieses Repositorys. Gebaute Dateien unter `contents/` müssen gemeinsam mit den Quellen eingecheckt werden. Ein verbindlicher Test-Gate für die bestehende branchbasierte Pages-Veröffentlichung muss in den Repository-Einstellungen konfiguriert werden.

## Architektur und Speicherung

`src/core/` ist unabhängig von React: Karten, Regeln, Strategie, Engine, Training und validierte Persistenz. `src/pages/` enthält die fünf Bereiche und Einstellungen. Es gibt keine Live-Abfragen beim Spielen und keine fremden Kartenbilder.

`european-blackjack-trainer:v1` ist der lokale Speicher-Schlüssel. Version 1 ist die erste Version; unbekannte zukünftige Versionen werden abgelehnt, bevor Daten ersetzt werden. Die neuen optionalen v1-Einstellungen `showHandTotals`, `playFullHands` und `focusEdges` werden bei alten Spielständen/Backups mit den Defaults `true`, `false`, `true` ergänzt; Fortschritt und laufendes Free Play bleiben erhalten. Ein späteres inkompatibles Versionsupgrade benötigt eine explizite Migration vor `parseBackup`. Defekte lokale Daten werden unter `european-blackjack-trainer:v1:recovery` gesichert. Speicherfehler werden angezeigt. Importgrenze: 5 MB. Begrenzt werden nur Detailverläufe: 50 Sessions, 200 Spielentscheidungen und 50 Zeiten/10 Antworten je Zelle; Gesamtsummen bleiben erhalten.

Ein Browser-Tab ist der aktive Speicherbesitzer; parallele Tabs synchronisieren Spielstände nicht. Backups lassen sich zwischen Geräten übertragen.

Die additive v1-Erweiterung `strategyRanges` wird bei älteren Spielständen als leeres Objekt ergänzt. Je Kategorie werden geprüfte Durchgänge, fehlerfreie Durchgänge, falsche Felder und der letzte Prüfzeitpunkt gespeichert. Zehn Dealer-Antworten zählen gemeinsam als ein Durchgang; die bisherigen Einzelentscheidungs-Statistiken bleiben getrennt. Die Auswahl gewichtet sowohl den Anteil fehlerhafter Durchgänge als auch den Anteil falscher Felder. Ungesehene Kategorien erhalten ebenfalls mehr Gewicht als fehlerfrei gelernte Kategorien.

## Unabhängiges Lernprojekt

Keine Verbindung zu, Beauftragung durch oder Unterstützung von Spielbank Wiesbaden. Nur virtuelles Übungsgeld. Quellcode dieser App: MIT; Hinweise zu eingebundenen Bibliotheken in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
