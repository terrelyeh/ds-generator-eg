import { ENGENIE_URL, WORKSPACE } from "./config.js";

// Extension pages can't run inline script (MV3 CSP), so the frame URL is set here.
document.getElementById("engenie").src = `${ENGENIE_URL}/embed/${encodeURIComponent(WORKSPACE)}`;
