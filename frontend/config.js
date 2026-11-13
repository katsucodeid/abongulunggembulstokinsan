// API same-origin: frontend and backend are served by the same Termux server.
window.INSAN_CONFIG = { API_BASE: "" };

// Load the bundled work-home ringtone after app.js has initialized its alarm library.
document.addEventListener("DOMContentLoaded", () => {
  const script = document.createElement("script");
  script.src = "./alarm-pulang.js";
  script.defer = true;
  document.body.appendChild(script);
}, { once: true });
