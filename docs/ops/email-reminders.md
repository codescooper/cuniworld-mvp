# Emails de rappel — CuniWorld

> **Référence** : roadmap item 6.1.

L'app envoie déjà des **notifications navigateur** (push web) pour les rappels vaccins et mises-bas. Pour aller plus loin et toucher les utilisateurs qui n'ouvrent pas l'app tous les jours, on ajoute des **emails de rappel quotidiens** via une **Supabase Edge Function** + **Resend**.

## Architecture

```
┌──────────────────┐    daily 07:00 UTC      ┌────────────────────────┐
│ Supabase pg_cron │ ─────────────────────▶  │ Edge Function          │
│   schedule       │                          │  daily-reminders       │
└──────────────────┘                          └────────────────────────┘
                                                       │
                                                       ▼
                            ┌─────────────────────────────────────┐
                            │ Pour chaque ferme :                 │
                            │  1. SELECT user emails + reminders  │
                            │  2. Format HTML                     │
                            │  3. POST Resend API                 │
                            └─────────────────────────────────────┘
```

## Étape 1 — Compte Resend

1. Créer un compte sur https://resend.com (free tier : 3000 emails/mois, 100/jour).
2. Vérifier le domaine d'envoi (DNS DKIM + SPF — voir tutoriel Resend).
3. Générer une API Key (Settings → API Keys), la copier.
4. La poser dans Supabase : Dashboard → Project Settings → **Edge Functions** → **Secrets** → ajouter `RESEND_API_KEY`.

## Étape 2 — Edge Function

Créer le dossier `supabase/functions/daily-reminders/index.ts` (Deno, TypeScript) :

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL   = "CuniWorld <noreply@cuniworld.app>";

Deno.serve(async () => {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Charger toutes les fermes + leurs membres + leur reminders du jour.
  //    On reproduit ici la logique de health.js#getReminders côté serveur :
  //    events vaccin/traitement dont data.nextDate ≤ today+7.
  const today = new Date().toISOString().slice(0, 10);
  const window = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: events } = await supa
    .from("events")
    .select("rabbit_id, farm_id, type, data")
    .in("type", ["vaccin", "traitement"])
    .gte("data->>nextDate", today)
    .lte("data->>nextDate", window);

  // 2. Grouper par ferme.
  const byFarm = new Map<string, any[]>();
  for (const e of events || []) {
    if (!byFarm.has(e.farm_id)) byFarm.set(e.farm_id, []);
    byFarm.get(e.farm_id)!.push(e);
  }

  // 3. Pour chaque ferme, récupérer les emails des owners/admins et envoyer.
  let sent = 0;
  for (const [farmId, reminders] of byFarm) {
    const { data: members } = await supa
      .from("farm_members")
      .select("user_id, role")
      .eq("farm_id", farmId)
      .in("role", ["owner", "admin"]);
    if (!members || members.length === 0) continue;

    const userIds = members.map(m => m.user_id);
    const { data: users } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = (users?.users || [])
      .filter(u => userIds.includes(u.id) && u.email)
      .map(u => u.email!);
    if (emails.length === 0) continue;

    const html = `
      <h2>Rappels CuniWorld du ${today}</h2>
      <p>Vous avez <strong>${reminders.length} acte vétérinaire</strong> à effectuer dans les 7 prochains jours :</p>
      <ul>
        ${reminders.map(r => `
          <li>${r.type === "vaccin" ? "Vaccin" : "Traitement"} —
              ${r.data.product || "—"} — prévu le ${r.data.nextDate}</li>
        `).join("")}
      </ul>
      <p><a href="https://cuniworld.app">Ouvrir CuniWorld</a></p>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emails,
        subject: `CuniWorld — ${reminders.length} rappel(s) à venir`,
        html,
      }),
    });
    sent += emails.length;
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
```

Déployer :

```bash
supabase functions deploy daily-reminders --project-ref <REF>
```

## Étape 3 — Cron quotidien

Ajouter une migration `016_email_reminders_cron.sql` :

```sql
-- Active pg_cron (déjà fait si on a configuré le mode démo).
create extension if not exists pg_cron;

-- Tous les jours à 07:00 UTC, appelle l'Edge Function via HTTP.
select cron.schedule(
  'daily-reminders',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://<REF>.supabase.co/functions/v1/daily-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )
    );
  $$
);
```

(Nécessite l'extension `pg_net` pour `net.http_post`, déjà disponible sur Supabase Pro.)

## Étape 4 — Désinscription utilisateur

Ajouter dans la table `profiles` une colonne `email_reminders_enabled boolean default true`. L'Edge Function filtre :

```sql
where profiles.email_reminders_enabled = true
```

Côté app : un toggle dans **Actions → Paramètres ferme → Mon profil** (à câbler dans le formulaire profil existant).

## État actuel

- ⏳ Procédure documentée (ce fichier), prête à activer en prod selon besoin.
- ⛔ Pas encore activé : nécessite compte Resend payant si > 3000 emails/mois, et tests en staging avant prod (volume + spam policy).
- ✅ Le flux **notifications navigateur** existant (`pushNotifications.js`) reste la solution par défaut côté client — gratuit, opt-in user-side, suffit pour la plupart des usages.

Considéré comme **post-MVP** : à activer quand on aura > 50 utilisateurs actifs et un retour explicite « j'aimerais des emails ».
