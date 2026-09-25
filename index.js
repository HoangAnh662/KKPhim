const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");
const API = "https://phimapi.com";
const GENRES = {
  "hanh-dong": "Hành động",
  "tinh-cam": "Tình cảm",
  "kinh-di": "Kinh dị",
  "vien-tuong": "Viễn tưởng",
  "hai-huoc": "Hài hước",
  "hinh-su": "Hình sự",
  "chien-tranh": "Chiến tranh",
  "phieu-luu": "Phiêu lưu",
  "hoat-hinh": "Hoạt hình",
  "gia-dinh": "Gia đình",
  "tai-lieu": "Tài liệu",
  "than-thoai": "Thần thoại"
};
const manifest = {
  id: "org.kkphim.stremio",
  version: "1.0.0",
  name: "KKPhim",
  description: "Kho phim KKPhim – Phim Lẻ, Phim Bộ, Thuyết Minh và Vietsub.",
logo: "https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/logo.png",
  stremioAddonsConfig: {
  issuer: "https://stremio-addons.net",
  signature: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Tq6L-iuX2mORRdfcq0gB0A.rIyAX0bP5vA3UCdMnoEFDRSqLTN6WaPgTrPPGtQqQs4DmIRYf2QfF4eSa9wd5x_deZ7TZqphcVhGnRoYUQQbwCbo1wh6WKiREbtq2l8cdFvkUWKmPokrw0ZXhN5wfFVb.W-nbuM8oysDzOvLhewzevw"
},
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],

behaviorHints: {
  configurable: true
},

catalogs: [
  {
    type: "movie",
    id: "kkphim-movie",
    name: "KKPhim - Phim lẻ",
    extra: [
  { name: "search", isRequired: false },
  { name: "skip", isRequired: false }
]
  },
  {
    type: "series",
    id: "kkphim-series",
    name: "KKPhim - Phim bộ",
    extra: [
  { name: "search", isRequired: false },
  { name: "skip", isRequired: false }
]
  }
],

  idPrefixes: ["kkphim:", "tt"]
};

const builder = new addonBuilder(manifest);


// =========================
// CATALOG
// =========================

builder.defineCatalogHandler(async ({
  type, id, extra }) => {
  try {
    const search = extra?.search?.trim();
// =====================
// CATALOG THỂ LOẠI
// =====================
if (id?.startsWith("genre-")) {
  const genre = id.replace("genre-", "");

  if (!GENRES[genre]) {
    return { metas: [] };
  }

  const skip = Number(extra?.skip || 0);
  const ITEMS_PER_PAGE = 24;
  const page =
    Math.floor(skip / ITEMS_PER_PAGE) + 1;

  const response = await axios.get(
    `${API}/v1/api/the-loai/${genre}`,
    { params: { page } }
  );

  const items =
    response.data?.data?.items ||
    response.data?.items ||
    [];

  const metas = items.map(movie => ({
    id: `kkphim:${movie.slug}`,
    type: movie.type === "series"
      ? "series"
      : "movie",
    name: movie.name,
    poster:
      movie.poster_url ||
      `https://phimimg.com/${movie.poster_url || ""}`,
    description: movie.origin_name || ""
  }));

  return { metas };
}
    // =========================
    // SEARCH
    // =========================
    if (search) {
      const response = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: {
          keyword: search,
          page: 1
        }
      });

      const items =
        response.data?.data?.items ||
        response.data?.items ||
        [];

      const metas = items.map(movie => ({
        id: `kkphim:${movie.slug}`,
        type,
        name: movie.name,
        poster:
          movie.poster_url ||
          `https://phimimg.com/${movie.poster_url || ""}`,
        description: movie.origin_name || ""
      }));

      return { metas };
    }

    // =========================
    // CATALOG BÌNH THƯỜNG
    // =========================
    const endpoint =
  type === "series"
    ? `${API}/danh-sach/phim-bo`
    : `${API}/danh-sach/phim-le`;

// KKPhim hiện trả khoảng 24 phim / trang
const ITEMS_PER_PAGE = 24;

const skip = Number(extra?.skip || 0);

// Xác định trang KKPhim cần lấy
const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;

const response = await axios.get(endpoint, {
  params: { page }
});

const items = response.data?.items || [];

// Loại phim trùng slug
const uniqueItems = Array.from(
  new Map(
    items.map(movie => [movie.slug, movie])
  ).values()
);

const metas = uniqueItems.map(movie => ({
  id: `kkphim:${movie.slug}`,
  type,
  name: movie.name,
  poster:
    movie.poster_url ||
    `https://phimimg.com/${movie.poster_url || ""}`,
  description: movie.origin_name || ""
}));

    return { metas };

  } catch (error) {
    console.error("Catalog error:", error.message);
    return { metas: [] };
  }
});

// =========================
// META
// =========================

builder.defineMetaHandler(async ({ type, id }) => {

  try {

    const slug = id.replace("kkphim:", "");

    const response = await axios.get(
      `${API}/phim/${slug}`
    );

    const movie = response.data.movie;

    if (!movie) {
      return { meta: null };
    }

    const meta = {
      id,
      type,
      name: movie.name,
      poster: movie.poster_url,
      background: movie.thumb_url,
      description: movie.content || "",
      releaseInfo: movie.year
        ? String(movie.year)
        : undefined
    };


    // SERIES / PHIM BỘ

    if (type === "series") {

      const episodes = [];

      const servers = response.data.episodes || [];

      if (servers.length > 0) {

        servers[0].server_data.forEach((ep, index) => {

          episodes.push({
            id: `${id}:${index}`,
            title: ep.name || `Tập ${index + 1}`,
            thumbnail: meta.background || meta.poster,
            season: 1,
            episode: index + 1
          });

        });

      }

      meta.videos = episodes;

    }

    return { meta };

  } catch (error) {

    console.error("Meta error:", error.message);

    return { meta: null };

  }

});


// =========================
// STREAM
// =========================

builder.defineStreamHandler(async ({ id }) => {
  try {
    let response;
    let episodeIndex = 0;

    // =====================================
    // PHIM MỞ TỪ CATALOG KKPHIM
    // =====================================
    if (id.startsWith("kkphim:")) {
      const parts = id.split(":");
      const slug = parts[1];

      episodeIndex =
        parts.length >= 3
          ? Number(parts[2])
          : 0;

      response = await axios.get(
        `${API}/phim/${slug}`
      );
    }

    // =====================================
    // PHIM TỪ TÌM KIẾM STREMIO / IMDB
    // =====================================
    else if (id.startsWith("tt")) {
      const parts = id.split(":");
      const imdbId = parts[0];

      // Nếu là series, Stremio thường gửi:
      // tt1234567:season:episode
      if (parts.length >= 3) {
        const episodeNumber = Number(parts[2]);

        if (!isNaN(episodeNumber) && episodeNumber > 0) {
          episodeIndex = episodeNumber - 1;
        }
      }

      response = await axios.get(
        `${API}/imdb/title/${imdbId}`
      );
    }

    else {
      return { streams: [] };
    }

    const servers =
      response.data.episodes || [];

    if (!servers.length) {
      return { streams: [] };
    }
const movieName =
  response.data.movie?.name ||
  response.data.movie?.origin_name ||
  "KKPhim";
    const movieYear = response.data.movie?.year || "";
    const quality =
  response.data.movie?.quality || "";

const displayName =
  movieYear ? `${movieName} • ${movieYear}` : movieName;
    const streams = [];

for (const server of servers) {
  const episode = server.server_data?.[episodeIndex];

  if (!episode) continue;

  const serverName =
  (server.server_name || "Server")
    .replace(/Lồng Tiếng/gi, "Thuyết Minh");
  
const qualityRaw = response.data.movie?.quality || "";

let resolution = "";

if (/4K|2160/i.test(qualityRaw)) {
  resolution = "4K";
} else if (/FHD|1080/i.test(qualityRaw)) {
  resolution = "1080p";
} else if (/HD|720/i.test(qualityRaw)) {
  resolution = "720p";
} else if (/480/i.test(qualityRaw)) {
  resolution = "480p";
}
  if (episode.link_m3u8) {
    streams.push({
      name: displayName,
      title: `KKPhim • ${serverName}${resolution ? ` • ${resolution}` : ""}`,
      url: episode.link_m3u8
    });
  }
}
return { streams };

  } catch (error) {
    console.error(
      "Stream error:",
      error.response?.status || "",
      error.message
    );

    return { streams: [] };
  }
});


// =========================
// START SERVER
// =========================

const port = process.env.PORT || 7000;

const app = express();

// =====================
// TRANG CẤU HÌNH KKPHIM
// =====================

app.get("/configure", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Cấu hình KKPhim</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: #fff;

  background:
    linear-gradient(
      rgba(7, 5, 20, 0.78),
      rgba(7, 5, 20, 0.94)
    ),
    url("https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/background.jpg");

  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

.page {
  min-height: 100vh;
  padding: 35px 16px;
  display: flex;
  justify-content: center;
}

.container {
  width: 100%;
  max-width: 850px;
}

.logo {
  text-align: center;
  margin-bottom: 18px;
}

.logo img {
  width: 105px;
  height: 105px;
  border-radius: 22px;
}

.panel {
  background: rgba(15, 10, 35, 0.88);
  border: 1px solid #873cff;
  border-radius: 25px;
  padding: 25px;
  backdrop-filter: blur(12px);
  box-shadow: 0 0 40px rgba(122, 50, 255, .22);
}

h1 {
  text-align: center;
  margin: 0 0 8px;
  font-size: 30px;
}

.subtitle {
  text-align: center;
  color: #c8c2dc;
  margin-bottom: 28px;
  line-height: 1.5;
}

.section-title {
  color: #c75cff;
  font-size: 20px;
  font-weight: bold;
  margin: 20px 0 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.option {
  background: rgba(35, 28, 62, .85);
  border: 1px solid rgba(157, 80, 255, .4);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.option:hover {
  border-color: #b44cff;
}

.option input {
  width: 21px;
  height: 21px;
  accent-color: #a73cff;
}

.option span {
  font-size: 16px;
}

.default {
  border-color: #963cff;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,.13);
  margin: 25px 0;
}

.genre-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.select-all {
  border: 1px solid #8242e8;
  border-radius: 10px;
  background: rgba(80,40,130,.35);
  color: white;
  padding: 9px 13px;
  cursor: pointer;
}

.install {
  width: 100%;
  margin-top: 28px;
  padding: 17px;
  border: 0;
  border-radius: 14px;

  background: linear-gradient(
    90deg,
    #bd2cff,
    #5c3cff
  );

  color: white;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 8px 25px rgba(129,55,255,.35);
}

.note {
  text-align: center;
  color: #aaa2bf;
  margin-top: 14px;
  font-size: 13px;
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .panel {
    padding: 18px;
  }

  h1 {
    font-size: 25px;
  }
}
</style>
</head>

<body>

<div class="page">
<div class="container">

  <div class="logo">
    <img
      src="https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/logo.png"
      alt="KKPhim"
    >
  </div>

  <div class="panel">

    <h1>⚙️ Cấu hình KKPhim</h1>

    <div class="subtitle">
      Chọn các danh mục bạn muốn hiển thị trong Stremio.<br>
      Mặc định chỉ có Phim lẻ và Phim bộ.
    </div>

    <div class="section-title">
      Danh mục cơ bản
    </div>

    <div class="grid">

      <label class="option default">
        <input type="checkbox" checked disabled>
        <span>🎞️ Phim lẻ</span>
      </label>

      <label class="option default">
        <input type="checkbox" checked disabled>
        <span>🎬 Phim bộ</span>
      </label>

    </div>

    <div class="divider"></div>

    <div class="genre-head">

      <div class="section-title">
        Thể loại tùy chọn
      </div>

      <button
        class="select-all"
        type="button"
        onclick="toggleAll()">
        ✓ Chọn tất cả
      </button>

    </div>

    <div class="grid" id="genres">

      <label class="option">
        <input type="checkbox" value="hanh-dong">
        <span>🔥 Hành động</span>
      </label>

      <label class="option">
        <input type="checkbox" value="tinh-cam">
        <span>❤️ Tình cảm</span>
      </label>

      <label class="option">
        <input type="checkbox" value="kinh-di">
        <span>👻 Kinh dị</span>
      </label>

      <label class="option">
        <input type="checkbox" value="vien-tuong">
        <span>🪐 Viễn tưởng</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hai-huoc">
        <span>😄 Hài hước</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hinh-su">
        <span>🛡️ Hình sự</span>
      </label>

      <label class="option">
        <input type="checkbox" value="chien-tranh">
        <span>🪖 Chiến tranh</span>
      </label>

      <label class="option">
        <input type="checkbox" value="phieu-luu">
        <span>🧭 Phiêu lưu</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hoat-hinh">
        <span>🐻 Hoạt hình</span>
      </label>

      <label class="option">
        <input type="checkbox" value="gia-dinh">
        <span>🏠 Gia đình</span>
      </label>

      <label class="option">
        <input type="checkbox" value="tai-lieu">
        <span>📄 Tài liệu</span>
      </label>

      <label class="option">
        <input type="checkbox" value="than-thoai">
        <span>🔱 Thần thoại</span>
      </label>

    </div>

    <button
      class="install"
      type="button"
      onclick="installAddon()">
      🧩 CÀI VÀO STREMIO →
    </button>

    <div class="note">
      Sau khi chọn xong, nhấn nút để cài addon vào Stremio.
    </div>

  </div>
</div>
</div>

<script>
let allSelected = false;

function toggleAll() {
  allSelected = !allSelected;

  document
    .querySelectorAll("#genres input")
    .forEach(input => {
      input.checked = allSelected;
    });
}

function installAddon() {
  const selected = Array.from(
    document.querySelectorAll("#genres input:checked")
  ).map(input => input.value);

  if (selected.length === 0) {
    window.location.href =
      "stremio://kkphim-stremio-addon-ymoc.onrender.com/manifest.json";
    return;
  }

  const genres = selected.join(",");

  window.location.href =
    "stremio://kkphim-stremio-addon-ymoc.onrender.com/config/" +
    genres +
    "/manifest.json";
}
</script>

</body>
</html>
  `);
});
// =====================
// MANIFEST THEO CẤU HÌNH
// =====================

app.get("/config/:genres/manifest.json", (req, res) => {
  const selectedGenres = req.params.genres
    .split(",")
    .filter(genre => GENRES[genre]);

  const customManifest = {
    ...manifest,

    catalogs: [
      ...manifest.catalogs,

      ...selectedGenres.map(genre => ({
        type: "movie",
        id: `genre-${genre}`,
        name: `KKPhim - ${GENRES[genre]}`,
        extra: [
          { name: "skip", isRequired: false }
        ]
      }))
    ]
  };

  res.json(customManifest);
});
// Các route catalog / meta / stream hiện tại
app.use("/", getRouter(builder.getInterface()));

app.listen(port, () => {
console.log(`KKPhim addon running on port ${port}`);
});
