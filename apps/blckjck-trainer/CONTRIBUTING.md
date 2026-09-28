# Beiträge

1. Abhängigkeiten mit `npm ci` im App-Verzeichnis installieren.
2. `npm run dev` starten; Core-Logik in `src/core/` unabhängig von React halten.
3. Strategieänderungen benötigen eine nachvollziehbare Quelle in `docs/rules.md`. Trainer, Coach und Tabelle müssen weiter denselben Datensatz verwenden.
4. Geänderte Spielregeln und Persistenz mit gezielten Tests absichern. Änderungen am Speicherformat brauchen eine explizite Versionsmigration, bevor sie veröffentlicht werden.
5. `npm run format`, `npm test`, `npm run build` und bei UI-/Integrationsänderungen `npm run test:e2e` ausführen.
6. Die erzeugten Dateien in `../../contents/blckjck_trainer/` zusammen mit den Quellen übernehmen. Keine `node_modules`, Testberichte oder persönlichen Spielstände einchecken.

Die lokale Kartenfarbe, der Rang oder die Illustration dürfen keine andere Kartenwertung erzeugen. Fehlende Aktionen bleiben sichtbar und deaktiviert; eine Unsicher-Markierung darf nie die Antwort verraten.
