/* 行きたい観光地リスト — localStorage だけで動く単一ページアプリ
   検索は OpenStreetMap Nominatim + 内蔵プリセット、地図は Leaflet + OSM タイル */
(() => {
  'use strict';

  const STORAGE_KEY = 'travel-wishlist.items.v1';
  const CATEGORY_KEY = 'travel-wishlist.categories.v1';
  const CATEGORY_REV_KEY = 'travel-wishlist.categories.rev';
  const THEME_KEY = 'travel-wishlist.theme';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const NOMINATIM_LOOKUP = 'https://nominatim.openstreetmap.org/lookup';
  /* Photon は OSM を入力補完向けに索引しなおした検索。部分一致・打ち間違いに強い */
  const PHOTON = 'https://photon.komoot.io/api/';

  /* 利用人数カウンタ（Abacus）。端末ごとに初回だけ +1 し、以降は読むだけ。
     登録した観光地の情報は一切送らない */
  const COUNTER_BASE = 'https://abacus.jasoncameron.dev';
  const COUNTER_NS = 'tw-kuru77-4a7e2b91';
  const COUNTED_KEY = 'travel-wishlist.counted.v1';
  const IS_DEV = /^(localhost|127.0.0.1|[::1])$/.test(location.hostname) || location.protocol === 'file:';
  const COUNTER_KEY = IS_DEV ? 'users-dev' : 'users';

  const FALLBACK_CATEGORY = 'other';

  const DEFAULT_CATEGORIES = [
    { value: 'heritage', label: '遺跡・史跡', icon: '🏛️' },
    { value: 'monument', label: '建造物・名所', icon: '🗿' },
    { value: 'temple',   label: '寺社・教会',   icon: '⛩️' },
    { value: 'castle',   label: '城・宮殿',     icon: '🏰' },
    { value: 'museum',   label: '博物館・美術館', icon: '🖼️' },
    { value: 'nature',   label: '自然・絶景',   icon: '🏔️' },
    { value: 'park',     label: '公園・庭園',   icon: '🌳' },
    { value: 'onsen',    label: '温泉',         icon: '♨️' },
    { value: 'gourmet',  label: 'グルメ',       icon: '🍽️' },
    { value: 'activity', label: '体験・レジャー', icon: '🎡' },
    { value: 'shop',     label: 'ショップ・市場', icon: '🛍️' },
    { value: 'city',     label: '街・エリア',   icon: '🏙️' },
    { value: 'other',    label: 'その他',       icon: '📍' },
  ];

  /* 分類の既定値を増やしたときに上げる。既存利用者にも新しい分類を届ける */
  const CATEGORY_REV = 2;

  /* 分類の編集で使うアイコン候補 */
  const EMOJI_CHOICES = [
    '📍', '🏛️', '🗿', '⛩️', '🏰', '🖼️', '🏔️', '🌳', '🏙️', '🗺️',
    '⛰️', '🌋', '🏝️', '🏖️', '🌊', '💧', '🌸', '🍁', '❄️', '🌌',
    '⛪', '🕌', '🕍', '🛕', '🗼', '🌉', '🎡', '🎢', '🎭', '🎨',
    '🚂', '🚢', '✈️', '🍜', '🍣', '☕', '🍷', '♨️', '🏨', '🛍️',
  ];

  const STATUSES = [
    { value: 'want',    label: '行きたい' },
    { value: 'planned', label: '計画中' },
    { value: 'visited', label: '訪問済' },
  ];

  const PRIORITIES = [
    { value: 'high', label: '高', weight: 0 },
    { value: 'mid',  label: '中', weight: 1 },
    { value: 'low',  label: '低', weight: 2 },
  ];

  /* 日本の地方区分。エリア別ページと、トップページの絞り込みに使う */
  const REGIONS = [
    { key: 'hokkaido', label: '北海道', prefs: ['北海道'] },
    { key: 'tohoku',   label: '東北',   prefs: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
    { key: 'kanto',    label: '関東',   prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
    { key: 'chubu',    label: '中部',   prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
    { key: 'kinki',    label: '近畿',   prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
    { key: 'chugoku',  label: '中国',   prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
    { key: 'shikoku',  label: '四国',   prefs: ['徳島県', '香川県', '愛媛県', '高知県'] },
    { key: 'kyushu',   label: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
  ];
  const ALL_PREFS = REGIONS.flatMap((r) => r.prefs);
  const PREF_RE = new RegExp(ALL_PREFS.join('|'));
  const PREF_INDEX = new Map(ALL_PREFS.map((p, i) => [p, i]));
  const PREF_REGION = new Map();
  REGIONS.forEach((r) => r.prefs.forEach((p) => PREF_REGION.set(p, r)));
  const REGION_INDEX = new Map(REGIONS.map((r, i) => [r.key, i]));
  const OVERSEAS = { key: 'overseas', label: '海外' };

  /* 編集で書き換わるので、既定値は必ず複製して渡す */
  const defaultCategories = () => DEFAULT_CATEGORIES.map((c) => ({ ...c }));

  const $ = (sel) => document.querySelector(sel);

  const el = {
    list: $('#list'),
    empty: $('#empty'),
    filterText: $('#filterText'),
    filterStatus: $('#filterStatus'),
    filterCategory: $('#filterCategory'),
    filterHeritage: $('#filterHeritage'),
    sortBy: $('#sortBy'),
    statTotal: $('#statTotal'),
    statHeritage: $('#statHeritage'),
    statVisited: $('#statVisited'),
    statCountries: $('#statCountries'),
    tabHome: $('#tabHome'),
    tabList: $('#tabList'),
    tabArea: $('#tabArea'),
    tabMap: $('#tabMap'),
    homeView: $('#homeView'),
    listView: $('#listView'),
    areaView: $('#areaView'),
    mapView: $('#mapView'),
    quickGrid: $('#quickGrid'),
    homeUpcoming: $('#homeUpcoming'),
    homeUpcomingSec: $('#homeUpcomingSec'),
    homePriority: $('#homePriority'),
    homePrioritySec: $('#homePrioritySec'),
    homeAreas: $('#homeAreas'),
    homeAreaSec: $('#homeAreaSec'),
    homeCats: $('#homeCats'),
    homeCatSec: $('#homeCatSec'),
    homeRecent: $('#homeRecent'),
    homeRecentSec: $('#homeRecentSec'),
    homeEmpty: $('#homeEmpty'),
    userCount: $('#userCount'),
    logo: document.querySelector('.logo'),
    devBadge: $('#devBadge'),
    devPresetBtn: $('#devPresetBtn'),
    devDialog: $('#devDialog'),
    devSummary: $('#devSummary'),
    devFilter: $('#devFilter'),
    devList: $('#devList'),
    devMore: $('#devMore'),
    devNewBtn: $('#devNewBtn'),
    devCloseBtn: $('#devCloseBtn'),
    devExportBtn: $('#devExportBtn'),
    devCopyBtn: $('#devCopyBtn'),
    devOverlayExportBtn: $('#devOverlayExportBtn'),
    devOverlayImportBtn: $('#devOverlayImportBtn'),
    devImportFile: $('#devImportFile'),
    devResetBtn: $('#devResetBtn'),
    devExitBtn: $('#devExitBtn'),
    presetDialog: $('#presetDialog'),
    presetForm: $('#presetForm'),
    presetTitle: $('#presetTitle'),
    presetCancelBtn: $('#presetCancelBtn'),
    presetSearch: $('#presetSearch'),
    presetSuggest: $('#presetSuggest'),
    presetSpinner: $('#presetSpinner'),
    pName: $('#pName'),
    pKeys: $('#pKeys'),
    pArea: $('#pArea'),
    pCat: $('#pCat'),
    pOsm: $('#pOsm'),
    pWhc: $('#pWhc'),
    pLat: $('#pLat'),
    pLng: $('#pLng'),
    pDeleteBtn: $('#pDeleteBtn'),
    pRevertBtn: $('#pRevertBtn'),
    statBtnTotal: $('#statBtnTotal'),
    statBtnHeritage: $('#statBtnHeritage'),
    statBtnVisited: $('#statBtnVisited'),
    statBtnAreas: $('#statBtnAreas'),
    areaGroupBy: $('#areaGroupBy'),
    areaHideVisited: $('#areaHideVisited'),
    areaList: $('#areaList'),
    areaEmpty: $('#areaEmpty'),
    fitBtn: $('#fitBtn'),
    addBtn: $('#addBtn'),
    dialog: $('#spotDialog'),
    form: $('#spotForm'),
    dialogTitle: $('#dialogTitle'),
    cancelBtn: $('#cancelBtn'),
    deleteBtn: $('#deleteBtn'),
    spotSearch: $('#spotSearch'),
    suggest: $('#suggest'),
    searchSpinner: $('#searchSpinner'),
    name: $('#nameInput'),
    category: $('#categoryInput'),
    status: $('#statusInput'),
    heritage: $('#heritageInput'),
    address: $('#addressInput'),
    hours: $('#hoursInput'),
    fee: $('#feeInput'),
    priority: $('#priorityInput'),
    website: $('#websiteInput'),
    visitDate: $('#visitDateInput'),
    lat: $('#latInput'),
    lng: $('#lngInput'),
    geoBtn: $('#geoBtn'),
    note: $('#noteInput'),
    menuBtn: $('#menuBtn'),
    menuList: $('#menuList'),
    editCatBtn: $('#editCatBtn'),
    offlineBtn: $('#offlineBtn'),
    offlineBadge: $('#offlineBadge'),
    catDialog: $('#catDialog'),
    catList: $('#catList'),
    catNewIcon: $('#catNewIcon'),
    catNewLabel: $('#catNewLabel'),
    catAddBtn: $('#catAddBtn'),
    catCloseBtn: $('#catCloseBtn'),
    catResetBtn: $('#catResetBtn'),
    emojiPalette: $('#emojiPalette'),
    exportBtn: $('#exportBtn'),
    importBtn: $('#importBtn'),
    importFile: $('#importFile'),
    sampleBtn: $('#sampleBtn'),
    clearBtn: $('#clearBtn'),
    themeToggle: $('#themeToggle'),
    toast: $('#toast'),
  };

  /** @type {Array<object>} */
  let items = [];
  /** @type {Array<{value:string,label:string,icon:string}>} 利用者が編集できる分類 */
  let categories = defaultCategories();
  let editingId = null;
  let editingCountry = '';

  // ---------- 保存 ----------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      items = Array.isArray(parsed) ? parsed.map(normalize) : [];
    } catch (err) {
      console.error('保存データの読み込みに失敗しました', err);
      items = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('保存に失敗しました', err);
      toast('保存できませんでした（容量不足かもしれません）');
    }
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(CATEGORY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      categories = Array.isArray(parsed) && parsed.length
        ? parsed.map(normalizeCategory).filter((c) => c.value)
        : defaultCategories();
    } catch (err) {
      console.error('分類の読み込みに失敗しました', err);
      categories = defaultCategories();
    }
    ensureFallbackCategory();
    migrateCategories();
  }

  /** 既定の分類を増やしたとき、既存利用者の一覧にも「その他」の手前に足す。
      利用者が自分で消した分類は、rev を進めた後は復活しない */
  function migrateCategories() {
    let rev = 0;
    try { rev = Number(localStorage.getItem(CATEGORY_REV_KEY)) || 0; } catch { rev = 0; }
    if (rev >= CATEGORY_REV) return;

    const known = new Set(categories.map((c) => c.value));
    const added = defaultCategories().filter((c) => !known.has(c.value) && c.value !== FALLBACK_CATEGORY);
    if (added.length) {
      const at = categories.findIndex((c) => c.value === FALLBACK_CATEGORY);
      categories.splice(at < 0 ? categories.length : at, 0, ...added);
      saveCategories();
    }
    try { localStorage.setItem(CATEGORY_REV_KEY, String(CATEGORY_REV)); } catch { /* 無視 */ }
  }

  function saveCategories() {
    try {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
    } catch (err) {
      console.error('分類の保存に失敗しました', err);
    }
  }

  function normalizeCategory(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
      value: String(o.value || '').trim(),
      label: String(o.label || '').trim() || '無名の分類',
      icon: String(o.icon || '📍').trim().slice(0, 4) || '📍',
    };
  }

  /** 「その他」は割り当て先として必ず残す */
  function ensureFallbackCategory() {
    if (!categories.some((c) => c.value === FALLBACK_CATEGORY)) {
      categories.push({ value: FALLBACK_CATEGORY, label: 'その他', icon: '📍' });
    }
  }

  function normalize(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    return {
      id: String(o.id || uid()),
      name: String(o.name || '（無題）'),
      category: resolveCategory(o.category),
      status: STATUSES.some((s) => s.value === o.status) ? o.status : 'want',
      priority: PRIORITIES.some((p) => p.value === o.priority) ? o.priority : 'mid',
      heritage: !!o.heritage,
      address: String(o.address || ''),
      country: String(o.country || ''),
      hours: String(o.hours || ''),
      fee: String(o.fee || ''),
      website: String(o.website || ''),
      visitDate: String(o.visitDate || ''),
      note: String(o.note || ''),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: String(o.updatedAt || new Date().toISOString()),
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- 小物 ----------

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2400);
  }

  const labelOf = (arr, v) => (arr.find((x) => x.value === v) || {}).label || '';
  const catOf = (v) => categories.find((c) => c.value === v)
    || { value: FALLBACK_CATEGORY, label: 'その他', icon: '📍' };
  const resolveCategory = (v) => (categories.some((c) => c.value === v) ? v : FALLBACK_CATEGORY);

  function fillSelect(select, options, extra) {
    select.innerHTML = '';
    if (extra) select.appendChild(new Option(extra.label, extra.value));
    options.forEach((o) => select.appendChild(new Option(o.label, o.value)));
  }

  /** 分類が変わるたびに、入力欄と絞り込みの選択肢を作り直す（選択中の値は維持） */
  function fillCategorySelects() {
    const opts = categories.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` }));
    const cur = el.category.value;
    const curFilter = el.filterCategory.value;

    fillSelect(el.category, opts);
    fillSelect(el.filterCategory, opts, { value: '', label: 'すべての分類' });
    if (el.pCat) {
      const curPreset = el.pCat.value;
      fillSelect(el.pCat, opts);
      el.pCat.value = resolveCategory(curPreset);
    }

    el.category.value = resolveCategory(cur);
    el.filterCategory.value = categories.some((c) => c.value === curFilter) ? curFilter : '';
  }

  function safeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    const withScheme = /^https?:\/\//i.test(s) ? s : 'https://' + s;
    try {
      const u = new URL(withScheme);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch { return ''; }
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // ---------- 一覧の描画 ----------

  function visibleItems() {
    const q = el.filterText.value.trim().toLowerCase();
    const st = el.filterStatus.value;
    const cat = el.filterCategory.value;
    const onlyHeritage = el.filterHeritage.checked;

    let out = items.filter((it) => {
      if (st && it.status !== st) return false;
      if (cat && it.category !== cat) return false;
      if (onlyHeritage && !it.heritage) return false;
      if (!q) return true;
      return [it.name, it.address, it.country, it.note, it.hours]
        .join(' ').toLowerCase().includes(q);
    });

    const sort = el.sortBy.value;
    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ja');
      if (sort === 'priority') {
        const w = (x) => (PRIORITIES.find((p) => p.value === x.priority) || {}).weight ?? 1;
        return w(a) - w(b) || a.name.localeCompare(b.name, 'ja');
      }
      if (sort === 'date') {
        if (!a.visitDate && !b.visitDate) return 0;
        if (!a.visitDate) return 1;
        if (!b.visitDate) return -1;
        return a.visitDate.localeCompare(b.visitDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    return out;
  }

  function render() {
    const shown = visibleItems();
    el.list.innerHTML = '';

    shown.forEach((it) => el.list.appendChild(cardOf(it)));

    el.empty.hidden = items.length > 0;
    if (items.length > 0 && shown.length === 0) {
      el.empty.hidden = false;
      el.empty.innerHTML = '条件に合う観光地がありません。';
    } else if (items.length > 0) {
      el.empty.hidden = true;
    }

    renderStats();
    renderMarkers();
    renderHome();
    renderArea();
  }

  function renderStats() {
    el.statTotal.textContent = items.length;
    el.statHeritage.textContent = items.filter((i) => i.heritage).length;
    el.statVisited.textContent = items.filter((i) => i.status === 'visited').length;
    const countries = new Set(items.map((i) => i.country).filter(Boolean));
    el.statCountries.textContent = countries.size;
  }

  function cardOf(it) {
    const li = document.createElement('li');
    li.className = 'card' + (it.status === 'visited' ? ' is-visited' : '');
    li.dataset.id = it.id;

    const cat = catOf(it.category);
    const site = safeUrl(it.website);

    const head = document.createElement('div');
    head.className = 'card-head';
    const h3 = document.createElement('h3');
    h3.className = 'card-title';
    h3.textContent = `${cat.icon} ${it.name}`;
    head.appendChild(h3);
    li.appendChild(head);

    const badges = document.createElement('div');
    badges.className = 'badges';
    if (it.heritage) badges.appendChild(badge('世界遺産', 'heritage'));
    badges.appendChild(badge(labelOf(STATUSES, it.status), 'status-' + it.status));
    badges.appendChild(badge(cat.label));
    if (it.priority === 'high') badges.appendChild(badge('優先度 高', 'prio-high'));
    li.appendChild(badges);

    const meta = document.createElement('div');
    meta.className = 'meta';
    if (it.address) meta.appendChild(metaRow('📍', it.address));
    if (it.hours) meta.appendChild(metaRow('🕒', it.hours));
    if (it.fee) meta.appendChild(metaRow('💴', it.fee));
    if (it.visitDate) meta.appendChild(metaRow('📅', formatDate(it.visitDate) + ' に訪問予定'));
    if (site) {
      const row = metaRow('🔗', '');
      const a = document.createElement('a');
      a.href = site;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
      row.lastChild.appendChild(a);
      meta.appendChild(row);
    }
    if (meta.childElementCount) li.appendChild(meta);

    if (it.note) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = it.note;
      li.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(actionBtn('編集', () => openDialog(it.id)));
    if (Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
      actions.appendChild(actionBtn('地図', () => focusOnMap(it)));
    }
    actions.appendChild(actionBtn(
      it.status === 'visited' ? '戻す' : '訪問済',
      () => {
        it.status = it.status === 'visited' ? 'want' : 'visited';
        it.updatedAt = new Date().toISOString();
        save();
        render();
      },
    ));
    li.appendChild(actions);

    return li;
  }

  function badge(text, cls) {
    const s = document.createElement('span');
    s.className = 'badge' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function metaRow(icon, text) {
    const div = document.createElement('div');
    const i = document.createElement('span');
    i.className = 'ico';
    i.setAttribute('aria-hidden', 'true');
    i.textContent = icon;
    const t = document.createElement('span');
    t.textContent = text;
    div.append(i, t);
    return div;
  }

  function actionBtn(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- 地図 ----------

  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  let map = null;
  let markerLayer = null;
  let pickMap = null;
  let pickMarker = null;

  function pinIcon(it) {
    const cls = it.status === 'visited' ? 'visited' : (it.heritage ? 'heritage' : '');
    return L.divIcon({
      className: '',
      html: `<div class="pin ${cls}"><span>${catOf(it.category).icon}</span></div>`,
      iconSize: [0, 0],
    });
  }

  function ensureMap() {
    if (map) return map;
    map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([35.68, 139.76], 3);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, crossOrigin: 'anonymous' }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    renderMarkers();
    fitAll();
    return map;
  }

  function renderMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    items.forEach((it) => {
      if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) return;
      const m = L.marker([it.lat, it.lng], { icon: pinIcon(it) });
      m.bindPopup(popupHtml(it));
      markerLayer.addLayer(m);
    });
  }

  function popupHtml(it) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const g = `https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`;
    return [
      `<b>${esc(it.name)}</b>`,
      it.heritage ? '<br><small>🏛️ 世界遺産</small>' : '',
      it.address ? `<br><small>${esc(it.address)}</small>` : '',
      it.hours ? `<br><small>🕒 ${esc(it.hours)}</small>` : '',
      `<br><a href="${g}" target="_blank" rel="noopener">Googleマップで開く</a>`,
    ].join('');
  }

  function fitAll() {
    if (!map) return;
    const pts = items
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((i) => [i.lat, i.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], 12);
    else map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }

  function focusOnMap(it) {
    showView('map');
    setTimeout(() => {
      ensureMap();
      map.invalidateSize();
      map.setView([it.lat, it.lng], 14, { animate: false });
      markerLayer.eachLayer((m) => {
        const ll = m.getLatLng();
        if (Math.abs(ll.lat - it.lat) < 1e-9 && Math.abs(ll.lng - it.lng) < 1e-9) m.openPopup();
      });
    }, 60);
  }

  function showView(which) {
    const views = {
      home: [el.homeView, el.tabHome],
      list: [el.listView, el.tabList],
      area: [el.areaView, el.tabArea],
      map: [el.mapView, el.tabMap],
    };
    const target = views[which] ? which : 'home';
    Object.keys(views).forEach((key) => {
      const [view, tab] = views[key];
      const on = key === target;
      view.classList.toggle('is-active', on);
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    if (target === 'map') {
      ensureMap();
      setTimeout(() => map.invalidateSize(), 50);
    } else {
      views[target][0].scrollTop = 0;
    }
  }

  /** トップページやエリアページから、条件つきでリストへ移動する */
  function jumpToList(filter) {
    const f = filter || {};
    el.filterText.value = f.text || '';
    el.filterStatus.value = f.status || '';
    el.filterCategory.value = f.category || '';
    el.filterHeritage.checked = !!f.heritage;
    render();
    showView('list');
  }

  // ---------- オフライン用の地図保存 ----------

  const TILE_SAVE_CACHE = 'travel-wishlist-tiles-saved';
  const SAVE_MAX_ZOOM = 13;   // 登録地点の周辺をここまで詳細に保存する
  const SAVE_TILE_CAP = 1500; // 取りすぎ防止の上限

  const lngToX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const latToY = (lat, z) => {
    const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const tileUrl = (z, x, y) => TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  /** 世界全体の低ズーム＋各登録地点の周辺タイルURLを列挙する（重複は除く） */
  function tilesToSave() {
    const urls = new Set();

    // 世界地図（z0〜2）。ズームアウトしても真っ白にならないように
    for (let z = 0; z <= 2; z += 1) {
      for (let x = 0; x < 2 ** z; x += 1) {
        for (let y = 0; y < 2 ** z; y += 1) urls.add(tileUrl(z, x, y));
      }
    }

    items.forEach((it) => {
      if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) return;
      // z3〜13 は地点を含むタイル。親子が揃うので途中のズームで欠けない
      for (let z = 3; z <= SAVE_MAX_ZOOM; z += 1) {
        const x = lngToX(it.lng, z);
        const y = latToY(it.lat, z);
        urls.add(tileUrl(z, x, y));
        // 最大ズームだけは周囲3×3も入れて、少し動かしても見えるようにする
        if (z === SAVE_MAX_ZOOM) {
          for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < 2 ** z && ny < 2 ** z) urls.add(tileUrl(z, nx, ny));
            }
          }
        }
      }
    });

    return Array.from(urls).slice(0, SAVE_TILE_CAP);
  }

  let saving = false;

  async function saveOfflineMap() {
    if (saving) { toast('保存中です…'); return; }
    if (!('caches' in window)) { toast('この環境では保存できません'); return; }
    if (!navigator.onLine) { toast('オンラインのときに実行してください'); return; }

    const withPin = items.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng)).length;
    if (!withPin) { toast('地図つきの登録がまだありません'); return; }

    const urls = tilesToSave();
    if (!confirm(`登録済み${withPin}件の周辺の地図（約${urls.length}枚のタイル）をこの端末に保存します。\n通信量がかかります。実行しますか？`)) return;

    saving = true;
    const cache = await caches.open(TILE_SAVE_CACHE);
    let done = 0;
    let failed = 0;

    // OpenStreetMap のタイルサーバーに負担をかけないよう、同時4本までに絞る
    const queue = urls.slice();
    const worker = async () => {
      while (queue.length) {
        const url = queue.shift();
        try {
          if (await cache.match(url)) { done += 1; continue; }
          const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
          if (res.ok) await cache.put(url, res.clone());
          else failed += 1;
          done += 1;
        } catch (err) {
          failed += 1;
          done += 1;
        }
        if (done % 25 === 0) toast(`地図を保存中… ${done}/${urls.length}`);
      }
    };

    try {
      await Promise.all(Array.from({ length: 4 }, worker));
      toast(failed
        ? `地図を保存しました（${urls.length - failed}枚、${failed}枚は失敗）`
        : `地図を保存しました（${urls.length}枚）`);
    } finally {
      saving = false;
    }
  }

  function updateOnlineBadge() {
    el.offlineBadge.hidden = navigator.onLine;
  }

  // ダイアログ内の位置指定マップ
  function ensurePickMap() {
    if (pickMap) return pickMap;
    pickMap = L.map('pickMap', { zoomControl: true, attributionControl: false })
      .setView([35.68, 139.76], 2);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, crossOrigin: 'anonymous' }).addTo(pickMap);
    pickMap.on('click', (e) => setPickPoint(e.latlng.lat, e.latlng.lng, false));
    return pickMap;
  }

  function setPickPoint(lat, lng, recenter) {
    const m = ensurePickMap();
    el.lat.value = Number(lat).toFixed(6);
    el.lng.value = Number(lng).toFixed(6);
    if (!pickMarker) {
      pickMarker = L.marker([lat, lng], { draggable: true }).addTo(m);
      pickMarker.on('dragend', () => {
        const p = pickMarker.getLatLng();
        el.lat.value = p.lat.toFixed(6);
        el.lng.value = p.lng.toFixed(6);
      });
    } else {
      pickMarker.setLatLng([lat, lng]);
    }
    if (recenter) m.setView([lat, lng], Math.max(m.getZoom(), 13), { animate: false });
  }

  function clearPickPoint() {
    if (pickMarker && pickMap) {
      pickMap.removeLayer(pickMarker);
      pickMarker = null;
    }
    el.lat.value = '';
    el.lng.value = '';
  }

  // ---------- 検索（自動入力） ----------

  let searchTimer = 0;
  let searchAbort = null;
  const searchCache = new Map();

  function normText(s) {
    return String(s || '').toLowerCase().replace(/[\s・･、。'"’”（）()]/g, '');
  }

  function presetMatches(q) {
    const nq = normText(q);
    if (!nq) return [];
    const scored = [];
    activePresets().forEach((p) => {
      const name = normText(p.n);
      const key = normText(p.k);
      const area = normText(p.c);
      let rank = -1;
      if (name.startsWith(nq)) rank = 0;
      else if (name.includes(nq)) rank = 1;
      else if (key.includes(nq)) rank = 2;
      else if (area.includes(nq)) rank = 3;
      if (rank < 0) return;
      scored.push({ rank, p });
    });
    scored.sort((a, b) => a.rank - b.rank || a.p.n.length - b.p.n.length);
    return scored.slice(0, 8).map(({ p }) => ({
      source: 'preset',
      name: p.n,
      sub: p.c,
      address: p.c,
      country: (p.c.split('/')[0] || '').trim(),
      lat: p.lat,
      lng: p.lng,
      category: p.cat,
      heritage: !!p.whc,
      hours: '',
      fee: '',
      website: '',
      osm: p.o || '',
    }));
  }

  /* OSM の key=value をアプリの分類に落とす。プリセット生成側と同じ規則 */
  function kvCategory(key, value, name) {
    const kv = `${key || ''}=${value || ''}`.toLowerCase();
    const nm = String(name || '');
    if (/温泉|湯畑|地獄めぐり|砂むし/.test(nm) && !/駅|神社/.test(nm)) return 'onsen';
    if (/^amenity=(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream|biergarten)$/.test(kv)) return 'gourmet';
    if (/^shop=(bakery|confectionery|pastry|greengrocer|seafood|deli|coffee|tea|wine|alcohol)$/.test(kv)) return 'gourmet';
    if (/^amenity=(public_bath|onsen)$/.test(kv) || kv === 'leisure=spa' || kv === 'natural=hot_spring') return 'onsen';
    // 城は tourism=museum で登録されていることが多いので、先に名称で拾う
    if (/castle|palace|fort|citadel/.test(kv) || /城$|城跡$|城址$/.test(nm)) return 'castle';
    if (/^tourism=(theme_park|zoo|aquarium)$/.test(kv)) return 'activity';
    if (/^leisure=(water_park|sports_centre|amusement_arcade|golf_course|ice_rink|marina|pitch|track)$/.test(kv)) return 'activity';
    if (/winter_sports|piste|^sport=/.test(kv) || /スキー場$|尾根$|ゲレンデ/.test(nm)) return 'activity';
    if (/^tourism=(museum|gallery)$/.test(kv) || /^amenity=(arts_centre|theatre)$/.test(kv)) return 'museum';
    if (kv === 'amenity=place_of_worship' || /(shrine|temple|church|cathedral|monastery|mosque|chapel)/.test(kv)) return 'temple';
    if (/神社|大社|寺$|寺院|八幡宮|天満宮|神宮|大聖堂/.test(nm)) return 'temple';
    if (/^historic=(archaeological_site|ruins|monument|memorial|tomb|city_gate)$/.test(kv)) return 'heritage';
    if (/^(shop|amenity)=(mall|marketplace|department_store|supermarket)$/.test(kv) || /^shop=/.test(kv)) return 'shop';
    if (/^leisure=(park|garden|nature_reserve)$/.test(kv) || /^tourism=picnic_site$/.test(kv)) return 'park';
    if (/^(natural|waterway)=/.test(kv) || /^place=(island|islet)$/.test(kv)) return 'nature';
    if (/volcano|peak|waterfall|bay|glacier|cave|beach|forest|national_park/.test(kv)) return 'nature';
    if (/滝$|渓谷$|峡$|海岸$|湖$|山$|岳$|砂丘$|池$|棚田$|高原$/.test(nm)) return 'nature';
    if (/^tourism=(attraction|viewpoint)$/.test(kv)) return 'monument';
    if (/^(historic|man_made)=/.test(kv) || /monument|memorial|tower|bridge|lighthouse/.test(kv)) return 'monument';
    if (/^(place|boundary)=/.test(kv) || /city|town|village|suburb|neighbourhood|hamlet|administrative/.test(kv)) return 'city';
    return 'other';
  }

  function osmCategory(r) {
    const et = r.extratags || {};
    const cat = kvCategory(r.class, r.type, (r.namedetails || {}).name || r.display_name || '');
    if (cat === 'other' && et.heritage) return 'heritage';
    return cat;
  }

  function isWorldHeritage(r) {
    const et = r.extratags || {};
    const op = String(et['heritage:operator'] || '').toLowerCase();
    return !!et['ref:whc'] || op.includes('whc') || op.includes('unesco');
  }

  function toSuggestion(r) {
    const nd = r.namedetails || {};
    const et = r.extratags || {};
    const ad = r.address || {};
    const display = String(r.display_name || '');
    const name = nd['name:ja'] || nd.name || display.split(',')[0].trim();
    const rest = display.split(',').slice(1).map((s) => s.trim()).filter(Boolean);
    return {
      source: 'osm',
      name,
      sub: rest.join('、') || display,
      address: display,
      country: ad.country || '',
      lat: Number(r.lat),
      lng: Number(r.lon),
      category: osmCategory(r),
      heritage: isWorldHeritage(r),
      hours: et.opening_hours || '',
      fee: et.fee === 'no' ? '無料' : (et.charge || ''),
      website: et.website || et['contact:website'] || et.url || '',
      osm: r.osm_type && r.osm_id ? `${String(r.osm_type)[0].toUpperCase()}${r.osm_id}` : '',
    };
  }

  /* Photon は入力途中でも部分一致で拾えるので、飲食店や体験施設もヒットしやすい */
  function photonToSuggestion(f) {
    const p = (f && f.properties) || {};
    const coords = ((f && f.geometry) || {}).coordinates || [];
    const name = String(p.name || '').trim();
    const area = [p.state, p.city || p.county, p.district, p.street].filter(Boolean).join(' ');
    return {
      source: 'photon',
      name,
      sub: [p.country, area].filter(Boolean).join(' / '),
      address: [p.country, p.state, p.city || p.county, p.district, p.street, p.housenumber]
        .filter(Boolean).join(' '),
      country: p.country || '',
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      category: kvCategory(p.osm_key, p.osm_value, name),
      heritage: false,
      hours: '',
      fee: '',
      website: '',
      osm: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : '',
    };
  }

  async function searchPhoton(query, signal) {
    const url = new URL(PHOTON);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '10');
    url.searchParams.set('lang', 'default');
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.features || [])
      .map(photonToSuggestion)
      .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng));
  }

  async function searchNominatim(query, signal) {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('accept-language', 'ja');
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(toSuggestion).filter((s) => s.name);
  }

  function showSuggest(entries, note) {
    el.suggest.innerHTML = '';
    if (!entries.length && !note) { el.suggest.hidden = true; return; }
    el.suggest.hidden = false;

    entries.forEach((s) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('span');
      n.className = 's-name';
      if (s.heritage) {
        const tag = document.createElement('span');
        tag.className = 's-tag';
        tag.textContent = '世界遺産';
        n.appendChild(tag);
      }
      n.appendChild(document.createTextNode(`${catOf(resolveCategory(s.category)).icon} ${s.name}`));
      const sub = document.createElement('span');
      sub.className = 's-sub';
      sub.textContent = s.sub;
      b.append(n, sub);
      b.addEventListener('click', () => applySuggestion(s));
      li.appendChild(b);
      el.suggest.appendChild(li);
    });

    if (note) {
      const li = document.createElement('li');
      li.className = 's-empty';
      li.textContent = note;
      el.suggest.appendChild(li);
    }
  }

  function runSearch(q) {
    const query = q.trim();
    clearTimeout(searchTimer);
    if (searchAbort) { searchAbort.abort(); searchAbort = null; }
    el.searchSpinner.hidden = true;

    if (query.length < 1) { showSuggest([], ''); return; }

    const local = presetMatches(query);
    showSuggest(local, local.length ? '' : '検索中…');

    if (searchCache.has(query)) {
      showSuggest(merge(local, searchCache.get(query)), '');
      return;
    }

    // 各サービスの利用規約に配慮して 500ms のデバウンス（連打しない）
    el.searchSpinner.hidden = false;
    searchTimer = setTimeout(async () => {
      searchAbort = new AbortController();
      const signal = searchAbort.signal;
      try {
        // まず Photon。部分一致に強く、飲食店や体験施設まで拾える
        let remote = [];
        let reached = false;
        try {
          remote = await searchPhoton(query, signal);
          reached = true;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('Photon 検索に失敗しました', err);
        }

        // 取りこぼしたときだけ Nominatim も引く（住所や地名に強い）
        if (remote.length < 3) {
          try {
            remote = merge(remote, await searchNominatim(query, signal));
            reached = true;
          } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('Nominatim 検索に失敗しました', err);
          }
        }

        if (reached) searchCache.set(query, remote);
        const all = merge(local, remote);
        const note = all.length
          ? ''
          : (reached
            ? '該当する場所が見つかりませんでした。名称を手入力してもOKです。'
            : 'オフラインのため候補を取得できません。手入力してください。');
        showSuggest(all.slice(0, 12), note);
      } finally {
        el.searchSpinner.hidden = true;
        searchAbort = null;
      }
    }, 500);
  }

  /* 同じ場所が別ソースから重複して出るのを防ぐ。
     名前だけだと別の市にある同名の施設まで消えるので、座標もキーに入れる */
  function dedupKey(s) {
    const at = Number.isFinite(s.lat) && Number.isFinite(s.lng)
      ? `${s.lat.toFixed(2)},${s.lng.toFixed(2)}`
      : '';
    return `${normText(s.name)}@${at}`;
  }

  function merge(local, remote) {
    const seen = new Set(local.map(dedupKey));
    return local.concat(remote.filter((s) => {
      const k = dedupKey(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
  }

  function applySuggestion(s) {
    el.name.value = s.name;
    el.address.value = s.address || '';
    editingCountry = s.country || (s.address || '').split(',').pop().trim();
    el.category.value = resolveCategory(s.category);
    el.heritage.checked = !!s.heritage;
    if (s.hours) el.hours.value = s.hours;
    if (s.fee) el.fee.value = s.fee;
    if (s.website) el.website.value = s.website;
    if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) setPickPoint(s.lat, s.lng, true);

    el.suggest.hidden = true;
    el.spotSearch.value = '';
    el.spotSearch.blur();
    highlightFilled();
    toast(`「${s.name}」を自動入力しました`);

    // 営業時間・公式サイト・世界遺産かどうかは OSM のタグから補う
    if (!s.hours || !s.website) enrichFromOsm(s);
  }

  /** 選んだ地点の詳細タグを取りに行く。OSM ID があれば lookup、なければ名称検索 */
  async function enrichFromOsm(s) {
    const nameAtStart = el.name.value;
    try {
      let record = null;

      if (s.osm && /^[NWR]\d+$/.test(s.osm)) {
        const url = new URL(NOMINATIM_LOOKUP);
        url.searchParams.set('osm_ids', s.osm);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('extratags', '1');
        url.searchParams.set('namedetails', '1');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('accept-language', 'ja');
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data[0]) record = data[0];
        }
      }

      if (!record) {
        const url = new URL(NOMINATIM);
        url.searchParams.set('q', s.name);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('extratags', '1');
        url.searchParams.set('namedetails', '1');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('limit', '1');
        url.searchParams.set('accept-language', 'ja');
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || !data[0]) return;
        record = data[0];
      }

      // 補完している間に別の候補を選んでいたら、書き戻さない
      if (el.name.value !== nameAtStart) return;

      const d = toSuggestion(record);
      if (!el.hours.value && d.hours) el.hours.value = d.hours;
      if (!el.fee.value && d.fee) el.fee.value = d.fee;
      if (!el.website.value && d.website) el.website.value = d.website;
      if (d.heritage) el.heritage.checked = true;
      highlightFilled();
    } catch { /* 補完は失敗しても無視 */ }
  }

  function highlightFilled() {
    [el.name, el.address, el.hours, el.fee, el.website].forEach((input) => {
      const field = input.closest('.field');
      if (field) field.classList.toggle('auto-filled', !!input.value);
    });
  }

  // ---------- エリア（地域・都道府県）の判定 ----------

  /** 所在地の文字列から都道府県を拾う。保存済みのデータにも後付けで効く */
  function prefOf(it) {
    const m = String(it.address || '').match(PREF_RE);
    return m ? m[0] : '';
  }

  function countryOf(it) {
    const c = String(it.country || '').trim();
    if (c) return c;
    if (prefOf(it)) return '日本';
    const a = String(it.address || '').trim();
    if (!a) return '未設定';
    if (a.includes('/')) return a.split('/')[0].trim() || '未設定';
    const parts = a.split(/[,、]/).map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '未設定';
  }

  function areaOf(it) {
    const pref = prefOf(it);
    if (pref) {
      const r = PREF_REGION.get(pref);
      return { regionKey: r.key, regionLabel: r.label, pref, country: '日本' };
    }
    const country = countryOf(it);
    if (country === '日本') {
      return { regionKey: 'jp-other', regionLabel: '日本（都道府県が不明）', pref: '', country };
    }
    return { regionKey: OVERSEAS.key, regionLabel: OVERSEAS.label, pref: '', country };
  }

  /** 所在地の短い表示。「滋賀県 近江八幡市」「イタリア」など */
  function areaLabelOf(it) {
    const a = areaOf(it);
    if (!a.pref) return a.country;
    const rest = String(it.address || '').split(a.pref)[1] || '';
    const city = (rest.match(/[^\s/,、]+[市区町村郡]/) || [])[0] || '';
    return city ? `${a.pref} ${city}` : a.pref;
  }

  function areaGroups(mode, list) {
    const map = new Map();
    list.forEach((it) => {
      const a = areaOf(it);
      let key;
      let label;
      if (mode === 'pref') { key = a.pref || a.country; label = key; }
      else if (mode === 'country') { key = a.country; label = key; }
      else { key = a.regionKey; label = a.regionLabel; }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key).items.push(it);
    });

    const rank = (g) => {
      if (mode === 'pref') {
        const i = PREF_INDEX.get(g.key);
        return i === undefined ? 1000 : i;
      }
      if (mode === 'country') return g.key === '日本' ? -1 : 1000;
      const i = REGION_INDEX.get(g.key);
      return i === undefined ? 1000 : i;
    };

    return Array.from(map.values())
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'ja'));
  }

  // ---------- エリア別ページ ----------

  function renderArea() {
    const mode = el.areaGroupBy.value || 'region';
    const list = el.areaHideVisited.checked ? items.filter((i) => i.status !== 'visited') : items;
    const groups = areaGroups(mode, list);

    // 開いていたグループは開いたままにする
    const first = el.areaList.childElementCount === 0;
    const opened = new Set(Array.from(el.areaList.querySelectorAll('details[open]')).map((d) => d.dataset.key));

    el.areaList.innerHTML = '';
    groups.forEach((g) => el.areaList.appendChild(areaGroupEl(g, first || opened.has(g.key))));
    el.areaEmpty.hidden = groups.length > 0;
  }

  function areaGroupEl(group, open) {
    const details = document.createElement('details');
    details.className = 'area-group';
    details.dataset.key = group.key;
    details.open = !!open;

    const summary = document.createElement('summary');
    const name = document.createElement('span');
    name.className = 'area-name';
    name.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'area-count';
    count.textContent = `${group.items.length}件`;
    summary.append(name, count);

    const done = group.items.filter((i) => i.status === 'visited').length;
    if (done) {
      const d = document.createElement('span');
      d.className = 'area-done';
      d.textContent = `訪問済 ${done}`;
      summary.appendChild(d);
    }
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'area-body';
    group.items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .forEach((it) => body.appendChild(areaRow(it)));

    const withPin = group.items.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));
    if (withPin.length) {
      const actions = document.createElement('div');
      actions.className = 'area-actions';
      actions.appendChild(actionBtn('この範囲を地図で見る', () => focusGroupOnMap(withPin)));
      body.appendChild(actions);
    }

    details.appendChild(body);
    return details;
  }

  function areaRow(it) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'area-row' + (it.status === 'visited' ? ' is-visited' : '');

    const ico = document.createElement('span');
    ico.className = 'mini-ico';
    ico.textContent = catOf(it.category).icon;

    const bodyEl = document.createElement('span');
    bodyEl.className = 'mini-body';
    const nm = document.createElement('span');
    nm.className = 'mini-name';
    nm.textContent = (it.heritage ? '🏛 ' : '') + it.name;
    const sub = document.createElement('span');
    sub.className = 'mini-sub';
    sub.textContent = [areaLabelOf(it), it.hours].filter(Boolean).join('・');
    bodyEl.append(nm, sub);

    const tail = document.createElement('span');
    tail.className = 'mini-tail';
    tail.textContent = labelOf(STATUSES, it.status);

    b.append(ico, bodyEl, tail);
    b.addEventListener('click', () => openDialog(it.id));
    return b;
  }

  function focusGroupOnMap(list) {
    showView('map');
    setTimeout(() => {
      ensureMap();
      map.invalidateSize();
      const pts = list.map((i) => [i.lat, i.lng]);
      if (pts.length === 1) map.setView(pts[0], 13, { animate: false });
      else map.fitBounds(L.latLngBounds(pts).pad(0.2));
    }, 60);
  }

  function gotoArea(key, mode) {
    el.areaGroupBy.value = mode || 'region';
    renderArea();
    showView('area');
    const target = Array.from(el.areaList.querySelectorAll('details')).find((d) => d.dataset.key === key);
    if (!target) return;
    target.open = true;
    setTimeout(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 40);
  }

  // ---------- トップページ ----------

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const QUICK_ACTIONS = [
    { icon: '＋', label: '場所を追加', accent: true, run: () => openDialog(null) },
    { icon: '🗺️', label: '地図で見る', run: () => showView('map') },
    { icon: '🗾', label: 'エリア別', run: () => showView('area') },
    { icon: '🏛️', label: '世界遺産', run: () => jumpToList({ heritage: true }) },
    { icon: '📝', label: '計画中', run: () => jumpToList({ status: 'planned' }) },
    { icon: '✅', label: '訪問済', run: () => jumpToList({ status: 'visited' }) },
  ];

  function buildQuickGrid() {
    el.quickGrid.innerHTML = '';
    QUICK_ACTIONS.forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quick' + (q.accent ? ' accent' : '');
      const i = document.createElement('span');
      i.className = 'quick-ico';
      i.setAttribute('aria-hidden', 'true');
      i.textContent = q.icon;
      const l = document.createElement('span');
      l.className = 'quick-label';
      l.textContent = q.label;
      b.append(i, l);
      b.addEventListener('click', q.run);
      el.quickGrid.appendChild(b);
    });
  }

  function miniRow(it, tailText) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';

    const ico = document.createElement('span');
    ico.className = 'mini-ico';
    ico.textContent = catOf(it.category).icon;

    const bodyEl = document.createElement('span');
    bodyEl.className = 'mini-body';
    const nm = document.createElement('span');
    nm.className = 'mini-name';
    nm.textContent = it.name;
    const sub = document.createElement('span');
    sub.className = 'mini-sub';
    sub.textContent = areaLabelOf(it);
    bodyEl.append(nm, sub);

    const tail = document.createElement('span');
    tail.className = 'mini-tail';
    tail.textContent = tailText || '';

    b.append(ico, bodyEl, tail);
    b.addEventListener('click', () => openDialog(it.id));
    return b;
  }

  function chip(label, count, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.appendChild(document.createTextNode(label));
    const c = document.createElement('span');
    c.className = 'chip-count';
    c.textContent = count;
    b.appendChild(c);
    b.addEventListener('click', onClick);
    return b;
  }

  function fillSection(sec, host, rows) {
    host.innerHTML = '';
    rows.forEach((r) => host.appendChild(r));
    sec.hidden = rows.length === 0;
  }

  function renderHome() {
    el.homeEmpty.hidden = items.length > 0;
    const today = todayStr();

    // 次の予定（今日以降の訪問予定日）
    const upcoming = items
      .filter((i) => i.visitDate && i.visitDate >= today && i.status !== 'visited')
      .sort((a, b) => a.visitDate.localeCompare(b.visitDate))
      .slice(0, 4)
      .map((it) => miniRow(it, formatDate(it.visitDate).replace(/^\d+年/, '')));
    fillSection(el.homeUpcomingSec, el.homeUpcoming, upcoming);

    // 優先度が高い（未訪問のみ）
    const priority = items
      .filter((i) => i.priority === 'high' && i.status !== 'visited')
      .slice(0, 4)
      .map((it) => miniRow(it, labelOf(STATUSES, it.status)));
    fillSection(el.homePrioritySec, el.homePriority, priority);

    // エリアから探す
    const areaChips = areaGroups('region', items)
      .map((g) => chip(g.label, g.items.length, () => gotoArea(g.key, 'region')));
    fillSection(el.homeAreaSec, el.homeAreas, areaChips);

    // 分類から探す
    const counts = new Map();
    items.forEach((i) => counts.set(i.category, (counts.get(i.category) || 0) + 1));
    const catChips = categories
      .filter((c) => counts.get(c.value))
      .map((c) => chip(`${c.icon} ${c.label}`, counts.get(c.value), () => jumpToList({ category: c.value })));
    fillSection(el.homeCatSec, el.homeCats, catChips);

    // 最近追加した場所
    const recent = items
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4)
      .map((it) => miniRow(it, labelOf(STATUSES, it.status)));
    fillSection(el.homeRecentSec, el.homeRecent, recent);
  }

  // ---------- 開発者モード（プリセットの編集・追加） ----------
  //
  // 静的サイトなので本当のアクセス制御は作れない。ここでやっているのは
  //   1. 入口を隠す（?dev=1 かタイトル7連打）— 一般利用者は辿り着かない
  //   2. 編集はこの端末の localStorage にだけ持つ — 他人には一切影響しない
  //   3. 全員に反映するには presets.js を書き出して Git にコミットする
  // で、3 の push 権限が実質的な「開発者だけ」の担保になっている。

  const DEV_KEY = 'travel-wishlist.dev';
  const OVERLAY_KEY = 'travel-wishlist.presets.overlay.v1';
  const DEV_TAPS_NEEDED = 7;

  let devMode = false;
  /** @type {{v:number, edited:Object<string,object>, added:object[], removed:string[]}} */
  let overlay = { v: 1, edited: {}, added: [], removed: [] };
  let presetCache = null;

  function emptyOverlay() {
    return { v: 1, edited: {}, added: [], removed: [] };
  }

  function loadOverlay() {
    try {
      const raw = localStorage.getItem(OVERLAY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      overlay = parsed && typeof parsed === 'object' ? normalizeOverlay(parsed) : emptyOverlay();
    } catch (err) {
      console.error('プリセットの上書きを読み込めませんでした', err);
      overlay = emptyOverlay();
    }
    presetCache = null;
  }

  function normalizeOverlay(o) {
    return {
      v: 1,
      edited: o.edited && typeof o.edited === 'object' ? o.edited : {},
      added: Array.isArray(o.added) ? o.added.map(normalizePreset).filter((p) => p.n) : [],
      removed: Array.isArray(o.removed) ? o.removed.map(String) : [],
    };
  }

  function normalizePreset(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    return {
      n: String(o.n || '').trim(),
      k: String(o.k || '').trim(),
      c: String(o.c || '').trim(),
      lat: Number.isFinite(lat) ? Number(lat.toFixed(5)) : 0,
      lng: Number.isFinite(lng) ? Number(lng.toFixed(5)) : 0,
      cat: resolveCategory(o.cat),
      whc: !!o.whc,
      o: String(o.o || '').trim(),
    };
  }

  function saveOverlay() {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
    } catch (err) {
      console.error('プリセットの上書きを保存できませんでした', err);
      toast('保存できませんでした');
    }
    presetCache = null;
  }

  function overlayCount() {
    return Object.keys(overlay.edited).length + overlay.added.length + overlay.removed.length;
  }

  /** 検索やサンプル追加が実際に使うプリセット一覧（基本データ＋この端末の上書き） */
  function activePresets() {
    if (presetCache) return presetCache;
    const base = window.SPOT_PRESETS || [];
    const removed = new Set(overlay.removed);
    const list = [];
    base.forEach((p) => {
      if (removed.has(p.n)) return;
      list.push(overlay.edited[p.n] ? { ...p, ...overlay.edited[p.n] } : p);
    });
    presetCache = list.concat(overlay.added);
    return presetCache;
  }

  // ---- 開発モードの出入り ----

  function enableDev(quiet) {
    devMode = true;
    try { localStorage.setItem(DEV_KEY, '1'); } catch { /* 保存できなくても今回は有効 */ }
    applyDevVisibility();
    if (!quiet) toast('開発モードをオンにしました');
  }

  function disableDev() {
    devMode = false;
    try { localStorage.removeItem(DEV_KEY); } catch { /* 無視 */ }
    applyDevVisibility();
    toast('開発モードをオフにしました');
  }

  function applyDevVisibility() {
    el.devBadge.hidden = !devMode;
    el.devPresetBtn.hidden = !devMode;
  }

  /** タイトルを続けて7回タップでも入れるようにする（iPhone で URL を打たずに済むように） */
  function setupDevGesture() {
    let taps = 0;
    let timer = 0;
    el.logo.addEventListener('click', () => {
      if (devMode) return;
      taps += 1;
      clearTimeout(timer);
      timer = setTimeout(() => { taps = 0; }, 2500);
      if (taps >= DEV_TAPS_NEEDED) {
        taps = 0;
        enableDev();
      }
    });
  }

  function initDev() {
    loadOverlay();
    try { devMode = localStorage.getItem(DEV_KEY) === '1'; } catch { devMode = false; }

    try {
      const params = new URLSearchParams(location.search);
      if (params.get('dev') === '1') {
        enableDev(true);
        // URL に ?dev=1 を残さない
        params.delete('dev');
        const q = params.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      }
    } catch { /* URL が扱えない環境では無視 */ }

    applyDevVisibility();
    setupDevGesture();
  }

  // ---- プリセット一覧ダイアログ ----

  const DEV_LIST_LIMIT = 60;

  function openDevDialog() {
    if (!devMode) return;
    el.devFilter.value = '';
    renderDevList();
    el.devDialog.showModal();
  }

  function presetState(p) {
    if (overlay.added.includes(p)) return 'added';
    const base = (window.SPOT_PRESETS || []).find((b) => b.n === p.n);
    if (base && overlay.edited[base.n]) return 'edited';
    return '';
  }

  function renderDevList() {
    const q = normText(el.devFilter.value);
    const all = activePresets();
    const hits = q
      ? all.filter((p) => normText(p.n).includes(q) || normText(p.k).includes(q) || normText(p.c).includes(q))
      : all;

    el.devList.innerHTML = '';
    hits.slice(0, DEV_LIST_LIMIT).forEach((p) => el.devList.appendChild(devRow(p)));

    el.devMore.hidden = hits.length <= DEV_LIST_LIMIT;
    if (!el.devMore.hidden) {
      el.devMore.textContent = `他 ${hits.length - DEV_LIST_LIMIT} 件。絞り込んでください。`;
    }

    const removed = overlay.removed.length;
    el.devSummary.textContent = `全 ${all.length} 件`
      + `（編集 ${Object.keys(overlay.edited).length} / 追加 ${overlay.added.length} / 削除 ${removed}）`
      + (q ? ` — 該当 ${hits.length} 件` : '');
  }

  function devRow(p) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dev-row';

    const ico = document.createElement('span');
    ico.className = 'mini-ico';
    ico.textContent = catOf(resolveCategory(p.cat)).icon;

    const body = document.createElement('span');
    body.className = 'mini-body';
    const nm = document.createElement('span');
    nm.className = 'mini-name';
    nm.textContent = (p.whc ? '🏛 ' : '') + p.n;
    const sub = document.createElement('span');
    sub.className = 'mini-sub';
    sub.textContent = `${p.c}　${p.lat}, ${p.lng}`;
    body.append(nm, sub);

    const state = presetState(p);
    const tail = document.createElement('span');
    tail.className = 'dev-state' + (state ? ' is-' + state : '');
    tail.textContent = state === 'added' ? '追加' : (state === 'edited' ? '編集' : '');

    b.append(ico, body, tail);
    b.addEventListener('click', () => openPresetDialog(p));
    li.appendChild(b);
    return li;
  }

  // ---- 1件の編集ダイアログ ----

  let editingPreset = null;      // 編集中のプリセット（新規なら null）
  let editingBaseName = '';      // 上書きのキーになる、元データ上の名称
  let pMap = null;
  let pMarker = null;

  function ensurePresetMap() {
    if (pMap) return pMap;
    pMap = L.map('pMap', { zoomControl: true, attributionControl: false }).setView([35.68, 139.76], 2);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, crossOrigin: 'anonymous' }).addTo(pMap);
    pMap.on('click', (e) => setPresetPoint(e.latlng.lat, e.latlng.lng, false));
    return pMap;
  }

  function setPresetPoint(lat, lng, recenter) {
    const m = ensurePresetMap();
    el.pLat.value = Number(lat).toFixed(5);
    el.pLng.value = Number(lng).toFixed(5);
    if (!pMarker) {
      pMarker = L.marker([lat, lng], { draggable: true }).addTo(m);
      pMarker.on('dragend', () => {
        const q = pMarker.getLatLng();
        el.pLat.value = q.lat.toFixed(5);
        el.pLng.value = q.lng.toFixed(5);
      });
    } else {
      pMarker.setLatLng([lat, lng]);
    }
    if (recenter) m.setView([lat, lng], Math.max(m.getZoom(), 13), { animate: false });
  }

  function clearPresetPoint() {
    if (pMarker && pMap) { pMap.removeLayer(pMarker); pMarker = null; }
    el.pLat.value = '';
    el.pLng.value = '';
  }

  function openPresetDialog(preset) {
    editingPreset = preset || null;
    const isNew = !preset;

    // 上書きのキーは「元データ上の名称」。編集で改名しても対応が崩れないようにする
    if (isNew) {
      editingBaseName = '';
    } else {
      const base = (window.SPOT_PRESETS || []).find((b) => b.n === preset.n
        || (overlay.edited[b.n] && overlay.edited[b.n].n === preset.n));
      editingBaseName = base ? base.n : '';
    }

    el.presetTitle.textContent = isNew ? 'プリセットを追加' : 'プリセットを編集';
    el.presetSearch.value = '';
    el.presetSuggest.hidden = true;
    el.presetSuggest.innerHTML = '';

    el.pName.value = isNew ? '' : preset.n;
    el.pKeys.value = isNew ? '' : (preset.k || '');
    el.pArea.value = isNew ? '' : (preset.c || '');
    el.pCat.value = resolveCategory(isNew ? 'other' : preset.cat);
    el.pOsm.value = isNew ? '' : (preset.o || '');
    el.pWhc.checked = isNew ? false : !!preset.whc;

    el.pDeleteBtn.hidden = isNew;
    el.pRevertBtn.hidden = isNew || !editingBaseName || !overlay.edited[editingBaseName];

    el.presetDialog.showModal();

    setTimeout(() => {
      const m = ensurePresetMap();
      m.invalidateSize();
      clearPresetPoint();
      if (!isNew && Number.isFinite(preset.lat) && Number.isFinite(preset.lng)) {
        setPresetPoint(preset.lat, preset.lng, true);
      } else {
        m.setView([35, 137], 4, { animate: false });
      }
    }, 60);
  }

  function savePreset(ev) {
    ev.preventDefault();
    const lat = parseFloat(el.pLat.value);
    const lng = parseFloat(el.pLng.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast('座標を入れてください');
      return;
    }

    const next = normalizePreset({
      n: el.pName.value,
      k: el.pKeys.value,
      c: el.pArea.value,
      lat,
      lng,
      cat: el.pCat.value,
      whc: el.pWhc.checked,
      o: el.pOsm.value,
    });
    if (!next.n) { toast('名称を入れてください'); return; }

    // CSV 側は名称を一意な鍵にしているので、ここでも重複を弾く
    const clash = activePresets().some((p) => p !== editingPreset && p.n === next.n);
    if (clash) {
      toast(`「${next.n}」は既にあります。別の名前にしてください`);
      return;
    }

    if (!editingPreset) {
      overlay.added.push(next);
    } else if (editingBaseName) {
      overlay.edited[editingBaseName] = next;
    } else {
      // 上書きではなく、この端末で追加したものを編集した場合
      const i = overlay.added.indexOf(editingPreset);
      if (i >= 0) overlay.added[i] = next;
      else overlay.added.push(next);
    }

    saveOverlay();
    renderDevList();
    el.presetDialog.close();
    toast(editingPreset ? 'プリセットを更新しました' : 'プリセットを追加しました');
  }

  function deletePreset() {
    if (!editingPreset) return;
    if (!confirm(`プリセット「${editingPreset.n}」を削除しますか？`)) return;

    const i = overlay.added.indexOf(editingPreset);
    if (i >= 0) {
      overlay.added.splice(i, 1);
    } else if (editingBaseName) {
      overlay.removed.push(editingBaseName);
      delete overlay.edited[editingBaseName];
    }
    saveOverlay();
    renderDevList();
    el.presetDialog.close();
    toast('削除しました');
  }

  function revertPreset() {
    if (!editingBaseName || !overlay.edited[editingBaseName]) return;
    delete overlay.edited[editingBaseName];
    saveOverlay();
    renderDevList();
    el.presetDialog.close();
    toast('元のデータに戻しました');
  }

  // ---- 編集ダイアログ内の検索（Photon → OSM lookup） ----

  let presetSearchTimer = 0;
  let presetSearchAbort = null;

  function runPresetSearch(q) {
    const query = q.trim();
    clearTimeout(presetSearchTimer);
    if (presetSearchAbort) { presetSearchAbort.abort(); presetSearchAbort = null; }
    if (!query) { el.presetSuggest.hidden = true; return; }

    el.presetSpinner.hidden = false;
    presetSearchTimer = setTimeout(async () => {
      presetSearchAbort = new AbortController();
      try {
        let hits = await searchPhoton(query, presetSearchAbort.signal);
        if (hits.length < 3) hits = merge(hits, await searchNominatim(query, presetSearchAbort.signal));
        showPresetSuggest(hits.slice(0, 10));
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('検索に失敗しました', err);
      } finally {
        el.presetSpinner.hidden = true;
        presetSearchAbort = null;
      }
    }, 500);
  }

  function showPresetSuggest(hits) {
    el.presetSuggest.innerHTML = '';
    el.presetSuggest.hidden = hits.length === 0;
    hits.forEach((s) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('span');
      n.className = 's-name';
      n.textContent = `${catOf(resolveCategory(s.category)).icon} ${s.name}`;
      const sub = document.createElement('span');
      sub.className = 's-sub';
      sub.textContent = `${s.sub}　${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`;
      b.append(n, sub);
      b.addEventListener('click', () => applyPresetSuggestion(s));
      li.appendChild(b);
      el.presetSuggest.appendChild(li);
    });
  }

  /** 検索結果から、プリセットの各項目をできるだけ埋める */
  function applyPresetSuggestion(s) {
    el.pName.value = s.name;
    el.pCat.value = resolveCategory(s.category);
    el.pOsm.value = s.osm || '';
    if (s.heritage) el.pWhc.checked = true;

    // 所在地は「日本 / 都道府県 市区町村」に整える
    const fake = { address: s.address, country: s.country };
    const pref = prefOf(fake);
    if (pref) {
      const rest = String(s.address || '').split(pref)[1] || '';
      const city = (rest.match(/[^\s/,、]+[市区町村郡]/) || [])[0] || '';
      el.pArea.value = `日本 / ${pref}${city ? ' ' + city : ''}`;
      el.pKeys.value = [s.name, city, pref].filter(Boolean).join(' ');
    } else {
      const country = countryOf(fake);
      el.pArea.value = country;
      el.pKeys.value = [s.name, country].filter(Boolean).join(' ');
    }

    if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) setPresetPoint(s.lat, s.lng, true);

    el.presetSuggest.hidden = true;
    el.presetSearch.value = '';
    el.presetSearch.blur();
    toast(`「${s.name}」を読み込みました`);
  }

  // ---- 書き出し・読み込み ----

  // data/presets.csv がプリセットの唯一のソース。js/presets.js は
  // tools/build-presets.mjs がそこから作り直す生成物なので、ここでは
  // 「CSV に貼れる形」で書き出す。

  /* data/presets.csv と同じ列 */
  const CSV_COLUMNS = ['名称', '検索キー', '所在地', '緯度', '経度', '分類', '世界遺産', 'OSM_ID'];

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function csvRow(p) {
    return [p.n, p.k, p.c, p.lat, p.lng, p.cat, p.whc ? 'yes' : '', p.o || '']
      .map(csvCell).join(',');
  }

  /** presets.csv 全体（丸ごと差し替えたいとき用） */
  function presetsCsvText() {
    return `${CSV_COLUMNS.join(',')}\n${activePresets().map(csvRow).join('\n')}\n`;
  }

  /** この端末で足した・直したぶんだけの CSV 行（貼り付け用） */
  function changedCsvText() {
    const rows = [];
    (window.SPOT_PRESETS || []).forEach((p) => {
      const e = overlay.edited[p.n];
      if (e) rows.push(csvRow({ ...p, ...e }));
    });
    overlay.added.forEach((p) => rows.push(csvRow(p)));
    return rows.join('\n');
  }

  async function shareText(text, filename, type) {
    const file = new File([text], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPresets() {
    const text = changedCsvText();
    if (!text) { toast('追加・編集したプリセットがありません'); return; }
    const count = text.split("\n").length;
    try {
      await navigator.clipboard.writeText(text);
      toast(`${count}行コピーしました。data/presets.csv に貼ってください`);
    } catch (err) {
      console.warn('クリップボードに書けませんでした', err);
      toast('コピーできませんでした。書き出しを使ってください');
    }
  }

  function importOverlay(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        overlay = normalizeOverlay(parsed);
        saveOverlay();
        renderDevList();
        toast(`上書き ${overlayCount()} 件を読み込みました`);
      } catch (err) {
        console.error(err);
        toast('読み込めませんでした');
      }
    };
    reader.readAsText(file);
  }

  function resetOverlay() {
    if (!overlayCount()) { toast('上書きはありません'); return; }
    if (!confirm(`プリセットの上書き ${overlayCount()} 件をすべて破棄しますか？`)) return;
    overlay = emptyOverlay();
    saveOverlay();
    renderDevList();
    toast('上書きを破棄しました');
  }

  function bindDev() {
    el.devPresetBtn.addEventListener('click', () => { el.menuList.hidden = true; openDevDialog(); });
    el.devCloseBtn.addEventListener('click', () => el.devDialog.close());
    el.devNewBtn.addEventListener('click', () => openPresetDialog(null));
    el.devFilter.addEventListener('input', renderDevList);

    el.devExportBtn.addEventListener('click', () => shareText(presetsCsvText(), 'presets.csv', 'text/csv'));
    el.devCopyBtn.addEventListener('click', copyPresets);
    el.devOverlayExportBtn.addEventListener('click', () => shareText(
      JSON.stringify(overlay, null, 2), 'presets-overlay.json', 'application/json',
    ));
    el.devOverlayImportBtn.addEventListener('click', () => el.devImportFile.click());
    el.devImportFile.addEventListener('change', () => {
      const f = el.devImportFile.files && el.devImportFile.files[0];
      if (f) importOverlay(f);
      el.devImportFile.value = '';
    });
    el.devResetBtn.addEventListener('click', resetOverlay);
    el.devExitBtn.addEventListener('click', () => { el.devDialog.close(); disableDev(); });

    el.presetForm.addEventListener('submit', savePreset);
    el.presetCancelBtn.addEventListener('click', () => el.presetDialog.close());
    el.pDeleteBtn.addEventListener('click', deletePreset);
    el.pRevertBtn.addEventListener('click', revertPreset);
    el.presetSearch.addEventListener('input', () => runPresetSearch(el.presetSearch.value));
    el.presetSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runPresetSearch(el.presetSearch.value); }
    });
    el.pLat.addEventListener('change', syncPresetCoords);
    el.pLng.addEventListener('change', syncPresetCoords);
  }

  function syncPresetCoords() {
    const lat = parseFloat(el.pLat.value);
    const lng = parseFloat(el.pLng.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setPresetPoint(lat, lng, true);
    else clearPresetPoint();
  }

  // ---------- 利用人数のカウント ----------

  /** 端末ごとに初回起動のときだけ +1 し、以降は読み取りのみ。
      失敗・オフライン時は何も表示しない（アプリの動作には影響させない） */
  async function countUsers() {
    let first = false;
    try { first = !localStorage.getItem(COUNTED_KEY); } catch { first = false; }

    try {
      const res = await fetch(`${COUNTER_BASE}/${first ? 'hit' : 'get'}/${COUNTER_NS}/${COUNTER_KEY}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const n = Number(data && data.value);
      if (!Number.isFinite(n) || n <= 0) return;

      if (first) {
        try { localStorage.setItem(COUNTED_KEY, '1'); } catch { /* 保存できなくても表示はする */ }
      }
      showUserCount(n);
    } catch {
      /* カウンタは飾りなので、つながらなければ黙って出さない */
    }
  }

  function showUserCount(n) {
    el.userCount.textContent = '';
    const strong = document.createElement('b');
    strong.textContent = n.toLocaleString('ja-JP');
    el.userCount.append('これまで ', strong, ' 人がこのアプリを使っています');
    el.userCount.hidden = false;
  }

  // ---------- 分類の編集 ----------

  let paletteTarget = null;

  function openCatDialog() {
    renderCatList();
    el.catNewIcon.value = '📍';
    el.catNewLabel.value = '';
    hidePalette();
    el.catDialog.showModal();
  }

  function countByCategory(value) {
    return items.filter((i) => i.category === value).length;
  }

  function renderCatList() {
    el.catList.innerHTML = '';
    categories.forEach((cat, index) => el.catList.appendChild(catRow(cat, index)));
  }

  function catRow(cat, index) {
    const li = document.createElement('li');
    li.className = 'cat-row';

    const icon = document.createElement('input');
    icon.type = 'text';
    icon.className = 'cat-icon-input';
    icon.maxLength = 4;
    icon.value = cat.icon;
    icon.setAttribute('aria-label', `${cat.label} のアイコン`);
    icon.addEventListener('focus', () => showPalette(icon));
    icon.addEventListener('input', () => {
      cat.icon = icon.value.trim().slice(0, 4) || '📍';
      commitCategories();
    });

    const label = document.createElement('input');
    label.type = 'text';
    label.maxLength = 20;
    label.value = cat.label;
    label.setAttribute('aria-label', '分類名');
    label.addEventListener('focus', hidePalette);
    label.addEventListener('input', () => {
      cat.label = label.value.trim() || '無名の分類';
      commitCategories();
    });

    const tools = document.createElement('div');
    tools.className = 'cat-tools';

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.textContent = countByCategory(cat.value) || '';
    count.title = 'この分類の登録数';
    tools.appendChild(count);

    tools.appendChild(catToolBtn('↑', '上へ', index === 0, () => moveCategory(index, -1)));
    tools.appendChild(catToolBtn('↓', '下へ', index === categories.length - 1, () => moveCategory(index, 1)));

    if (cat.value !== FALLBACK_CATEGORY) {
      tools.appendChild(catToolBtn('🗑', '削除', false, () => deleteCategory(cat)));
    }

    li.append(icon, label, tools);
    return li;
  }

  function catToolBtn(text, title, disabled, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function commitCategories() {
    ensureFallbackCategory();
    saveCategories();
    fillCategorySelects();
    render();
  }

  function moveCategory(index, delta) {
    const to = index + delta;
    if (to < 0 || to >= categories.length) return;
    const [moved] = categories.splice(index, 1);
    categories.splice(to, 0, moved);
    commitCategories();
    renderCatList();
  }

  function addCategory() {
    const label = el.catNewLabel.value.trim();
    if (!label) { el.catNewLabel.focus(); toast('分類名を入力してください'); return; }
    categories.push({
      value: 'cat_' + uid(),
      label,
      icon: el.catNewIcon.value.trim().slice(0, 4) || '📍',
    });
    el.catNewLabel.value = '';
    el.catNewIcon.value = '📍';
    hidePalette();
    commitCategories();
    renderCatList();
    toast(`分類「${label}」を追加しました`);
  }

  function deleteCategory(cat) {
    const used = countByCategory(cat.value);
    const msg = used
      ? `「${cat.label}」を削除すると、${used}件が「その他」になります。よろしいですか？`
      : `分類「${cat.label}」を削除しますか？`;
    if (!confirm(msg)) return;

    categories = categories.filter((c) => c.value !== cat.value);
    ensureFallbackCategory();
    reassignOrphans();
    saveCategories();
    save();
    fillCategorySelects();
    render();
    renderCatList();
    toast('分類を削除しました');
  }

  /** 消えた分類を参照している登録を「その他」に寄せる */
  function reassignOrphans() {
    items.forEach((it) => { it.category = resolveCategory(it.category); });
  }

  function resetCategories() {
    if (!confirm('分類を初期状態に戻しますか？（追加した分類は削除されます）')) return;
    categories = defaultCategories();
    reassignOrphans();
    saveCategories();
    save();
    fillCategorySelects();
    render();
    renderCatList();
    toast('分類を初期状態に戻しました');
  }

  function showPalette(target) {
    paletteTarget = target;
    if (!el.emojiPalette.childElementCount) {
      EMOJI_CHOICES.forEach((emoji) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = emoji;
        b.addEventListener('click', () => {
          if (!paletteTarget) return;
          paletteTarget.value = emoji;
          paletteTarget.dispatchEvent(new Event('input', { bubbles: true }));
        });
        el.emojiPalette.appendChild(b);
      });
    }
    el.emojiPalette.hidden = false;
  }

  function hidePalette() {
    el.emojiPalette.hidden = true;
    paletteTarget = null;
  }

  // ---------- ダイアログ ----------

  function openDialog(id) {
    editingId = id || null;
    const it = id ? items.find((x) => x.id === id) : null;

    el.dialogTitle.textContent = it ? '観光地を編集' : '観光地を追加';
    el.deleteBtn.hidden = !it;
    el.spotSearch.value = '';
    showSuggest([], '');
    editingCountry = it ? it.country : '';

    el.name.value = it ? it.name : '';
    el.category.value = it ? it.category : 'other';
    el.status.value = it ? it.status : 'want';
    el.priority.value = it ? it.priority : 'mid';
    el.heritage.checked = it ? it.heritage : false;
    el.address.value = it ? it.address : '';
    el.hours.value = it ? it.hours : '';
    el.fee.value = it ? it.fee : '';
    el.website.value = it ? it.website : '';
    el.visitDate.value = it ? it.visitDate : '';
    el.note.value = it ? it.note : '';

    el.dialog.showModal();

    // ダイアログが開いてからでないと地図のサイズが取れない
    setTimeout(() => {
      const m = ensurePickMap();
      m.invalidateSize();
      clearPickPoint();
      if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
        setPickPoint(it.lat, it.lng, true);
      } else {
        m.setView([20, 20], 1, { animate: false });
      }
      highlightFilled();
    }, 60);

    if (!it) setTimeout(() => el.spotSearch.focus(), 220);
  }

  function readForm() {
    const lat = parseFloat(el.lat.value);
    const lng = parseFloat(el.lng.value);
    return {
      name: el.name.value.trim() || '（無題）',
      category: el.category.value,
      status: el.status.value,
      priority: el.priority.value,
      heritage: el.heritage.checked,
      address: el.address.value.trim(),
      country: editingCountry,
      hours: el.hours.value.trim(),
      fee: el.fee.value.trim(),
      website: el.website.value.trim(),
      visitDate: el.visitDate.value,
      note: el.note.value.trim(),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  }

  function submitForm(ev) {
    ev.preventDefault();
    const data = readForm();
    const now = new Date().toISOString();

    if (editingId) {
      const idx = items.findIndex((x) => x.id === editingId);
      if (idx >= 0) items[idx] = normalize({ ...items[idx], ...data, updatedAt: now });
      toast('更新しました');
    } else {
      items.unshift(normalize({ ...data, id: uid(), createdAt: now, updatedAt: now }));
      toast('追加しました');
    }
    save();
    render();
    el.dialog.close();
  }

  // ---------- 書き出し・読み込み ----------

  async function exportJson() {
    const json = JSON.stringify({
      app: 'travel-wishlist',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories,
      items,
    }, null, 2);
    const file = new File([json], `travel-wishlist-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '行きたい観光地リスト' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(incoming)) throw new Error('形式が違います');

        // 分類も一緒に取り込む（既存の分類は残し、知らないものだけ足す）
        if (!Array.isArray(parsed) && Array.isArray(parsed.categories)) {
          const knownCats = new Set(categories.map((c) => c.value));
          parsed.categories.map(normalizeCategory).forEach((c) => {
            if (c.value && !knownCats.has(c.value)) {
              categories.push(c);
              knownCats.add(c.value);
            }
          });
          saveCategories();
          fillCategorySelects();
        }

        const known = new Set(items.map((i) => i.id));
        const added = incoming.map(normalize).filter((i) => !known.has(i.id));
        items = added.concat(items);
        save();
        render();
        toast(`${added.length}件を読み込みました`);
      } catch (err) {
        console.error(err);
        toast('読み込めませんでした');
      }
    };
    reader.readAsText(file);
  }

  function addSample() {
    const picks = activePresets().slice(0, 4);
    const now = new Date().toISOString();
    const added = picks.map((p) => normalize({
      id: uid(),
      name: p.n,
      address: p.c,
      country: (p.c.split('/')[0] || '').trim(),
      category: p.cat,
      heritage: !!p.whc,
      lat: p.lat,
      lng: p.lng,
      status: 'want',
      priority: 'mid',
      createdAt: now,
      updatedAt: now,
    }));
    items = added.concat(items);
    save();
    render();
    toast('サンプルを追加しました');
  }

  // ---------- テーマ ----------

  function applyTheme(theme) {
    const t = theme === 'dark' || theme === 'light'
      ? theme
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
    el.themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  // ---------- 初期化 ----------

  function bind() {
    el.tabHome.addEventListener('click', () => showView('home'));
    el.tabList.addEventListener('click', () => showView('list'));
    el.tabArea.addEventListener('click', () => showView('area'));
    el.tabMap.addEventListener('click', () => showView('map'));

    // サマリーの数字もクイックアクセスにする
    el.statBtnTotal.addEventListener('click', () => jumpToList({}));
    el.statBtnHeritage.addEventListener('click', () => jumpToList({ heritage: true }));
    el.statBtnVisited.addEventListener('click', () => jumpToList({ status: 'visited' }));
    el.statBtnAreas.addEventListener('click', () => { el.areaGroupBy.value = 'country'; renderArea(); showView('area'); });

    el.areaGroupBy.addEventListener('change', renderArea);
    el.areaHideVisited.addEventListener('change', renderArea);
    el.fitBtn.addEventListener('click', () => { ensureMap(); map.invalidateSize(); fitAll(); });

    el.addBtn.addEventListener('click', () => openDialog(null));
    el.cancelBtn.addEventListener('click', () => el.dialog.close());
    el.form.addEventListener('submit', submitForm);

    el.deleteBtn.addEventListener('click', () => {
      if (!editingId) return;
      const it = items.find((x) => x.id === editingId);
      if (!it) return;
      if (!confirm(`「${it.name}」を削除しますか？`)) return;
      items = items.filter((x) => x.id !== editingId);
      save();
      render();
      el.dialog.close();
      toast('削除しました');
    });

    // 検索窓：入力するたびに候補を出す（Enter でフォーム送信しない）
    el.spotSearch.addEventListener('input', () => runSearch(el.spotSearch.value));
    el.spotSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimer);
        runSearch(el.spotSearch.value);
      }
    });

    el.lat.addEventListener('change', syncCoordInputs);
    el.lng.addEventListener('change', syncCoordInputs);

    el.geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { toast('現在地を取得できません'); return; }
      toast('現在地を取得中…');
      navigator.geolocation.getCurrentPosition(
        (pos) => setPickPoint(pos.coords.latitude, pos.coords.longitude, true),
        () => toast('現在地を取得できませんでした'),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

    [el.filterText, el.filterStatus, el.filterCategory, el.sortBy].forEach((c) => {
      c.addEventListener('input', render);
      c.addEventListener('change', render);
    });
    el.filterHeritage.addEventListener('change', render);

    el.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = el.menuList.hidden;
      el.menuList.hidden = !open;
      el.menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
      el.menuList.hidden = true;
      el.menuBtn.setAttribute('aria-expanded', 'false');
    });
    el.menuList.addEventListener('click', (e) => e.stopPropagation());

    el.editCatBtn.addEventListener('click', () => { el.menuList.hidden = true; openCatDialog(); });
    el.offlineBtn.addEventListener('click', () => { el.menuList.hidden = true; saveOfflineMap(); });
    window.addEventListener('online', updateOnlineBadge);
    window.addEventListener('offline', updateOnlineBadge);
    el.catCloseBtn.addEventListener('click', () => el.catDialog.close());
    el.catAddBtn.addEventListener('click', addCategory);
    el.catResetBtn.addEventListener('click', resetCategories);
    el.catNewIcon.addEventListener('focus', () => showPalette(el.catNewIcon));
    el.catNewLabel.addEventListener('focus', hidePalette);
    el.catNewLabel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
    });
    el.catDialog.addEventListener('close', hidePalette);

    el.exportBtn.addEventListener('click', () => { el.menuList.hidden = true; exportJson(); });
    el.importBtn.addEventListener('click', () => { el.menuList.hidden = true; el.importFile.click(); });
    el.importFile.addEventListener('change', () => {
      const f = el.importFile.files && el.importFile.files[0];
      if (f) importJson(f);
      el.importFile.value = '';
    });
    el.sampleBtn.addEventListener('click', () => { el.menuList.hidden = true; addSample(); });
    el.clearBtn.addEventListener('click', () => {
      el.menuList.hidden = true;
      if (!items.length) { toast('データがありません'); return; }
      if (!confirm(`登録済みの${items.length}件をすべて削除しますか？`)) return;
      items = [];
      save();
      render();
      toast('すべて削除しました');
    });

    el.themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });

    // iOS でのピンチ拡大を抑止（地図の中は Leaflet に任せる）
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
      document.addEventListener(type, (e) => {
        const t = e.target;
        if (t instanceof Element && t.closest('.leaflet-container')) return;
        e.preventDefault();
      }, { passive: false });
    });
  }

  function syncCoordInputs() {
    const lat = parseFloat(el.lat.value);
    const lng = parseFloat(el.lng.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setPickPoint(lat, lng, true);
    else clearPickPoint();
  }

  function init() {
    fillSelect(el.status, STATUSES);
    fillSelect(el.priority, PRIORITIES.map((p) => ({ value: p.value, label: '優先度 ' + p.label })));
    fillSelect(el.filterStatus, STATUSES, { value: '', label: 'すべての状態' });

    applyTheme(localStorage.getItem(THEME_KEY));
    loadCategories();   // 分類は登録データより先に読む（normalize が参照するため）
    initDev();          // プリセットの上書きも、検索より先に読む
    fillCategorySelects();
    load();
    bind();
    bindDev();
    buildQuickGrid();
    render();
    updateOnlineBadge();
    showView('home');
    countUsers();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW登録に失敗', err));
      });
    }
  }

  init();
})();
