import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./chat.css";
import "./sales-sections.css";
import "./mahmoud-theme.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
