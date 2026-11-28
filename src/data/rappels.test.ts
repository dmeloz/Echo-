import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxServeur } from "../sync/faux-serveur";

const { etat, supa } = fauxServeur();
vi.mock("../sync/client", () => ({ get supa() { return supa; } }));
// Ce téléphone a déjà un abonnement aux notifications (fait avec son ancien compte).
const abonnement = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "cle-publique", auth: "secret" } };
vi.stubGlobal("window", { PushManager: {}, Notification: {} });
vi.stubGlobal("navigator", { onLine: true, serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ toJSON: () => abonnement }) } }) } });

import { db } from "./db";
import { rattacherRappels } from "./rappels";

beforeEach(async () => { await db.reglages.clear(); etat.appels.length = 0; etat.abonnements.length = 0; });

describe("les rappels après une reconnexion", () => {
  it("3. l'abonnement suit le nouveau compte du téléphone (une fois), avec ses réglages", async () => {
    const repris: unknown[] = [];
    etat.rpc.reprendre_abonnement = (a) => { repris.push(a); return true; };
    await db.reglages.bulkPut([{ cle: "rappels", valeur: { actif: true, aLHeure: false, matin: "06:45" } }, { cle: "rappelsCompte", valeur: "ancien-compte" }]);

    await rattacherRappels("nouveau-compte");
    // Le serveur redonne la ligne à ce téléphone (il vérifie les deux clés), puis les réglages sont réécrits.
    expect(repris).toEqual([{ p_endpoint: abonnement.endpoint, p_p256dh: "cle-publique", p_auth: "secret" }]);
    expect(etat.abonnements).toMatchObject([{ endpoint: abonnement.endpoint, a_l_heure: false, matin: "06:45" }]);
    expect(etat.appels).toEqual(["rpc:reprendre_abonnement", "ecrire:abonnements"]);
    expect((await db.reglages.get("rappelsCompte"))?.valeur).toBe("nouveau-compte");

    // Même compte au lancement suivant : rien à refaire.
    etat.appels.length = 0;
    await rattacherRappels("nouveau-compte");
    expect(etat.appels).toEqual([]);
  });

  it("ne fait rien si les rappels sont éteints ; réessaie plus tard si le serveur ne répond pas", async () => {
    await db.reglages.put({ cle: "rappels", valeur: { actif: false, aLHeure: true, matin: null } });
    await rattacherRappels("nouveau-compte");
    expect(etat.appels).toEqual([]);
    await db.reglages.put({ cle: "rappels", valeur: { actif: true, aLHeure: true, matin: null } });
    etat.panne = true;
    await expect(rattacherRappels("nouveau-compte")).rejects.toBeTruthy();
    expect(await db.reglages.get("rappelsCompte")).toBeUndefined(); // pas noté : ce sera refait au prochain lancement
    etat.panne = false;
    await rattacherRappels("nouveau-compte");
    expect((await db.reglages.get("rappelsCompte"))?.valeur).toBe("nouveau-compte");
  });
});
