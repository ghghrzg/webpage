# Regeln, Strategie und Quellen

Abgleich am 28. September 2026. Das App-Profil ist eine dokumentierte Annäherung, keine Casino-Zertifizierung.

## Primärquellen

- [Spielbank Wiesbaden: Black-Jack-Spielregeln, 2025-PDF](https://www.spielbank-wiesbaden.de/fileadmin/user_upload/Downloads/Spielerklaerungen/S-W_Homepage_Spielregeln_Black_Jack_25WEB.pdf)
- [Spielbank Wiesbaden: ausführliche Spielregeln, November 2021](https://www.spielbank-wiesbaden.de/fileadmin/user_upload/Downloads/Spielerklaerungen/S-W_Homepage_Spielregeln_Black_Jack_deutsch_Nov21.pdf)
- [Spielbank Wiesbaden: FAQ](https://www.spielbank-wiesbaden.de/en/faqs)
- [BlackjackInfo: eigene ENHC-Simulation und Erläuterung](https://www.blackjackinfo.com/blackjack_variation/european-blackjack/)

Die aktuellen PDF-Suchauszüge bestätigen Versicherung, Even Money und den für reguläre Hände wertfreien Joker. Die ausführlich lesbaren Regeln von 2021 beschreiben unter anderem Double, Split, Dealer-Zugfolge und Auszahlungen; das FAQ bestätigt sechs Decks mit Shuffler. Das aktuelle PDF konnte beim Abgleich nicht vollständig abgerufen werden. Deshalb bleiben Änderungen gegenüber der älteren, ausführlichen Quelle möglich.

## Übernommene Kernregeln

| Regel                 | Umsetzung                                                                            |
| --------------------- | ------------------------------------------------------------------------------------ |
| Decks                 | 6 × 52 reguläre Karten                                                               |
| Dealer                | Initial nur eine offene Karte; zweite Karte nach den Spielern                        |
| Dealer 17             | Steht auch mit einem als 11 gewerteten Ass                                           |
| Blackjack             | Nur ursprüngliche zwei Karten; Gewinn 3:2, bei Dealer-Blackjack Push                 |
| Double                | Zwei Karten mit Hard 9, 10 oder 11; danach genau eine weitere Karte                  |
| Split                 | Gleicher Punktwert, einschließlich verschiedener Zehnerbilder; maximal vier Hände    |
| DAS                   | Double nach Split erlaubt                                                            |
| Geteilte Asse         | Je eine zusätzliche Karte; Ass plus Zehner zählt als normale 21                      |
| Versicherung          | Gegen Dealer-Ass bis zum halben Einsatz; die App bietet genau die Hälfte, Gewinn 2:1 |
| Even Money            | Eigener Blackjack gegen Dealer-Ass kann zu 1:1 abgerechnet werden                    |
| Surrender / Side Bets | Nicht enthalten                                                                      |

## Explizite Annahmen

- Ass-Re-Split ist nicht eindeutig bestätigt und wird deaktiviert. `RuleSet.resplitAces` und ein eigener Test machen diese Wahl sichtbar.
- Bei Dealer-Blackjack gehen alle Split-/Double-Einsätze verloren. Das ist die ENHC-Variante, auf der die Konzeptmatrix basiert. BlackjackInfo beschreibt diese Variante; daraus folgt **nicht**, dass jeder europäische oder Wiesbadener Tisch sie heute identisch handhabt.
- Hard Double 9–11: Ein flexibles Ass wird nicht künstlich als 1 gewertet, um Soft Doubles zu ermöglichen. Diese Einschränkung stammt aus dem Konzept.
- Standard-Shuffle zwischen Runden bei weniger als 100 Karten ist eine App-Entscheidung. Keine Nachbildung einer konkreten Maschine.

## Strategiedaten

`src/core/strategy.ts` transkribiert die drei Tabellen aus `concept.md`; gruppierte Werte werden auf einzelne Zeilen erweitert. Hand mit mehreren Karten: Hard-/Soft-Zelle anhand des aktuellen Wertes. Zwei wertgleiche Karten: Paar-Zelle auch dann, wenn Split nicht verfügbar ist; der explizite Fallback wählt die erlaubte Aktion. Dealer J/Q/K werden als 10 normalisiert.

Zentrale ENHC-Abweichungen: Hard 11 gegen 10/Ass zieht; 8,8 gegen 10/Ass zieht; A,A gegen Ass zieht. Soft Doubles gibt es in diesem Profil nicht. Die Spiel-Engine besitzt keine alternative Strategie-Heuristik.

Die Tests sichern Transkription, Konsistenz, rechtmäßige Aktionen und die konkreten Ausnahmen ab. Sie beweisen **keine mathematische Optimalität**. Ein unabhängiger Erwartungswert-Solver, insbesondere für Split-/Re-Split-Grenzen, ist vor einer entsprechenden Exaktheitsbehauptung erforderlich.
