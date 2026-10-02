// Search catalog type guard for Nuvio/Stremio.
// Loaded before index.js so search results are verified against KKPhim detail data.
const sdk = require("stremio-addon-sdk");
const axios = require("axios");

const API = "https://phimapi.com";
const originalDefineCatalogHandler = sdk.addonBuilder.prototype.defineCatalogHandler;

function actualType(movie) {
  const raw = String(movie?.type || movie?.category || "").toLowerCase();
  if (["series", "tvshows", "phim-bo", "hoathinh"].includes(raw)) return "series";
  if (["single", "movie", "phim-le"].includes(raw)) return "movie";
  return null;
}

sdk.addonBuilder.prototype.defineCatalogHandler = function (handler) {
  return originalDefineCatalogHandler.call(this, async (args) => {
    const result = await handler(args);
    const search = args?.extra?.search?.trim();

    if (!search || !Array.isArray(result?.metas) || !result.metas.length) {
      return result;
    }

    const checked = await Promise.all(
      result.metas.map(async meta => {
        const slug = String(meta?.id || "").startsWith("kkphim:")
          ? String(meta.id).slice("kkphim:".length).split(":")[0]
          : "";

        if (!slug) return null;

        try {
          const detail = await axios.get(`${API}/phim/${encodeURIComponent(slug)}`, {
            timeout: 6000
          });
          const movie = detail.data?.movie;
          const type = actualType(movie);

          // Unknown types are excluded instead of being duplicated into both catalogs.
          if (!type || type !== args.type) return null;

          return { ...meta, type };
        } catch (error) {
          console.log(`Search type check failed: ${slug} - ${error.message}`);
          return null;
        }
      })
    );

    const metas = checked.filter(Boolean);
    return { ...result, metas };
  });
};
