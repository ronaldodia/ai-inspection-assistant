import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// defaultCache ne touche que les assets/pages Next.js same-origin — les appels
// vers l'API (api.inspectra.dev.evoluops.com, cross-origin) ne sont jamais
// interceptés ni mis en cache ici : seul l'app shell doit survivre hors ligne,
// jamais une réponse API périmée (limite de photos, statut d'inspection).
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Ni skipWaiting ni clientsClaim : un nouveau déploiement ne doit jamais
  // reprendre le contrôle d'un onglet déjà ouvert en pleine session de
  // capture — le nouveau service worker attend que l'utilisateur ferme et
  // rouvre l'app avant de prendre effet, même si ça retarde un peu la
  // propagation d'un correctif.
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
