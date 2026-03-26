import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { client } from "./lib/appwrite";

void client.ping().catch((error: unknown) => {
	console.warn("Appwrite ping failed:", error);
});

createRoot(document.getElementById("root")!).render(<App />);
