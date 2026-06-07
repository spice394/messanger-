import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { restoreSession } from "@/lib/session";

restoreSession();

createRoot(document.getElementById("root")!).render(<App />);
