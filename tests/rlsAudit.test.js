/**
 * rlsAudit.test.js — vérifications statiques des migrations RLS.
 *
 * Ces tests lisent les fichiers SQL pour s'assurer que les invariants
 * documentés dans `docs/ops/rls-audit.md` sont préservés à chaque
 * nouvelle migration. Pas de connexion BDD requise — c'est un garde-fou
 * sur le contenu des migrations, pas sur l'instance déployée.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";

function readAllMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  return files.map(f => ({
    name: f,
    sql:  readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
  }));
}

const allSql = readAllMigrations().map(m => m.sql).join("\n");

// Tables métier qui doivent toutes avoir RLS active.
const SENSITIVE_TABLES = [
  "farms", "farm_members", "rabbits", "events", "photos",
  "used_names", "profiles", "farm_settings", "orders", "order_items",
];

describe("Audit RLS — invariants des migrations", () => {
  it("toutes les tables sensibles ont RLS activée", () => {
    for (const table of SENSITIVE_TABLES) {
      const re = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
      expect(allSql, `RLS manquante sur public.${table}`).toMatch(re);
    }
  });

  it("aucune policy ne déclare `using (true)` sans condition", () => {
    // On tolère `using (true)` UNIQUEMENT à l'intérieur d'une fonction
    // security definer (où il sert à élargir temporairement les droits) —
    // pour le reste, c'est un trou béant.
    const offending = allSql
      .split("\n")
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /create\s+policy[\s\S]*using\s*\(\s*true\s*\)/i.test(l));
    expect(offending, "policy ouverte sans condition détectée").toEqual([]);
  });

  it("`is_farm_member` existe et est utilisée par les policies métier", () => {
    expect(allSql).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.is_farm_member/i);
    // Au moins une policy par table métier doit utiliser is_farm_member.
    for (const table of ["rabbits", "events", "photos", "used_names"]) {
      const policyBlock = new RegExp(
        `create\\s+policy[\\s\\S]{0,300}on\\s+public\\.${table}[\\s\\S]{0,400}is_farm_member`,
        "i"
      );
      expect(allSql, `policy is_farm_member manquante sur ${table}`).toMatch(policyBlock);
    }
  });

  it("delete_my_account vérifie auth.uid() avant toute suppression", () => {
    // On capture l'intégralité du corps : `as $$ … $$` (deux marqueurs).
    const fn = allSql.match(/create\s+(?:or\s+replace\s+)?function\s+public\.delete_my_account[\s\S]+?as\s+\$\$[\s\S]+?\$\$/i);
    expect(fn, "fonction delete_my_account introuvable").toBeTruthy();
    const body = fn[0];
    expect(body, "delete_my_account doit être SECURITY DEFINER").toMatch(/security\s+definer/i);
    expect(body, "delete_my_account doit appeler auth.uid()").toMatch(/auth\.uid\(\)/i);
    expect(body, "delete_my_account doit refuser les anonymes").toMatch(/raise\s+exception/i);
  });

  it("les RPC publics shop_place_order/shop_get_order existent et utilisent SECURITY DEFINER", () => {
    for (const rpc of ["shop_place_order", "shop_get_order", "shop_set_order_status"]) {
      const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${rpc}[\\s\\S]+?security\\s+definer`, "i");
      expect(allSql, `${rpc} doit être SECURITY DEFINER`).toMatch(re);
    }
  });

  it("aucune table publique n'autorise INSERT à anon sans RPC", () => {
    // On cherche les policies `for insert ... to anon` posées en direct.
    // Le seul chemin d'écriture autorisé pour anon est via RPC SECURITY DEFINER.
    const directAnonInsert = /create\s+policy[\s\S]{0,200}for\s+insert[\s\S]{0,200}to\s+anon/i;
    expect(allSql, "INSERT direct anon détecté").not.toMatch(directAnonInsert);
  });
});
