// Search catalog type guard for Nuvio/Stremio.
// Loaded before index.js so search results are verified against KKPhim detail data.
// Known types are kept only in the correct catalog. Unknown/failed checks are kept
// using the result type when detail verification is unavailable.
const axios = require("axios");

const API = "https://phimapi.com";

function actualType(movie) {
  const raw = String(movie?.type || movie?.category || "").toLowerCase();
  if (["series", "tvshows", "phim-bo"].includes(raw)) return "series";
  if (["single", "movie", "phim-le"].includes(raw)) return "movie";
  return null;
}

module.exports = async function filterSearchResult(args, result) {
    const search = args?.extra?.search?.trim();

    if (!search || !Array.isArray(result?.metas) || !result.metas.length) {
      return result;
    }

    const checked = await Promise.all(
      result.metas.map(async meta => {
        // Preserve a known result type if the detail API is unavailable.
        // Never relabel a known movie as series (or the reverse).
        const fallback = meta.type === "movie" || meta.type === "series"
          ? (meta.type === args.type ? meta : null)
          : { ...meta, type: args.type };
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

          // Unknown detail type: preserve the search result type.
          return fallback;
        } catch (error) {
          console.log(`Search type check failed: ${slug} - ${error.message}`);
          // API failure must not move a known result into the wrong catalog.
          return fallback;
        }
      })
    );

    return { ...result, metas: checked.filter(Boolean) };
};
