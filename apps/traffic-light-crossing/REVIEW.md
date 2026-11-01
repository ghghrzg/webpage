# Review vom 25. Oktober 2026

Geprüft wurden die aktive React-App, beide Level, Fahrzeugbewegung, Signalsteuerung, Taktpilot, Speicherung, Audio, Styles und Build-Konfiguration. Die nachstehenden Befunde sind im Quellcode behoben.

| Priorität | Befund | Korrektur |
| --- | --- | --- |
| Hoch | Rundenspiel und Endlossimulation waren vermischt. Zeit lief negativ, null Leben beendeten nichts; Laden setzte `over` immer zurück. | Zwei umschaltbare Modi mit getrennten Regeln, sichtbarer Rundenzeit/Leben/Punkten und geprüftem Spielende. |
| Hoch | Gruppenknöpfe wechselten in einen internen Modus, den der Taktpilot nicht unterstützte. Neue Befehle konnten Gelb/Räumzeit umgehen. | Ein gemeinsamer Signalautomat. Zielwechsel behalten laufende Sicherheitsphasen bei; Räumzeit wartet auf die tatsächlichen Fahrzeuge. |
| Hoch | Taktpilot setzte bei seinem ersten Grün keine Deadline; Timer liefen unabhängig von Pause. Sensorbetrieb betrachtete nur die unmittelbar nächste Gruppe. | Separater, getesteter Controller auf Simulationszeit; Start, Gruppen, Pause, Nullintervalle und Sensorbetrieb funktionieren gemeinsam. |
| Hoch | Beide Linksabbiegerspuren lagen auf der Mittellinie. Auch nach räumlicher Trennung schnitten die alten Kurven bei verschiedenen Geschwindigkeiten den Gegenverkehr. | Getrennte Fahrspuren und vorgezogene Abbiegebögen; Prüfung verschiedener Fortschritte und Langzeitsimulation. |
| Hoch | Kollisionsprüfung fehlte; Sportwagen/Motorräder überfuhren zufällig Rot, Fahrzeuge fuhren schon bei Rot-Gelb. | Prüfung rotierter Fahrzeugkörper, Unfallereignisse und Räumen nach zwei Sekunden; alle Fahrzeugtypen beachten Rot/Rot-Gelb. Gelbentscheidung nach Bremsweg. |
| Mittel | Classic-Schalter verwiesen auf nicht existierende Signalgruppen. | Ungültige Schalter entfernt, Ziele validiert; Levelkonfiguration durch Tests abgesichert. |
| Mittel | React-State-Updater enthielten Zufall und Nebenwirkungen; Soundereignisse wurden außerhalb des Updaters zu früh gelesen. | Synchroner Spielzustand als Referenz, Tick und Ereignisse außerhalb der React-Updater. |
| Mittel | Speicherstände wurden ohne Formprüfung übernommen; ältere Daten konnten Rendering/Controller beschädigen. | Validierung und Migration mit Erhalt der Stadtstatistik; kompatible Spiele laden pausiert. |
| Mittel | Fehlende Audio-Einstellungen wurden wegen `Number(null)` als Lautstärke null interpretiert. AudioContext wurde nicht zuverlässig entsperrt. | Standardlautstärke erhalten, gespeicherte Nullen respektieren, Audio über Nutzereingabe entsperren. |
| Mittel | TypeScript meldete Fehler in aktiver Action-Verarbeitung und drei ungenutzten Altkomponenten; Vite übersah sie. | Action korrekt eingegrenzt, Altkomponenten/-konstanten entfernt, Typecheck Bestandteil jedes Builds. |
| Mittel | `overflow: hidden` schnitt hohe Bedienfelder ab; versteckte Checkboxen waren nicht per Tastatur erreichbar. Pfeiltasten griffen in Eingabefeldern, Dezimalpunkt erhöhte versehentlich das Intervall. | Scrollbares Layout, mobile HUD-Anordnung, erreichbare Schalter, Eingabefokus respektieren, Dezimalwerte korrekt eingeben. |
| Niedrig | Fahrzeug direkt auf der Haltelinie fehlte in der Warteschlange; rote Ampeln zählten freie Fahrt als Wartezeit. | Haltelinie inklusive zählen; Wartezeit nur bei tatsächlich verlangsamten, begrenzten Fahrzeugen. |

## Validierung

- Regressionstests für Signale, Rot/Gelb, Pause, Fahrwege, Kollisionen, Speicherstände, Audio-Defaults, beide Modi und Taktpilot.
- Je zehn simulierte Minuten in beiden Leveln mit reproduzierbarem Zufall und wechselnden Einzel-/Gruppenfreigaben: keine Unfälle, keine ungültigen Positionen, begrenzte Fahrzeugzahl und fortlaufender Durchsatz.
- React-Rendering für die frische Endlossimulation und eine beendete Runde.
- TypeScript-Prüfung und Produktionsbuild.

Die interaktive Sichtprüfung auf Desktop/Mobil ist noch offen: Die Browser-Anbindung meldete keine verfügbaren Browser; der zusätzliche Zugriff über Computer Use endete mit `Computer Use app approval timed out`. Die automatisierten Prüfungen ersetzen keinen abschließenden Spieltest im Browser.

## Anpassungen vom 1. November 2026

- Classic Crossing zeigt Nord/Süd ohne Richtungspfeile; getrennte Signalgruppen im Abbieger-Level behalten ihre Pfeile.
- Bei Gruppenwechseln bleiben gemeinsame Freigaben durchgehend grün. Nur wegfallende Freigaben durchlaufen Gelb und die Räumzeit. Deren Fahrzeuge müssen die Kreuzung verlassen, bevor neue Freigaben starten; Verkehr aus beibehaltenen Gruppen blockiert diesen Wechsel nicht.
- Auch erneute Zielwechsel während Gelb, Räumzeit oder Rot-Gelb beachten diese Regeln. 27 Tests sowie TypeScript-Prüfung und Produktionsbuild erfolgreich.
