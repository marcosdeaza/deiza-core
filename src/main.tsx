import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "./index.css";
import { setupNativeShell } from "@/lib/native";

// Native shell (status bar, keyboard, splash) — no-op on the web
void setupNativeShell();

createRoot(document.getElementById("root")!).render(<App />);
