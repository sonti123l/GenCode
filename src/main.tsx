import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../index.css";
import { EditorProvider } from "./context/EditorContext";
import AppLayout from "./components/core/AppLayout";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppLayout>
      <EditorProvider>
        <App />
      </EditorProvider>
    </AppLayout>
  </React.StrictMode>,
);
