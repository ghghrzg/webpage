import { useEffect, useState } from "react";
import type { Card } from "./core/cards";

export const CARD_FLIGHT_MS = 260;
export const CARD_INTERVAL_MS = 150;

/** Presentation only: keeps engine transitions atomic, reveals new cards in order.
 * Existing cards are never replayed on a hit. A new deal key starts a fresh sequence.
 */
export function useCardDeal(cards: Card[], dealKey: string, active: boolean) {
  const signature = cards.map((c) => c.id).join("|");
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [presentation, setPresentation] = useState({
    key: dealKey,
    shown: [] as string[],
    completed: "",
  });
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const ids = signature ? signature.split("|") : [];
    const previous =
      presentation.key === dealKey
        ? presentation.shown.filter((id) => ids.includes(id))
        : [];
    const missing = ids.filter((id) => !previous.includes(id));
    if (reduced || !missing.length) {
      setPresentation({ key: dealKey, shown: ids, completed: signature });
      return;
    }
    const timers = missing.map((id, i) =>
      setTimeout(() => {
        setPresentation((current) => ({
          key: dealKey,
          shown: [
            ...new Set([...(current.key === dealKey ? current.shown : []), id]),
          ],
          completed: "",
        }));
      }, i * CARD_INTERVAL_MS),
    );
    timers.push(
      setTimeout(
        () =>
          setPresentation({ key: dealKey, shown: ids, completed: signature }),
        (missing.length - 1) * CARD_INTERVAL_MS + CARD_FLIGHT_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
    // The queue restarts only for a new set of cards/deal or a visibility change.
  }, [signature, dealKey, active, reduced]);
  const visible = reduced
    ? new Set(cards.map((c) => c.id))
    : new Set(presentation.key === dealKey ? presentation.shown : []);
  const busy =
    !reduced &&
    (presentation.key !== dealKey || presentation.completed !== signature);
  return { visible, busy };
}
