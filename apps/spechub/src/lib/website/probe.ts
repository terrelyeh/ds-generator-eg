import { hasCredentials, type SiteConfig } from "./sites";
import { wpGet, type WpResult } from "./wp-client";

/**
 * What one site/environment lets this process read. Shared by the
 * `/api/website/probe` route and local runs, so both answer with the same
 * checks.
 */

type Json = Record<string, unknown>;

function summary(result: WpResult<unknown>) {
  return {
    status: result.status,
    kind: result.kind,
    ms: result.ms,
    challenged: result.challenged,
    redirect: result.redirect,
  };
}

function firstAcf(result: WpResult<unknown>): Json | null {
  if (!Array.isArray(result.data) || result.data.length === 0) return null;
  const acf = (result.data[0] as Json).acf;
  return acf && typeof acf === "object" && !Array.isArray(acf) ? (acf as Json) : null;
}

export async function probeSite(config: SiteConfig) {
  if (!config.baseUrl) {
    return { site: config.code, env: config.env, configured: false };
  }
  const authed = hasCredentials(config);
  const [root, products, files, datasheets, me, drafts] = await Promise.all([
    wpGet(config, "/wp-json/"),
    wpGet(config, "/wp-json/wp/v2/product_model?per_page=1&_fields=id,acf"),
    wpGet(config, "/wp-json/wp/v2/file?per_page=1&_fields=id"),
    wpGet(config, "/wp-json/wp/v2/file?search=datasheet&per_page=20&_fields=id,acf"),
    authed ? wpGet<Json>(config, "/wp-json/wp/v2/users/me?context=edit&_fields=roles,capabilities", { auth: true }) : null,
    authed
      ? wpGet(config, "/wp-json/wp/v2/product_model?per_page=1&status=draft&context=edit&_fields=id,status", { auth: true })
      : null,
  ]);

  const productAcf = firstAcf(products);
  const attachments = (Array.isArray(datasheets.data) ? datasheets.data : [])
    .map((record) => (record as Json).acf)
    .map((acf) => (acf && typeof acf === "object" ? (acf as Json).download_link : null))
    .filter((link): link is Json => Boolean(link) && typeof link === "object");
  const capabilities = (me?.data?.capabilities ?? {}) as Record<string, boolean>;

  return {
    site: config.code,
    env: config.env,
    configured: true,
    host: new URL(config.baseUrl).host,
    credentials: authed,
    reachable: summary(root),
    siteName: root.kind === "json" ? ((root.data as Json | null)?.name ?? null) : null,
    publicProducts: {
      ...summary(products),
      total: products.total,
      acfVisible: productAcf !== null && Object.keys(productAcf).length > 0,
      productFilesVisible: productAcf !== null && "product_files" in productAcf,
    },
    publicFiles: { ...summary(files), total: files.total },
    publicDatasheets: {
      ...summary(datasheets),
      sampled: Array.isArray(datasheets.data) ? datasheets.data.length : 0,
      withAttachment: attachments.length,
      attachmentFields: attachments[0] ? Object.keys(attachments[0]).sort() : [],
    },
    account: me
      ? {
          ...summary(me),
          roles: Array.isArray(me.data?.roles) ? me.data?.roles : null,
          canReadOthersDrafts: Boolean(capabilities.edit_others_posts),
          canUploadFiles: Boolean(capabilities.upload_files),
        }
      : null,
    draftsQuery: drafts ? summary(drafts) : null,
  };
}
