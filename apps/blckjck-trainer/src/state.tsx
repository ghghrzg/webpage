import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { loadState, saveState, type AppState } from "./core/storage";

interface Store {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  notice: string;
  setNotice: (notice: string) => void;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(loadState);
  const [state, setState] = useState(loaded.state);
  const [notice, setNotice] = useState(loaded.notice);
  useEffect(() => {
    if (!saveState(state))
      setNotice(
        "Speichern im Browser fehlgeschlagen. Bitte sichere deinen Fortschritt per JSON-Export.",
      );
  }, [state]);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        state.settings.theme === "system"
          ? query.matches
            ? "dark"
            : "light"
          : state.settings.theme;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [state.settings.theme]);
  return (
    <Context.Provider value={{ state, setState, notice, setNotice }}>
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("StoreProvider fehlt.");
  return store;
}
