import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "PGRST205"]);
const PLACEHOLDER_RADIUS_SECRET = "MIKROTIK_RADIUS_SECRET";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

interface RadiusCredentialArgs {
  tenantId?: string | null;
  username: string;
  password?: string | null;
  sessionTimeout: number;
  expiresAt: Date;
  speedLimit?: string | null;
}

interface ClearRadiusCredentialArgs {
  tenantId?: string | null;
  username: string;
}

interface SyncRadiusNasArgs {
  tenantId: string;
  sharedSecret: string;
  routerId?: string | null;
}

export const isMissingSchemaError = (error: SupabaseLikeError) => {
  if (!error) return false;

  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("column") && message.includes("does not exist")
  );
};

export const formatRadiusExpiration = (date: Date) =>
  `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")} ${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;

export const generateRadiusSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export const isPlaceholderRadiusSecret = (secret?: string | null) => {
  const normalized = String(secret ?? "").trim().toUpperCase();
  return !normalized || normalized === PLACEHOLDER_RADIUS_SECRET;
};

const slugifyShortname = (value: string) => {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "router";
};

export async function resolveTenantIdFromNas(
  supabase: SupabaseClient,
  tenantId?: string | null,
  nasIp?: string | null,
) {
  if (tenantId) {
    return tenantId;
  }

  const normalizedNas = String(nasIp ?? "").trim();
  if (!normalizedNas) {
    return null;
  }

  const radiusNasLookup = await supabase
    .from("radius_nas")
    .select("tenant_id")
    .eq("nasname", normalizedNas)
    .maybeSingle();

  if (radiusNasLookup.data?.tenant_id) {
    return radiusNasLookup.data.tenant_id as string;
  }

  if (radiusNasLookup.error && !isMissingSchemaError(radiusNasLookup.error)) {
    throw radiusNasLookup.error;
  }

  const routerLookup = await supabase
    .from("routers")
    .select("tenant_id")
    .eq("host", normalizedNas)
    .maybeSingle();

  if (routerLookup.error) {
    throw routerLookup.error;
  }

  return routerLookup.data?.tenant_id ?? null;
}

export async function clearRadiusCredentials(
  supabase: SupabaseClient,
  { tenantId, username }: ClearRadiusCredentialArgs,
) {
  if (tenantId) {
    const tenantRadcheckDelete = await supabase
      .from("radcheck")
      .delete()
      .eq("username", username)
      .eq("tenant_id", tenantId);

    const tenantRadreplyDelete = await supabase
      .from("radreply")
      .delete()
      .eq("username", username)
      .eq("tenant_id", tenantId);

    if (
      !isMissingSchemaError(tenantRadcheckDelete.error) &&
      !isMissingSchemaError(tenantRadreplyDelete.error)
    ) {
      if (tenantRadcheckDelete.error) throw tenantRadcheckDelete.error;
      if (tenantRadreplyDelete.error) throw tenantRadreplyDelete.error;
      return;
    }
  }

  const radcheckDelete = await supabase.from("radcheck").delete().eq("username", username);
  const radreplyDelete = await supabase.from("radreply").delete().eq("username", username);

  if (radcheckDelete.error) throw radcheckDelete.error;
  if (radreplyDelete.error) throw radreplyDelete.error;
}

export async function upsertRadiusCredentials(
  supabase: SupabaseClient,
  { tenantId, username, password, sessionTimeout, expiresAt, speedLimit }: RadiusCredentialArgs,
) {
  await clearRadiusCredentials(supabase, { tenantId, username });

  const normalizedPassword = String(password ?? username).trim() || username;
  const expiration = formatRadiusExpiration(expiresAt);

  const tenantScopedRadcheckRows = [
    { tenant_id: tenantId, username, attribute: "Cleartext-Password", op: ":=", value: normalizedPassword },
    { tenant_id: tenantId, username, attribute: "Session-Timeout", op: ":=", value: String(sessionTimeout) },
    { tenant_id: tenantId, username, attribute: "Expiration", op: ":=", value: expiration },
  ];

  const tenantScopedRadreplyRows: Array<Record<string, string | null>> = [
    { tenant_id: tenantId, username, attribute: "Session-Timeout", op: "=", value: String(sessionTimeout) },
  ];

  if (speedLimit) {
    tenantScopedRadreplyRows.push({
      tenant_id: tenantId,
      username,
      attribute: "Mikrotik-Rate-Limit",
      op: "=",
      value: speedLimit,
    });
  }

  if (tenantId) {
    const tenantRadcheckInsert = await supabase.from("radcheck").insert(tenantScopedRadcheckRows);
    const tenantRadreplyInsert = await supabase.from("radreply").insert(tenantScopedRadreplyRows);

    if (
      !isMissingSchemaError(tenantRadcheckInsert.error) &&
      !isMissingSchemaError(tenantRadreplyInsert.error)
    ) {
      if (tenantRadcheckInsert.error) throw tenantRadcheckInsert.error;
      if (tenantRadreplyInsert.error) throw tenantRadreplyInsert.error;
      return;
    }
  }

  const radcheckRows = tenantScopedRadcheckRows.map(({ username, attribute, op, value }) => ({
    username,
    attribute,
    op,
    value,
  }));
  const radreplyRows = tenantScopedRadreplyRows.map(({ username, attribute, op, value }) => ({
    username,
    attribute,
    op,
    value: String(value ?? ""),
  }));

  const radcheckInsert = await supabase.from("radcheck").insert(radcheckRows);
  const radreplyInsert = await supabase.from("radreply").insert(radreplyRows);

  if (radcheckInsert.error) throw radcheckInsert.error;
  if (radreplyInsert.error) throw radreplyInsert.error;
}

export async function syncRadiusNasForRouters(
  supabase: SupabaseClient,
  { tenantId, sharedSecret, routerId }: SyncRadiusNasArgs,
) {
  const routerQuery = supabase
    .from("routers")
    .select("id, name, site_name, host")
    .eq("tenant_id", tenantId);

  const scopedRouterQuery = routerId ? routerQuery.eq("id", routerId) : routerQuery;
  const routersResult = await scopedRouterQuery;
  if (routersResult.error) {
    throw routersResult.error;
  }

  const routers = (routersResult.data ?? []) as Array<{
    id: string;
    name: string;
    site_name?: string | null;
    host?: string | null;
  }>;

  let synced = 0;
  let skipped = 0;

  for (const router of routers) {
    const nasname = String(router.host ?? "").trim();
    if (!nasname) {
      skipped += 1;
      continue;
    }

    const upsertResult = await supabase
      .from("radius_nas")
      .upsert({
        tenant_id: tenantId,
        router_id: router.id,
        nasname,
        shortname: slugifyShortname(router.name),
        secret: sharedSecret,
        description: router.site_name?.trim() || router.name,
      }, { onConflict: "router_id" });

    if (isMissingSchemaError(upsertResult.error)) {
      return {
        supported: false,
        synced,
        skipped: routers.length,
      };
    }

    if (upsertResult.error) {
      throw upsertResult.error;
    }

    synced += 1;
  }

  return {
    supported: true,
    synced,
    skipped,
  };
}

export async function ensureTenantRadiusSecret(
  supabase: SupabaseClient,
  tenantId: string,
  sharedSecret?: string | null,
) {
  const settingsResult = await supabase
    .from("router_settings")
    .select("id, radius_secret")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  let resolvedSecret = String(sharedSecret ?? settingsResult.data?.radius_secret ?? "").trim();
  if (isPlaceholderRadiusSecret(resolvedSecret)) {
    resolvedSecret = generateRadiusSecret();
  }

  if (settingsResult.data?.id) {
    if (settingsResult.data.radius_secret !== resolvedSecret) {
      const updateResult = await supabase
        .from("router_settings")
        .update({ radius_secret: resolvedSecret })
        .eq("id", settingsResult.data.id);

      if (updateResult.error) {
        throw updateResult.error;
      }
    }
  } else {
    const insertResult = await supabase
      .from("router_settings")
      .insert({
        tenant_id: tenantId,
        radius_secret: resolvedSecret,
      });

    if (insertResult.error) {
      throw insertResult.error;
    }
  }

  return resolvedSecret;
}
