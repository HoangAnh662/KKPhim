// Search catalog type guard for Nuvio/Stremio.
// Loaded before index.js so search results are verified against KKPhim detail data.
// Known types are kept only in the correct catalog. Unknown/failed checks are kept
// in the requested catalog so search never loses a KKPhim result.
const sdk = require("stremio-addon-sdk");
const axios = require("axios");

const API = "https://phimapi.com";
const originalDefineCatalogHandler = sdk.addonBuilder.prototype.defineCatalogHandler;

function actualType(movie) {
  const raw = String(movie?.type || movie?.category || "").toLowerCase();
  if (["series", "tvshows", "phim-bo"].includes(raw)) return "series";
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
        const fallback = { ...meta, type: args.type };
        const slug = String(meta?.id || "").startsWith("kkphim:")
          ? String(meta.id).slice("kkphim:".length).split(":")[0]
          : "";

        // Never drop a search result just because its slug/type cannot be verified.
        if (!slug) return fallback;

        try {
          const detail = await axios.get(`${API}/phim/${encodeURIComponent(slug)}`, {
            timeout: 6000
          });
          const movie = detail.data?.movie;
          const type = actualType(movie);

          // If KKPhim clearly identifies the type, show it only in the correct row.
          if (type) {
            if (type !== args.type) return null;
            return { ...meta, type };
          }

          // Unknown type: keep it instead of risking a missing search result.
          return fallback;
        } catch (error) {
          console.log(`Search type check failed: ${slug} - ${error.message}`);
          // Temporary API/detail failure must not make the movie disappear.
          return fallback;
        }
      })
    );

    return { ...result, metas: checked.filter(Boolean) };
  });
};
