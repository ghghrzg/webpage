import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowDown,
  Check,
  CircleHelp,
  Copy,
  Hand,
  Plus,
  X,
} from "lucide-react";
import { handValue, type Card } from "./core/cards";
import { ACTIONS, ACTION_LABEL, type Action } from "./core/strategy";

const suitSymbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const suitNames = {
  clubs: "Kreuz",
  diamonds: "Karo",
  hearts: "Herz",
  spades: "Pik",
};
export function PlayingCard({ card }: { card: Card }) {
  return (
    <div
      className={`playing-card ${["diamonds", "hearts"].includes(card.suit) ? "red" : ""}`}
      role="img"
      aria-label={`${card.rank} ${suitNames[card.suit]}`}
    >
      <span className="card-corner">
        <b>{card.rank}</b>
        <span>{suitSymbols[card.suit]}</span>
      </span>
      <span className="card-pip" aria-hidden="true">
        {suitSymbols[card.suit]}
      </span>
      <span className="card-corner bottom" aria-hidden="true">
        <b>{card.rank}</b>
        <span>{suitSymbols[card.suit]}</span>
      </span>
    </div>
  );
}
export function HandCards({
  cards,
  label,
  total = true,
}: {
  cards: Card[];
  label: string;
  total?: boolean;
}) {
  const value = handValue(cards);
  return (
    <div className="hand-display">
      <div className="hand-label">
        {label}{" "}
        {total && (
          <span className={`total-badge ${value.bust ? "bust" : ""}`}>
            {value.total}
            {value.soft ? " soft" : ""}
          </span>
        )}
      </div>
      <div className={`cards cards-${Math.min(cards.length, 6)}`}>
        {cards.map((card) => (
          <PlayingCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
const icons = { H: Plus, S: Hand, D: ArrowDown, P: Copy };
const subtitles = {
  H: "Karte ziehen",
  S: "Stehen bleiben",
  D: "Verdoppeln",
  P: "Teilen",
};
export function ActionButtons({
  allowed,
  onAction,
  disabled = false,
}: {
  allowed: readonly Action[];
  onAction: (action: Action) => void;
  disabled?: boolean;
}) {
  return (
    <div className="action-grid">
      {ACTIONS.map((action) => {
        const Icon = icons[action];
        return (
          <button
            key={action}
            className={`action action-${action}`}
            disabled={disabled || !allowed.includes(action)}
            onClick={() => onAction(action)}
            aria-label={`${ACTION_LABEL[action]} – ${subtitles[action]}`}
          >
            <span className="action-top">
              <Icon size={18} />
              <kbd>{action}</kbd>
            </span>
            <strong>{ACTION_LABEL[action]}</strong>
            <small>{subtitles[action]}</small>
          </button>
        );
      })}
    </div>
  );
}
export function UnsureButton({
  marked,
  onClick,
  disabled = false,
}: {
  marked: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`unsure-button ${marked ? "marked" : ""}`}
      disabled={marked || disabled}
      onClick={onClick}
      aria-pressed={marked}
    >
      {marked ? <Check size={15} /> : <CircleHelp size={15} />}
      {marked ? "Für später gemerkt" : "Bin unsicher"}
      <kbd>U</kbd>
    </button>
  );
}
export function Metric({
  value,
  label,
  accent = false,
}: {
  value: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">♧</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        {dismissible && (
          <button
            className="icon-button"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
export function useShortcuts(
  onAction: (action: Action) => void,
  onUnsure: () => void,
  onNext: () => void,
  enabled = true,
) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !enabled ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      const key = event.key.toUpperCase();
      if (ACTIONS.includes(key as Action)) {
        event.preventDefault();
        onAction(key as Action);
      } else if (key === "U") {
        event.preventDefault();
        onUnsure();
      } else if (
        (key === "ENTER" || key === " ") &&
        target.tagName !== "BUTTON" &&
        target.tagName !== "A"
      ) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onAction, onUnsure, onNext, enabled]);
}
export const percent = (correct: number, total: number) =>
  total ? `${Math.round((correct / total) * 100)} %` : "–";
export const euros = (value: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 ? 2 : 0,
  }).format(value);
