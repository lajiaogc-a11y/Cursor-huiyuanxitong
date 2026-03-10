import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initWebVitals } from "./services/webVitalsService";

createRoot(document.getElementById("root")!).render(<App />);

// Initialize Web Vitals collection (production only)
initWebVitals();
