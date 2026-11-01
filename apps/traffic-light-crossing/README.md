# Traffic Light Crossing

Ampelsteuerung mit drei Kreuzungen und zwei umschaltbaren Spielmodi.

## Spielmodi

- **Endlos:** Verkehr ohne Zeitlimit oder Lebensverlust steuern. Stadtstatistik und Freischaltungen bleiben erhalten.
- **90-Sek.-Runde:** 90 Sekunden, fuenf Leben und Punkte fuer durchgelassene Fahrzeuge. Unfaelle kosten ein Leben. Wartet ein Fahrzeug mindestens 30 Sekunden, kostet der Rueckstau ein Leben; weitere Rueckstau-Strafen folgen fruehestens acht Sekunden spaeter. Bei Zeitablauf oder null Leben endet die Runde.

Modus- und Levelwechsel beginnen eine neue Kreuzung. Reset startet den aktuellen Modus neu. Die Stadtstatistik bleibt dabei erhalten. Gespeicherte Spiele werden pausiert fortgesetzt; beendete Runden bleiben beendet.

## Steuerung

- Ampeln oder Schalter anklicken; Pfeiltasten entsprechend der Beschriftung verwenden.
- Maus über eine Ampel: Zusammen schaltbare Ampeln werden markiert. Das Mausrad wechselt zwischen den verfügbaren Gruppen und der Einzelschaltung; ein Klick schaltet die angezeigte Auswahl. Bei Tastaturfokus wechseln Pfeil links/rechts die Auswahl, Enter oder Leertaste schaltet sie.
- Classic Crossing: Pfeil hoch Nord/Sued, Pfeil links Ost/West.
- NS Linksabbieger: Pfeil hoch N/S geradeaus, Pfeil rechts N/S links, Pfeil links Ost/West; zusaetzliche Nord-/Sued-Gruppen per Konsole.
- Große Kreuzung: Pro Zufahrt zwei Geradeausspuren und eine Linksabbiegerspur mit je einer eigenen Ampel. Pfeil hoch/rechts schaltet N/S geradeaus/links, Pfeil links/runter O/W geradeaus/links; weitere Kombinationen gibt es an der Konsole.
- Alle rot schaltet den Taktpiloten aus und raeumt die Kreuzung ueber Gelb.
- Der Taktpilot lässt sich auch über den Schalter oben im Bedienbereich jederzeit ein- und ausschalten. Ein bereits begonnener Ampelwechsel wird dabei sicher zu Ende geführt.
- Pause friert Verkehr, Runde und Taktpilot ein. Enter/Leertaste startet oder setzt fort, sofern kein Bedienelement fokussiert ist.

Beim Gruppenwechsel bleiben Ampeln gruen, die im bisherigen und im neuen Zustand freigegeben sind. Nur wegfallende Gruppen schalten ueber Gelb auf Rot; neue Gruppen warten auf deren Raeumung und starten ueber Rot-Gelb. Classic Crossing verwendet runde Ampeln ohne Richtungspfeile; separate Abbiegespuren behalten ihre Pfeile. Fahrzeuge fahren erst bei Gruen an. Bei Gelb fahren nur Fahrzeuge weiter, die nicht mehr bequem vor der Haltelinie bremsen koennen.

Die beiden Siebensegmentanzeigen im Pult zeigen die laufende Grünzeit der aktuellen und die Dauer der letzten Gruppe. Beim Wechsel wird die bisherige Dauer übernommen; Gelb, Räumzeit und Rot-Gelb zählen nicht. Die Anzeige reicht bis 99,9 Sekunden und bleibt bei längeren Zeiten auf diesem Wert stehen.

## Taktpilot und Statistik

Ab 100 insgesamt durchgelassenen Autos wird der Taktpilot freigeschaltet. Ab 1000 Autos sind individuelle Gruenzeiten und Sensorbetrieb verfuegbar. Intervall 0 ueberspringt eine Gruppe. Der Sensor erkennt wartende Fahrzeuge auch hinter leeren Gruppen im Schaltplan. Die Zeit zaehlt erst bei stabilem Gruen; Pause und Hintergrund-Tabs verbrauchen keine Simulationszeit.

Auf der großen Kreuzung schaltet der Taktpilot die vier gemeinsamen Geradeaus- und Linksabbiegerphasen. Bei unterschiedlichen Intervallen gehen kürzer eingestellte Ampeln früher auf Gelb; länger eingestellte Ampeln derselben Gruppe bleiben zunächst grün. Danach beginnt die nächste Gruppe.

Die Zufriedenheit basiert auf der Verzoegerung der durchgelassenen Fahrzeuge. Alte Speicherstaende behalten ihre Stadtstatistik, beginnen aber wegen der korrigierten Fahrwege mit einer neuen Kreuzung.

## Entwicklung

Für die Entwicklung und die DOM-Tests wird Node.js 20 oder neuer benötigt.

```sh
npm install
npm run dev        # http://localhost:3001
npm test           # Engine-, Controller-, Speicher- und Renderpruefungen
npm run typecheck
npm run build      # TypeScript-Pruefung + Vite-Build
```

Im Workspace: `npm run test:traffic-light-crossing` und `npm run build:traffic-light-crossing`. Unter Windows PowerShell bei gesperrten npm-Skripten `npm.cmd` verwenden.

Build-Ziel: `contents/traffic_light_crossing/`. Der Build allein veroeffentlicht die Website nicht.

Die Ergebnisse des vollstaendigen Reviews stehen in [REVIEW.md](REVIEW.md).
