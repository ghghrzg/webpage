# European Blackjack Trainer  
## Konzeptpapier – Wiesbaden Rules Preset

**Arbeitstitel:** `European Blackjack Trainer`  
**Repository:** `european-blackjack-trainer`  
**Untertitel in der App:** `Wiesbaden Rules · ENHC · S17 · 6 Decks`  
**Status:** inoffizielles Lern- und Simulationsprojekt, keine Verbindung zur Spielbank Wiesbaden.

Der allgemeine Name **European Blackjack Trainer** ist besser als ausschließlich `Wiesbaden Blackjack Trainer`, weil „European Blackjack“ das Produkt beschreibt und die Architektur später weitere Regelprofile aufnehmen kann. Wichtig ist aber, Wiesbaden nicht einfach mit „European Blackjack“ gleichzusetzen: ENHC-Spiele unterscheiden sich untereinander bei Double, DAS, Splits, S17/H17 usw. Deshalb muss **„Wiesbaden Rules“ immer sichtbar als aktives Regelprofil** erscheinen.

---

# 1. Ziel des Projekts

Die Anwendung soll nicht nur eine Basic-Strategy-Tabelle anzeigen, sondern drei Dinge verbinden:

1. **Basic Strategy auswendig lernen**
2. **Unsichere/schwierige Situationen gezielt wiederholen**
3. **Das Gelernte in vollständigen Blackjack-Runden mit echten simulierten Kartendecks anwenden**

Die Anwendung läuft vollständig clientseitig als **GitHub Page / PWA**, benötigt keinen Login und speichert Fortschritt und Statistiken nur lokal im Browser.

Zentrales Prinzip:

> Die Strategy-Matrix ist die einzige Wahrheit für Empfehlungen.  
> Spielsimulation und Lernmodus dürfen niemals eigene Strategy-Heuristiken implementieren.

---

# 2. Kartenassets und Lizenz

## Empfehlung: Kenney als fertiges Asset-Pack

Für ein öffentliches GitHub-Projekt ist **Kenney** wahrscheinlich die sauberste Lösung.

Der **Kenney Board Game Pack** enthält Spielkarten, Kartenrückseiten, Chips und weitere Boardgame-Assets und steht unter **CC0**. Kenney erlaubt seine Asset-Packs laut eigener FAQ auch in kommerziellen Projekten; Attribution ist nicht erforderlich. :chatgpt-content-reference{index="0"}

Damit könnten die Assets einfach im Repository liegen:

```text
public/
└── assets/
    ├── cards/
    │   ├── hearts/
    │   ├── diamonds/
    │   ├── clubs/
    │   └── spades/
    ├── card-backs/
    └── chips/
```

Zusätzlich:

```text
THIRD_PARTY_NOTICES.md
```

mit etwa:

```md
## Kenney Board Game Pack

Playing card and chip assets:
Kenney Board Game Pack

License:
Creative Commons Zero 1.0 Universal (CC0)

Attribution is not required.
```

Ich würde trotzdem freiwillig `Playing card assets by Kenney – CC0` im About-Screen nennen.

### Alternative

Es gibt auch ein komplettes **Public Domain / CC0 Deck mit SVG und PNG**, inklusive 52 Karten, Jokern und Rückseiten. Das Repository erlaubt laut eigener Lizenz ausdrücklich Veröffentlichung, Modifikation und kommerzielle Nutzung. :chatgpt-content-reference{index="1"}

Kenney wäre mir trotzdem lieber, weil das Projekt etablierter ist und die Lizenz direkt beim ursprünglichen Asset-Anbieter dokumentiert ist.

## Noch besser für die erste Version: eigene SVG-Karten

Technisch braucht die App eigentlich gar keine 52 Bilddateien.

Eine Karte kann komplett programmatisch gebaut werden:

```text
┌─────────┐
│ K       │
│ ♠       │
│         │
│    ♠    │
│         │
│       K │
│       ♠ │
└─────────┘
```

React-Komponente:

```ts
<Card
  rank="K"
  suit="spades"
/>
```

mit SVG/HTML/CSS.

Vorteile:

- gestochen scharf auf jedem Display
- winzige Dateigröße
- keine Asset-Abhängigkeit
- Dark-/Light-Theme möglich
- einfache Animationen
- Karten können automatisch skaliert werden
- Rank und Suit sind garantiert korrekt

Für das Training braucht man keine gemalten Könige und Damen.

### Generative Bilder?

**Ja, aber nicht für die 52 Kartenfronten.**

KI-generierte Karten wären unnötig fehleranfällig:

- falsche Anzahl von Symbolen
- inkonsistente J/Q/K-Designs
- schlecht erkennbare Werte
- unterschiedliche Stilistik

Sinnvoll generieren könnte man dagegen:

- Kartenrückseite
- dezentes Tischmuster
- App-Icon
- Hero-Art
- dekorative Casino-Elemente

Meine Empfehlung für v1:

> **Eigene SVG-Karten für maximale Lesbarkeit.**  
> Optional später ein `Classic Cards` Theme mit Kenney CC0.

---

# 3. Wiesbaden-Regelprofil

Das Regelprofil muss als strukturierte Konfiguration existieren.

Die Spielbank nennt aktuell **6 Kartendecks und einen Joker im Shuffler**. Beim Initial Deal bekommt der Dealer zunächst nur eine offene Karte; erst nachdem die Spieler fertig sind, zieht der Dealer seine restlichen Karten. Der Dealer zieht bis einschließlich 16 und steht ab 17. Blackjack zahlt 3:2. Double ist nur bei zwei Karten mit Gesamtwert 9, 10 oder 11 erlaubt; Double after Split ist erlaubt. Bis zu drei Splits, also maximal vier Hände, sind möglich. :chatgpt-content-reference{index="2"}

Der zusätzliche Wiesbadener Joker ist laut offiziellen Regeln **wertfrei, zählt nicht zu den regulären Blackjack-Karten und ist nur für die Zusatzwetten relevant**. Deshalb sollte er in Free Play v1 nicht in die normale Blackjack-Hand gelangen, solange TWINS/Crazy Twins nicht simuliert werden. :chatgpt-content-reference{index="3"}

```ts
const WIESBADEN_RULES: RuleSet = {
  id: "wiesbaden",
  name: "Wiesbaden Rules",

  decks: 6,

  dealerHoleCard: false,
  dealerHitsSoft17: false,

  blackjackPayout: 1.5,

  doubleAllowedTotals: [9, 10, 11],
  doubleAfterSplit: true,

  maxHandsAfterSplits: 4,
  splitAcesOneCardOnly: true,

  surrender: false,

  insurance: true,
  evenMoney: true,

  jokerInShuffler: true,
  jokerUsedInCoreGame: false
};
```

## Noch zu validierender Spezialfall

Bevor die App öffentlich behauptet, mathematisch **exakt Wiesbaden** abzubilden, sollte einmal geklärt werden, wie Wiesbaden mit einem weiteren Ass nach einem Ass-Split umgeht, also ob ein Re-Split von Assen möglich ist.

Die normalen Splits sind eindeutig bis maximal vier Hände erlaubt; die Ass-Regel sagt zugleich, dass nach einem Ass-Split nur eine Karte ausgegeben wird. Das sollte im Code als bewusst konfigurierbare Regel modelliert und nicht zufällig interpretiert werden.

---

# 4. Strategy-Daten

Die aktuelle Working Strategy entspricht dem ENHC-Profil:

```text
6 Decks
S17
ENHC / No Peek
Blackjack 3:2
Double hard 9–11
DAS
No Surrender
```

Eine veröffentlichte ENHC-Matrix für genau diese wesentlichen Bedingungen hat folgende Struktur; insbesondere gelten die ENHC-Abweichungen wie `11 vs 10/A = Hit`, `8,8 vs 10/A = Hit` und `A,A vs A = Hit`. :chatgpt-content-reference{index="4"}

Die App darf diese Daten **nicht durch allgemeines Blackjack-Wissen ersetzen**.

## Harte Hände

| Spieler | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 5–8 | H | H | H | H | H | H | H | H | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 11 | D | D | D | D | D | D | D | D | H | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 13–16 | S | S | S | S | S | H | H | H | H | H |
| 17+ | S | S | S | S | S | S | S | S | S | S |

## Soft Hands

| Spieler | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A2–A6 | H | H | H | H | H | H | H | H | H | H |
| A7 | S | S | S | S | S | S | S | H | H | H |
| A8+ | S | S | S | S | S | S | S | S | S | S |

## Paare

| Spieler | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 2/2, 3/3 | P | P | P | P | P | P | H | H | H | H |
| 4/4 | H | H | H | P | P | H | H | H | H | H |
| 5/5 | D | D | D | D | D | D | D | D | H | H |
| 6/6 | P | P | P | P | P | H | H | H | H | H |
| 7/7 | P | P | P | P | P | P | H | H | H | H |
| 8/8 | P | P | P | P | P | P | P | P | H | H |
| 9/9 | P | P | P | P | P | S | P | P | S | S |
| 10/10 | S | S | S | S | S | S | S | S | S | S |
| A/A | P | P | P | P | P | P | P | P | P | H |

Für Wiesbaden sollte diese Matrix vor Release noch einmal mit einem Solver inklusive **Resplit-Regel** gegengeprüft werden. Das ist ein kleiner, aber wichtiger Release-Check.

---

# 5. Strategy-Datenmodell mit Fallbacks

Free Play erzeugt Situationen, in denen Double oder Split nicht mehr verfügbar sind.

Deshalb reicht:

```ts
"D"
```

nicht.

Besser:

```ts
type StrategyAction =
  | "H"
  | "S"
  | "D/H"
  | "D/S"
  | "P/H"
  | "P/S";
```

Beispiele:

```text
Hard 9 vs 3   → D/H
Hard 10 vs 6  → D/H

6,6 vs 2      → P/H
6,6 vs 4      → P/S

8,8 vs 6      → P/S
8,8 vs 8      → P/H

A,A vs 10     → P/H
```

Damit kann der Resolver sagen:

```ts
resolveStrategy(context)
```

und anschließend:

```ts
resolveLegalAction(strategy, allowedActions)
```

Beispiel:

```text
Strategie = DOUBLE / sonst HIT
Double nicht mehr möglich
→ HIT
```

So funktionieren auch Drei-, Vier- und Fünf-Karten-Hände im Free Play korrekt.

---

# 6. App-Navigation

Mobile First:

```text
┌──────────────────────────────┐
│ European Blackjack Trainer   │
│ Wiesbaden Rules              │
├──────────────────────────────┤
│                              │
│         CONTENT              │
│                              │
├──────────────────────────────┤
│ Train  Play  Strategy  Stats │
└──────────────────────────────┘
```

Vier Hauptbereiche:

```text
TRAIN
PLAY
STRATEGY
STATS
```

Settings und About über ein Menü oben rechts.

---

# 7. TRAIN

Trainer fragt einzelne Entscheidungen ab.

Anzeige immer als **echte Karten**, nicht primär als mathematische Bezeichnung.

Beispiel:

```text
               DEALER

                 ┌─────┐
                 │  6♣ │
                 └─────┘


                 YOU

            ┌─────┐ ┌─────┐
            │  8♥ │ │  8♠ │
            └─────┘ └─────┘

                  16

              [? UNSICHER]

        HIT             STAND
        DOUBLE          SPLIT
```

Bei Dealer-Wert 10 sollen zufällig auch:

```text
10
J
Q
K
```

erscheinen.

Dadurch lernt man die reale visuelle Situation.

---

# 8. „Bin unsicher“ als zentrales Feature

Der Button:

```text
? Bin unsicher
```

existiert sowohl im **Trainer als auch im Free Play**.

Er verrät nichts.

Beim Antippen passiert ausschließlich:

```ts
markUncertain(currentDecision);
```

Danach muss der Spieler trotzdem selbst eine Aktion wählen.

Beispiel:

```text
A,7 vs 9

[? Bin unsicher]

HIT
STAND
```

Der Button erhält nach Tap kurz den Zustand:

```text
✓ Gemerkt
```

## Kanonische Speicherung

Nicht die konkrete Kartenkombination:

```text
A♥ + 7♣ gegen 9♦
```

speichern.

Sondern:

```text
soft-A7-vs-9
```

Ebenso:

```text
Q♣ + 6♥ gegen K♦
```

wird:

```text
hard-16-vs-10
```

Damit landen äquivalente Hände in derselben Lernzelle.

## Daten

```ts
interface DifficultDecision {
  decisionKey: string;

  firstMarkedAt: number;
  lastMarkedAt: number;

  unsureCount: number;

  correctAfterMark: number;
  wrongAfterMark: number;

  pinned: boolean;
  resolved: boolean;
}
```

Mehrfaches Unsicher-Markieren erzeugt **keine Duplikate**.

Stattdessen:

```text
A7 vs 9
3× unsicher
Accuracy: 71 %
Last seen: Today
```

---

# 9. Difficult Hands / Unsicher-Training

Unter Train:

```text
Practice
Learn
Weak Spots
Unsicher
Casino Test
```

`Unsicher` enthält ausschließlich manuell markierte Situationen.

Beispiel:

```text
SCHWIERIGE HÄNDE

A7 vs 9        ? 4×
88 vs A        ? 3×
12 vs 3        ? 2×
99 vs 7        ? 1×

[ALLE TRAINIEREN]
```

Jede Situation kann:

```text
Pin
Als gelernt markieren
Aus Liste entfernen
Nur diese trainieren
```

## Automatische Priorisierung

Unsichere Entscheidungen erhalten im normalen adaptiven Trainer zusätzlich Gewicht.

Beispiel:

```ts
weight *= 1 + Math.min(unsureCount, 4) * 0.75;
```

Eine viermal als unsicher markierte Zelle erscheint also deutlich häufiger.

---

# 10. Confidence Calibration

Dadurch entsteht eine Statistik, die normale Blackjack-Trainer kaum haben:

```text
CONFIDENT + CORRECT
UNSURE + CORRECT
UNSURE + WRONG
CONFIDENT + WRONG
```

Besonders interessant ist:

> **Confident + Wrong**

Denn das sind nicht Dinge, die man noch nicht weiß, sondern Regeln, die man **falsch gelernt hat**.

Dashboard:

```text
Confidence

Confident + correct     812
Unsure + correct         84
Unsure + wrong           31
Confident + wrong        18   ⚠
```

Diese 18 Hände können automatisch besonders stark priorisiert werden.

---

# 11. TRAIN-Modi

## Learn

Geführte Gruppen:

```text
Hard Totals
Soft Hands
Pairs
ENHC Traps
```

Erst kurze Regel:

```text
Hard 13–16

Dealer 2–6 → STAND
Dealer 7–A → HIT
```

danach Drill.

## Practice

Adaptive Endlossession.

Question Scheduler berücksichtigt:

```text
Fehlerquote
Anzahl bisheriger Versuche
Unsicher-Markierungen
Zeit seit letzter Frage
Antwortgeschwindigkeit
aktuelle Correct-Streak
```

## Weak Spots

Automatisch erkannte Problemstellen.

Beispiel:

```text
accuracy < 90 %
OR
recentAccuracy < 80 %
OR
confidentWrong > 0
```

## Unsicher

Manuell markierte Hände.

## Casino Test

Beispiel:

```text
100 Entscheidungen

Keine Hinweise
Keine automatische Korrektur
Keine Strategy-Erklärung bis zum Ende

Ziel:
≥ 95 % korrekt
Median < 2,0 Sekunden
```

`Bin unsicher` bleibt verfügbar, verrät aber weiterhin nichts.

---

# 12. PLAY – vollständiger Free-Play-Modus

Free Play soll ein **echtes Blackjack-Spiel** simulieren und nicht nur zufällige Hände erzeugen.

Es gibt:

```text
6 echte simulierte Decks
312 reguläre Karten
virtuelle Einsätze
Dealer
Hit
Stand
Double
Split
Insurance
Even Money
Blackjack/Payout
mehrere Split-Hände
```

Keine Echtgeldfunktion.

Keine Einzahlung.

Kein Server.

---

# 13. Shoe Engine

Eine Karte:

```ts
interface Card {
  id: string;
  deck: number;

  rank:
    | "2" | "3" | "4" | "5" | "6"
    | "7" | "8" | "9" | "10"
    | "J" | "Q" | "K" | "A";

  suit:
    | "clubs"
    | "diamonds"
    | "hearts"
    | "spades";
}
```

Shoe:

```ts
interface Shoe {
  cards: Card[];
  discard: Card[];
}
```

Beim Start:

```text
6 × 52 = 312 Karten
```

Jede Karte existiert wirklich nur einmal pro Deck.

Kein:

```ts
randomRank();
```

für jede Ziehung.

Sondern:

```ts
shoe.draw();
```

Die Karte verschwindet tatsächlich aus dem Shoe.

## Shuffle

Fisher-Yates:

```ts
shuffle(cards, rng)
```

RNG muss injizierbar sein:

```ts
createShoe(rng)
```

Produktiv:

```text
browser randomness
```

Tests:

```text
seeded deterministic RNG
```

Damit lassen sich komplette Runden reproduzieren.

## Hinweis zum Wiesbadener Shuffler

Die offiziellen Informationen bestätigen sechs Decks und einen Shuffler, verraten aber nicht ausreichend die interne Arbeitsweise der Maschine. :chatgpt-content-reference{index="5"}

Die App sollte deshalb nicht behaupten:

> „Exakte Simulation der Wiesbadener Mischmaschine“

sondern:

> **6-deck physical shoe simulation based on the Wiesbaden rules.**

Keine Card-Counting-Funktion und keine Annahme über die tatsächliche Kartenpenetration des Casinos.

---

# 14. Free-Play-Spielzustände

Saubere State Machine:

```text
BETTING
   ↓
INITIAL_DEAL
   ↓
INSURANCE / EVEN MONEY?
   ↓
PLAYER_TURN
   ↓
PLAYER_TURN_SPLIT_2
   ↓
PLAYER_TURN_SPLIT_3
   ↓
PLAYER_TURN_SPLIT_4
   ↓
DEALER_TURN
   ↓
SETTLEMENT
   ↓
ROUND_SUMMARY
   ↓
BETTING
```

Keine UI-Komponente darf eigenständig Regeln verändern.

Game Engine:

```ts
GameEngine
 ├── dealInitial()
 ├── hit()
 ├── stand()
 ├── double()
 ├── split()
 ├── insurance()
 ├── dealerPlay()
 └── settle()
```

---

# 15. Virtuelle Einsätze

Default Practice Bankroll:

```text
1.000 €
```

oder neutral:

```text
1.000 Credits
```

Ich würde für Wiesbaden tatsächlich virtuelle `€` verwenden, damit sich Einsätze realistisch anfühlen, aber deutlich kennzeichnen:

```text
Practice bankroll
Virtual money only
```

Chips:

```text
10 €
20 €
50 €
100 €
```

Der aktuell erste Wiesbadener Tisch hat laut FAQ normalerweise 10 € Minimum; weitere Tische können andere Limits haben. :chatgpt-content-reference{index="6"}

Free Play könnte daher starten mit:

```text
Table minimum: 10 €
```

---

# 16. Payout Engine

```text
Normal win       +1× wager
Loss             -1× wager
Push              0
Blackjack         +1.5× wager
Double win        +2× original wager
Double loss       -2× original wager
```

Blackjack gilt nur bei der ursprünglichen Zwei-Karten-Hand.

Nach Split:

```text
A + 10
```

ist 21, aber **kein Blackjack**. Das entspricht auch den Wiesbadener Regeln. :chatgpt-content-reference{index="7"}

---

# 17. Strategy Warning im Free Play

Das ist das wichtigste Lernfeature des Spielmodus.

Beispiel:

```text
Dealer: 10
You: 8 + 8

Du drückst SPLIT.
```

App fängt die Aktion zunächst ab:

```text
⚠ BASIC STRATEGY WARNING

You chose:
SPLIT

Wiesbaden Strategy:
HIT

8,8 vs 10 is an ENHC exception.

[ USE HIT ]

[ PLAY SPLIT ANYWAY ]

[ ? MARK AS UNSURE ]
```

Der Nutzer darf also bewusst trotzdem falsch spielen.

Damit bleibt es ein **Free Play** und kein zwangsgesteuertes Tutorial.

## Drei Warning-Modi

Settings:

```text
Strategy warnings

● Before executing
○ After executing
○ Disabled
```

Default:

```text
Before executing
```

### Before

Falscher Move wird abgefangen.

### After

Spielzug wird ausgeführt und danach erscheint:

```text
Strategy deviation: Basic Strategy was HIT.
```

### Disabled

Komplett normales Free Play.

---

# 18. Free-Play-Statistik unterscheidet Versuch und Ausführung

Angenommen:

```text
Strategy: HIT

Spieler drückt STAND.
Warning erscheint.
Spieler wählt danach HIT.
```

Dann darf die Statistik nicht behaupten, der Spieler hätte sofort richtig gespielt.

Speichern:

```ts
attemptedAction: "stand",
recommendedAction: "hit",
executedAction: "hit",

warningShown: true,
warningAccepted: true
```

Dadurch entstehen:

```text
Raw decision accuracy
Strategy adherence
Warning corrections
Overrides
```

Beispiel:

```text
Raw accuracy             91.4 %
Final strategy adherence 98.8 %

Warnings shown              27
Accepted corrections        23
Ignored warnings             4
```

Für das Lernen ist **Raw Accuracy** die wichtigere Zahl.

---

# 19. „Bin unsicher“ im Free Play

Der Button bleibt während jeder Entscheidung sichtbar:

```text
Dealer 6

You:
5 + 4

[? Bin unsicher]

HIT
STAND
DOUBLE
```

Tippt man `Bin unsicher`:

```text
hard-9-vs-6
```

wird gespeichert.

Dann geht das Spiel normal weiter.

Dadurch kann eine reale Spielsituation später unmittelbar in:

```text
Train → Unsicher
```

auftauchen.

---

# 20. Strategy Resolver

Eine zentrale API:

```ts
getStrategyAdvice({
  cards,
  dealerUpCard,
  allowedActions
});
```

Response:

```ts
interface StrategyAdvice {
  decisionKey: string;

  handType:
    | "hard"
    | "soft"
    | "pair";

  recommendedAction:
    | "hit"
    | "stand"
    | "double"
    | "split";

  fallbackAction?: "hit" | "stand";

  explanationKey: string;
}
```

Beispiel:

```json
{
  "decisionKey": "pair-88-vs-10",
  "handType": "pair",
  "recommendedAction": "hit",
  "explanationKey": "enhc.88-vs-10"
}
```

---

# 21. Pair-Erkennung in Wiesbaden

Wichtig für die Engine:

Die offiziellen Regeln sprechen bei Splits von **punktgleichen Karten**. :chatgpt-content-reference{index="8"}

Deshalb darf `canSplit()` nicht stumpf prüfen:

```ts
card1.rank === card2.rank
```

sondern:

```ts
blackjackValue(card1) === blackjackValue(card2)
```

Damit wären beispielsweise:

```text
K + Q
J + 10
Q + 10
```

wertgleich.

Basic Strategy sagt bei 10-Wert-Paaren ohnehin:

```text
STAND
```

aber für eine regelgetreue Simulation muss der Split-Button korrekt enabled/disabled sein.

---

# 22. Strategy-Feedback

Nach falscher Antwort im Trainer:

```text
✕ STAND

Correct:
HIT

16 vs 10

Dealer 10 is strong.
With ENHC you should hit this hand.

Response:
1.82 s

[? KEEP IN UNSURE LIST]

[NEXT]
```

Bei einer bereits als unsicher markierten Situation:

```text
? You marked this hand as unsure before.
```

---

# 23. Erklärungen

Nicht dynamisch von einer KI erzeugen.

Stattdessen:

```ts
const explanations = {
  "hard-12-vs-4":
    "Hard 12 stands against dealer 4–6 and hits otherwise.",

  "pair-88-vs-10":
    "Under ENHC rules, 8,8 is hit against dealer 10 rather than split.",

  "pair-AA-vs-A":
    "Under ENHC rules, A,A is hit against a dealer Ace."
};
```

Dadurch bleiben Erklärungen reproduzierbar und testbar.

---

# 24. Adaptive Question Engine

Jede Matrixzelle hat Stats.

```ts
interface DecisionStats {
  seen: number;

  correct: number;
  wrong: number;

  confidentCorrect: number;
  confidentWrong: number;

  unsureCorrect: number;
  unsureWrong: number;

  unsureCount: number;

  currentStreak: number;
  bestStreak: number;

  lastSeenAt: number | null;

  averageResponseMs: number;
  recentAverageResponseMs: number;

  mastery: number;
}
```

Auswahlgewicht etwa:

```ts
weight =
  baseWeight
  * errorWeight
  * uncertaintyWeight
  * confidenceErrorWeight
  * recencyWeight;
```

Beispiel:

```ts
const errorFactor =
  1 + stats.wrong / Math.max(stats.seen, 1) * 5;

const unsureFactor =
  1 + Math.min(stats.unsureCount, 4) * 0.75;

const confidentWrongFactor =
  1 + Math.min(stats.confidentWrong, 3);

const unseenFactor =
  stats.seen < 3 ? 2.5 : 1;
```

---

# 25. Mastery

Mastery darf nicht nur Accuracy sein.

Beispiel:

```ts
mastered =
  stats.seen >= 5 &&
  stats.recentCorrect >= 5 &&
  stats.recentAverageResponseMs < 2500;
```

Score:

```text
Accuracy       80 %
Speed          15 %
Confidence      5 %
```

Eine Situation mit:

```text
5/5 richtig
aber jedes Mal 7 Sekunden
```

ist korrekt gelernt, aber noch nicht automatisiert.

---

# 26. Strategy View

Eigener Bildschirm:

```text
Strategy

[ HARD ] [ SOFT ] [ PAIRS ]

Dealer
      2 3 4 5 6 7 8 9 T A

...
```

Toggle:

```text
[ Strategy ] [ My Mastery ]
```

`Strategy` zeigt H/S/D/P.

`My Mastery` färbt dieselben Zellen anhand der persönlichen Beherrschung:

```text
Unseen
Learning
Weak
Good
Mastered
```

Tap auf eine Zelle:

```text
8,8 vs 10

Correct action:
HIT

Seen: 12
Correct: 9
Accuracy: 75 %

Unsure: 4×

Average response:
2.4 s

[DRILL THIS]
[MARK UNSURE]
```

---

# 27. Stats Dashboard

```text
TOTAL

1,482 decisions
94.1 % raw accuracy
1.63 s average
1.31 s median
```

Bereiche:

```text
Hard       97 %
Soft       92 %
Pairs      88 %
```

Confidence:

```text
Confident wrong        12
Unsure wrong           24
Unsure correct         73
```

Free Play:

```text
Rounds                124
Hands                  138

Raw accuracy          93.2 %
Strategy adherence    98.1 %

Warnings               31
Corrections accepted   26
Overrides                5
```

Zusätzlich:

```text
Virtual bankroll
Virtual P/L
```

aber nicht als primärer Lernscore.

---

# 28. Drei-Tage-Challenge

Da der konkrete Zweck kurzfristiges Lernen ist:

```text
3 DAY WIESBADEN CHALLENGE
```

## Day 1

```text
Hard totals
Soft totals
Basic boundaries
```

Ziel:

```text
≥ 95 %
```

## Day 2

```text
Pairs
ENHC traps
Unsicher-Liste
```

## Day 3

```text
Mixed Practice
Free Play
Weak Spots
100-hand Casino Test
```

Abschluss:

```text
READY FOR WIESBADEN

Basic Strategy    97 %
Median            1.42 s
Confident wrong      2
Unresolved unsure    4
```

---

# 29. LocalStorage

Key:

```text
european-blackjack-trainer:v1
```

Schema:

```ts
interface AppState {
  schemaVersion: 1;

  createdAt: number;
  lastUsedAt: number;

  activeRuleSet: "wiesbaden";

  settings: {
    theme: "dark" | "light" | "system";

    strategyWarnings:
      | "before"
      | "after"
      | "disabled";

    autoAdvance: boolean;
    showTimer: boolean;

    cardTheme:
      | "minimal"
      | "classic";
  };

  training: {
    totalAnswers: number;
    totalCorrect: number;

    decisions: Record<string, DecisionStats>;

    difficult: Record<string, DifficultDecision>;
  };

  freePlay: {
    bankroll: number;

    rounds: number;
    hands: number;

    attemptedCorrect: number;
    attemptedWrong: number;

    warningsShown: number;
    warningsAccepted: number;
    warningsOverridden: number;
  };

  sessions: SessionSummary[];
}
```

---

# 30. Persistenz des Free Plays

Ein Reload mitten in einer Hand sollte möglichst nicht alles zerstören.

Deshalb kann zusätzlich gespeichert werden:

```ts
interface PersistedRound {
  shoe: Card[];

  dealerCards: Card[];

  playerHands: PlayerHand[];

  activeHandIndex: number;

  phase: GamePhase;

  bankroll: number;

  currentBet: number;
}
```

Beim erneuten Laden:

```text
Continue current game?

[CONTINUE]
[START NEW ROUND]
```

---

# 31. Datenexport

Settings:

```text
Export Data
Import Data
Reset Stats
Reset Free Play
Reset Everything
```

Export:

```text
blackjack-trainer-backup-2026-09-27.json
```

Keine Cloud erforderlich.

---

# 32. Privacy

Default:

```text
No account
No tracking
No analytics
No backend
No cookies required
No personal information transmitted
```

About:

> All learning progress and simulated bankroll data stay in this browser unless you explicitly export them.

Das passt perfekt zu GitHub Pages.

---

# 33. PWA

Die Seite soll installierbar sein.

```text
manifest.webmanifest
service-worker
offline asset cache
icons
```

Dadurch funktioniert:

```text
Safari
→ Teilen
→ Zum Home-Bildschirm
```

Danach fühlt sich die Anwendung nahezu wie eine native iPhone-App an.

Auch der Trainer sollte vollständig offline funktionieren.

---

# 34. Desktop-Shortcuts

```text
H = Hit
S = Stand
D = Double
P = Split

U = Unsicher

Enter / Space = Next
```

Buttons behalten ihre Position immer.

Wenn eine Aktion nicht möglich ist:

```text
DOUBLE
```

wird disabled, aber **nicht entfernt**.

Das verhindert, dass Muscle Memory durch springende Buttons kaputtgeht.

---

# 35. Visuelles Design

Stil:

```text
dunkel
ruhig
modern
Casino-Anmutung ohne Casino-Kitsch
```

Keine blinkenden Slots, Goldexplosionen oder Gewinnanimationen.

Free Play:

```text
dunkelgrüner Tisch
weiße Karten
dezente Chips
```

Trainer:

```text
neutraler dunkler Hintergrund
maximaler Fokus auf Karten und Buttons
```

Action Buttons:

```text
HIT
STAND
DOUBLE
SPLIT
```

`Unsicher` bewusst neutral, nicht rot:

```text
? BIN UNSICHER
```

---

# 36. Architektur

```text
src/
├── app/
│   ├── App.tsx
│   └── router.ts
│
├── rules/
│   ├── types.ts
│   └── wiesbaden.ts
│
├── strategy/
│   ├── types.ts
│   ├── wiesbaden.ts
│   ├── resolver.ts
│   └── explanations.ts
│
├── blackjack/
│   ├── card.ts
│   ├── hand.ts
│   ├── shoe.ts
│   ├── dealer.ts
│   ├── engine.ts
│   ├── settlement.ts
│   └── stateMachine.ts
│
├── trainer/
│   ├── questionGenerator.ts
│   ├── scheduler.ts
│   ├── mastery.ts
│   └── confidence.ts
│
├── storage/
│   ├── schema.ts
│   ├── migrations.ts
│   └── localStorage.ts
│
├── components/
│   ├── Card.tsx
│   ├── Hand.tsx
│   ├── ActionButtons.tsx
│   ├── UnsureButton.tsx
│   ├── StrategyWarning.tsx
│   └── ChipSelector.tsx
│
├── pages/
│   ├── TrainPage.tsx
│   ├── FreePlayPage.tsx
│   ├── StrategyPage.tsx
│   ├── StatsPage.tsx
│   └── SettingsPage.tsx
│
└── tests/
```

---

# 37. Tech Stack

```text
Vite
React
TypeScript

Vitest
React Testing Library

optional:
Playwright

PWA:
vite-plugin-pwa
```

State Management braucht nicht zwingend Redux.

Ein sauberer:

```text
React Context + reducer
```

oder Zustand reicht völlig.

Die **Blackjack Engine selbst darf kein React kennen**.

Also:

```ts
const result = game.hit(...)
```

statt Game-Logik in Button-Callbacks.

---

# 38. Tests – Strategy

Pflichttests:

```ts
expect(strategy(["8", "8"], "10")).toBe("H");
expect(strategy(["8", "8"], "9")).toBe("P");

expect(strategy(["A", "A"], "A")).toBe("H");
expect(strategy(["A", "A"], "10")).toBe("P");

expect(strategy(["A", "7"], "8")).toBe("S");
expect(strategy(["A", "7"], "9")).toBe("H");

expect(strategy(["6", "6"], "6")).toBe("P");
expect(strategy(["6", "6"], "7")).toBe("H");

expect(strategy(["10", "6"], "6")).toBe("S");
expect(strategy(["10", "6"], "7")).toBe("H");
```

Zusätzlich Matrix-Integrity:

```text
jede Zeile hat 10 Dealer-Werte
jede Zelle enthält gültige Aktion
jede Decision-ID ist eindeutig
jede Zelle besitzt eine Erklärung
```

---

# 39. Tests – Blackjack Engine

Mindestens:

```text
Ace value handling
Blackjack detection
Dealer S17
Dealer soft 17 stand
Bust
Push
3:2 payout
Double
Double payout
Double only 9/10/11
Split
DAS
4-hand maximum
split ace one-card rule
split 21 != blackjack
insurance payout
even money
ENHC dealer blackjack settlement
```

Besonders wichtig:

```text
Dealer Ace
Player doubles
Dealer later gets Blackjack
```

und:

```text
Dealer 10
Player splits
Dealer later gets Blackjack
```

Denn genau diese Situationen unterscheiden ENHC besonders deutlich.

---

# 40. Tests – Unsicher-System

```text
marking a decision adds it once
marking again increments unsureCount
same cell with different suits maps to same key
J dealer and K dealer both map to dealer 10
unsure does not count as wrong
unsure state survives reload
resolved entries remain in history
```

---

# 41. GitHub Pages

Workflow:

```text
push main
    ↓
npm ci
    ↓
npm test
    ↓
npm run build
    ↓
deploy dist
```

GitHub Actions soll nur deployen, wenn Tests erfolgreich sind.

URL beispielsweise:

```text
https://<username>.github.io/european-blackjack-trainer/
```

Vite `base` entsprechend konfigurieren.

---

# 42. Repository-Dateien

```text
README.md
LICENSE
THIRD_PARTY_NOTICES.md
CONTRIBUTING.md

docs/
├── rules.md
├── strategy.md
└── strategy-sources.md
```

Code-Lizenz:

```text
MIT
```

Assets separat unter jeweiliger Asset-Lizenz.

---

# 43. README-Disclaimer

```md
## Disclaimer

European Blackjack Trainer is an independent educational project.

It is not affiliated with, endorsed by, or operated by
Spielbank Wiesbaden.

The "Wiesbaden Rules" preset is based on publicly available
game rules published by Spielbank Wiesbaden.

The application uses virtual money only and provides no
real-money gambling functionality.
```

Damit ist auch der Name sauber eingeordnet.

---

# 44. Release-Prioritäten

## V1 – muss funktionieren

```text
Strategy Engine
Trainer
Unsicher
Difficult Drill
Basic Stats
LocalStorage
Free Play
6-deck Shoe
Virtual Bets
Hit/Stand/Double/Split
Strategy Warnings
GitHub Pages
Responsive Mobile UI
```

## V1.1

```text
3-Day Challenge
Strategy Heatmap
PWA
JSON Import/Export
Session History
better animations
```

## Später

```text
additional casino rule presets
rule-set selector
Kenney classic card theme
Twins/Crazy Twins simulation
multiple languages
```

TWINS und CRAZY TWINS würde ich **bewusst nicht** in v1 bauen. Sie helfen beim Erlernen der Basic Strategy nicht und vergrößern die Game Engine erheblich.

---

# 45. Definition of Done für Codex

Der Auftrag an Codex kann am Ende praktisch so lauten:

```text
Build the complete application described in this specification.

The project is a mobile-first React + TypeScript PWA called
"European Blackjack Trainer".

The initial and default ruleset is "Wiesbaden Rules".

The application has four primary areas:

1. Train
2. Free Play
3. Strategy
4. Stats

TRAIN:
- Render real playing-card representations.
- Ask Basic Strategy decisions.
- Provide Learn, Practice, Weak Spots, Unsure and Casino Test modes.
- Measure response time.
- Use adaptive weighted repetition.
- Store per-decision mastery.
- Never derive strategy decisions heuristically.

UNSURE:
- A persistent "I'm unsure" button must be available for every decision
  in Train and Free Play.
- Pressing it must not reveal the answer.
- It marks the canonical strategy decision as uncertain.
- Repeated marks increment an uncertainty counter rather than creating duplicates.
- Marked decisions can be trained separately.

FREE PLAY:
- Simulate an actual six-deck shoe consisting of 312 regular cards.
- Cards are drawn without replacement from the shoe.
- Implement betting with virtual money only.
- Implement Hit, Stand, Double and Split.
- Implement Wiesbaden ENHC dealer flow.
- Implement S17.
- Implement 3:2 Blackjack.
- Implement Double only on two-card totals 9, 10 or 11.
- Implement DAS.
- Implement up to four hands after splitting.
- Implement the split-ace restriction.
- A 21 after a split is not Blackjack.
- Implement Insurance and Even Money.
- Do not implement real-money functionality.

STRATEGY WARNINGS:
- Before a Free Play action is executed, compare it with the canonical
  Basic Strategy.
- If the selected move deviates from strategy, show a warning.
- The user can either accept the recommended action or deliberately
  execute their original action.
- Store attempted action, recommended action and executed action separately.
- Strategy warnings can be configured as before-action, after-action or disabled.

STRATEGY:
- Keep exactly one canonical strategy data source.
- Trainer, warnings, heatmap and tests must all consume this source.
- Support fallback actions where Double or Split is unavailable.

STATS:
- Persist all stats using versioned localStorage.
- Track raw decision accuracy separately from final strategy adherence.
- Track uncertain decisions separately from incorrect decisions.
- Track confident-wrong decisions.
- Provide Hard / Soft / Pair statistics.
- Provide Free Play statistics.
- Provide a personal mastery heatmap.

ARCHITECTURE:
- Blackjack game logic must be independent of React.
- Rules must be represented as a RuleSet object.
- Strategy must be represented as immutable data.
- Use deterministic/injectable RNG for tests.
- Implement localStorage schema migrations.

UI:
- Mobile-first.
- Four fixed action buttons: Hit, Stand, Double, Split.
- Disabled actions remain visible.
- Add a persistent "I'm unsure" control.
- Dark modern casino-inspired design.
- Do not use flashing gambling-style reward effects.
- Fully responsive.
- Keyboard shortcuts on desktop.

DEPLOYMENT:
- Vite.
- React.
- TypeScript.
- Vitest.
- GitHub Actions.
- GitHub Pages.
- PWA/offline support.

PRIVACY:
- No account.
- No backend.
- No tracking by default.
- No server-side storage.
- All progress remains in localStorage.

TESTING:
- Cover every strategy matrix cell.
- Cover all relevant Blackjack game-state transitions.
- Cover ENHC dealer Blackjack cases.
- Cover splitting and doubling.
- Cover uncertainty storage and canonical decision mapping.

Do not silently change any Blackjack strategy decision based on generic
Blackjack knowledge. Treat the provided ruleset and strategy data as the
canonical specification.
```

## Endgültige Namensentscheidung

Ich würde tatsächlich nehmen:

# **European Blackjack Trainer**

und direkt darunter immer:

> **Wiesbaden Rules**  
> `6D · ENHC · S17 · D9–11 · DAS`

Das klingt nach einem richtigen öffentlichen Projekt, ohne vorzutäuschen, dass „European Blackjack“ überall exakt dieselben Regeln hätte. Und wenn du später Frankfurt, Holland Casino oder eine normale US-S17-Variante ergänzt, musst du weder Repository noch App umbenennen.

Für die Karten würde ich **v1 mit selbst gerenderten SVG-Karten bauen** und optional Kenney als zweites Theme vorbereiten. Dann ist Codex nicht einmal von externen Bildern abhängig; für Chips und eine hübschere Classic-Optik ist der CC0-Kenney-Pack anschließend praktisch ideal. :chatgpt-content-reference{index="9"}