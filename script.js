"use strict";

/* =====================================================================
 * Configuration
 * ===================================================================== */
const CONFIG = {
  CLIENT_ID:
    "1054136154776-cc050a50mfmn881rk9cg73cpqvvmg5u6.apps.googleusercontent.com",
  SPREADSHEET_ID: "1Qae82vzscH0dGInOQW6OVXCIuS5AJLw5FHbXVP9JkIs",
  RANGE: "A:F", // Name, Photo, Age, Country, Interest, Net Worth (first sheet)
  SCOPES: "https://www.googleapis.com/auth/userinfo.profile",
  RED_BELOW: 100000, // < $100K  -> red
  GREEN_ABOVE: 200000, // > $200K  -> green, otherwise orange
};

const LAYOUT = {
  camera: { fov: 40, z: 3200 },
  table: { cols: 20, rows: 10, stepX: 160, stepY: 200 }, // 20 x 10
  sphere: { radius: 1000 },
  helix: { radius: 900, angleStep: 0.25, stepY: 16 }, // double helix
  grid: { cols: 10, rows: 4, layers: 5, stepX: 220, stepY: 260, stepZ: 400 }, // 10 x 4 x 5 (= 5x4x10)
};

const PLACEHOLDER_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<rect width="100" height="100" fill="#333"/>' +
      '<circle cx="50" cy="38" r="16" fill="#777"/>' +
      '<rect x="22" y="60" width="56" height="30" rx="14" fill="#777"/></svg>',
  );

/* =====================================================================
 * State
 * ===================================================================== */
let scene, camera, renderer, controls;
let objects = [];
let targets = { table: [], sphere: [], helix: [], grid: [] };
let tokenClient = null;
let accessToken = null;
let currentLayout = "table";

const $ = (id) => document.getElementById(id);

/* =====================================================================
 * Boot
 * ===================================================================== */
initScene();
initUi();
waitForGoogle(initAuth);

/* =====================================================================
 * Scene
 * ===================================================================== */
function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    LAYOUT.camera.fov,
    window.innerWidth / window.innerHeight,
    1,
    10000,
  );
  camera.position.z = LAYOUT.camera.z;

  renderer = new THREE.CSS3DRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 500;
  controls.maxDistance = 6000;

  window.addEventListener("resize", onResize);
  animate();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  controls.update();
  renderer.render(scene, camera);
}

/* =====================================================================
 * UI wiring
 * ===================================================================== */
function initUi() {
  ["table", "sphere", "helix", "grid"].forEach((name) => {
    $(name).addEventListener("click", () => transform(name, 2000));
  });
  $("signin").addEventListener("click", signIn);
  $("signout").addEventListener("click", signOut);
}

function setStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function showApp(show) {
  $("login").classList.toggle("hidden", show);
  $("app").classList.toggle("hidden", !show);
}

/* =====================================================================
 * Google login (Google Identity Services, OAuth token flow)
 * ===================================================================== */
function waitForGoogle(callback) {
  if (window.google && google.accounts && google.accounts.oauth2) {
    callback();
  } else {
    setTimeout(() => waitForGoogle(callback), 100);
  }
}

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: onTokenResponse,
    error_callback: (err) =>
      showLoginError(
        "Sign-in was cancelled or blocked (" + (err.type || "error") + ").",
      ),
  });
}

function signIn() {
  $("login-error").textContent = "";
  if (!tokenClient) {
    showLoginError(
      "Google sign-in is still loading. Please try again in a moment.",
    );
    return;
  }
  tokenClient.requestAccessToken({ prompt: "select_account" });
}

function showLoginError(message) {
  $("login-error").textContent = message;
}

async function onTokenResponse(response) {
  if (response.error || !response.access_token) {
    showLoginError(
      "Sign-in failed: " +
        (response.error_description || response.error || "no token received"),
    );
    return;
  }
  accessToken = response.access_token;
  showApp(true);
  loadUserName();
  setStatus("Loading data...");

  try {
    const people = await loadPeople();
    if (people.length === 0) throw new Error("The sheet contains no rows.");
    setStatus("");
    buildTiles(people);
    transform("table", 2000);
  } catch (err) {
    console.error(err);
    setStatus("Could not load data: " + err.message, true);
  }
}

async function loadUserName() {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (res.ok) {
      const info = await res.json();
      $("user-name").textContent = info.name || "";
    }
  } catch (_) {
    /* cosmetic only */
  }
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  clearTiles();
  setStatus("");
  $("user-name").textContent = "";
  showApp(false);
}

/* =====================================================================
 * Data loading
 * ===================================================================== */
async function loadPeople() {
  try {
    return await fetchFromSheetsApi();
  } catch (apiError) {
    console.warn("Sheets API failed, trying public link:", apiError.message);
    try {
      return await fetchFromPublicSheet();
    } catch (_) {
      throw new Error(apiError.message);
    }
  }
}

// Primary: Sheets API with the signed-in user's token.
async function fetchFromSheetsApi() {
  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    CONFIG.SPREADSHEET_ID +
    "/values/" +
    encodeURIComponent(CONFIG.RANGE) +
    "?valueRenderOption=FORMATTED_VALUE";
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        "This Google account does not have access to the sheet (HTTP " +
          res.status +
          ").",
      );
    }
    throw new Error("Sheets API error (HTTP " + res.status + ").");
  }
  const json = await res.json();
  const rows = (json.values || []).slice(1); // drop header row
  return rowsToPeople(rows);
}

// Fallback: works only if the sheet is shared as "Anyone with the link".
async function fetchFromPublicSheet() {
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    CONFIG.SPREADSHEET_ID +
    "/gviz/tq?tqx=out:json&headers=1";
  const res = await fetch(url);
  const text = await res.text();
  const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error("Sheet is not public.");
  const table = JSON.parse(match[1]).table;
  const rows = table.rows.map((row) =>
    (row.c || []).map((cell) =>
      cell ? (cell.f != null ? cell.f : cell.v) : "",
    ),
  );
  return rowsToPeople(rows);
}

function rowsToPeople(rows) {
  return rows
    .map((r) => ({
      name: clean(r[0]),
      photo: clean(r[1]),
      age: clean(r[2]),
      country: clean(r[3]),
      interest: clean(r[4]),
      netWorth: clean(r[5]),
    }))
    .filter((p) => p.name !== "");
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

/* =====================================================================
 * Net worth -> colour tier
 * ===================================================================== */
function parseWorth(text) {
  const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function tierFor(worthText) {
  const worth = parseWorth(worthText);
  if (worth < CONFIG.RED_BELOW) return "red";
  if (worth > CONFIG.GREEN_ABOVE) return "green";
  return "orange";
}

/* =====================================================================
 * Tiles
 * ===================================================================== */
function clearTiles() {
  TWEEN.removeAll();
  objects.forEach((obj) => {
    scene.remove(obj);
    if (obj.element && obj.element.parentNode)
      obj.element.parentNode.removeChild(obj.element);
  });
  objects = [];
  targets = { table: [], sphere: [], helix: [], grid: [] };
}

function makeTileElement(person) {
  const el = document.createElement("div");
  el.className = "element " + tierFor(person.netWorth);
  el.title = person.name + " - " + person.netWorth;

  const country = document.createElement("div");
  country.className = "country";
  country.textContent = person.country;

  const age = document.createElement("div");
  age.className = "age";
  age.textContent = person.age;

  const img = document.createElement("img");
  img.alt = person.name;
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    img.onerror = null;
    img.src = PLACEHOLDER_PHOTO;
  };
  img.src = person.photo || PLACEHOLDER_PHOTO;

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = person.name;

  const interest = document.createElement("div");
  interest.className = "interest";
  interest.textContent = person.interest;

  el.append(country, age, img, name, interest);
  return el;
}

function buildTiles(people) {
  clearTiles();

  people.forEach((person) => {
    const object = new THREE.CSS3DObject(makeTileElement(person));
    object.position.set(
      Math.random() * 4000 - 2000,
      Math.random() * 4000 - 2000,
      Math.random() * 4000 - 2000,
    );
    scene.add(object);
    objects.push(object);
  });

  computeTargets(people.length);
}

/* =====================================================================
 * Layout maths
 * ===================================================================== */
function computeTargets(count) {
  const t = LAYOUT.table,
    s = LAYOUT.sphere,
    h = LAYOUT.helix,
    g = LAYOUT.grid;

  for (let i = 0; i < count; i++) {
    // --- TABLE: 20 columns x 10 rows, centred on the origin ---
    const table = new THREE.Object3D();
    table.position.x = ((i % t.cols) - (t.cols - 1) / 2) * t.stepX;
    table.position.y =
      ((t.rows - 1) / 2 - (Math.floor(i / t.cols) % t.rows)) * t.stepY;
    targets.table.push(table);

    // --- SPHERE: evenly spread points on a sphere, facing outwards ---
    const sphere = new THREE.Object3D();
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    sphere.position.setFromSphericalCoords(s.radius, phi, theta);
    sphere.lookAt(sphere.position.clone().multiplyScalar(2));
    targets.sphere.push(sphere);

    // --- DOUBLE HELIX: even tiles = strand A, odd tiles = strand B (offset by PI) ---
    const helix = new THREE.Object3D();
    const strand = i % 2;
    const k = Math.floor(i / 2); // position along the strand
    const strandLength = Math.ceil(count / 2);
    const angle = k * h.angleStep + strand * Math.PI;
    const y = ((strandLength - 1) / 2 - k) * h.stepY;
    helix.position.setFromCylindricalCoords(h.radius, angle, y);
    helix.lookAt(
      new THREE.Vector3(
        helix.position.x * 2,
        helix.position.y,
        helix.position.z * 2,
      ),
    );
    targets.helix.push(helix);

    // --- GRID: 10 (x) by 4 (y) by 5 (z), centred on the origin ---
    const grid = new THREE.Object3D();
    const col = i % g.cols;
    const row = Math.floor(i / g.cols) % g.rows;
    const layer = Math.floor(i / (g.cols * g.rows)) % g.layers;
    grid.position.x = (col - (g.cols - 1) / 2) * g.stepX;
    grid.position.y = ((g.rows - 1) / 2 - row) * g.stepY;
    grid.position.z = (layer - (g.layers - 1) / 2) * g.stepZ;
    targets.grid.push(grid);
  }
}

/* =====================================================================
 * Transitions
 * ===================================================================== */
function transform(layoutName, duration) {
  currentLayout = layoutName;
  ["table", "sphere", "helix", "grid"].forEach((name) =>
    $(name).classList.toggle("active", name === layoutName),
  );

  const targetArray = targets[layoutName];
  if (!targetArray || targetArray.length === 0) return;

  TWEEN.removeAll();
  objects.forEach((obj, i) => {
    const target = targetArray[i];
    if (!target) return;

    new TWEEN.Tween(obj.position)
      .to(
        { x: target.position.x, y: target.position.y, z: target.position.z },
        Math.random() * duration + duration,
      )
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();

    new TWEEN.Tween(obj.rotation)
      .to(
        { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z },
        Math.random() * duration + duration,
      )
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
  });
}
