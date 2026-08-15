/* 行きたい観光地リスト — localStorage だけで動く単一ページアプリ
   検索は OpenStreetMap Nominatim + 内蔵プリセット、地図は Leaflet + OSM タイル */
(() => {
  'use strict';

  const STORAGE_KEY = 'travel-wishlist.items.v1';
  const THEME_KEY = 'travel-wishlist.theme';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  const CATEGORIES = [
    { value: 'heritage', label: '遺跡・史跡', icon: '🏛️' },
    { value: 'monument', label: '建造物・名所', icon: '🗿' },
    { value: 'temple',   label: '寺社・教会',   icon: '⛩️' },
    { value: 'castle',   label: '城・宮殿',     icon: '🏰' },
    { value: 'museum',   label: '博物館・美術館', icon: '🖼️' },
    { value: 'nature',   label: '自然・絶景',   icon: '🏔️' },
    { value: 'park',     label: '公園・庭園',   icon: '🌳' },
    { value: 'city',     label: '街・エリア',   icon: '🏙️' },
    { value: 'other',    label: 'その他',       icon: '📍' },
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
    tabList: $('#tabList'),
    tabMap: $('#tabMap'),
    listView: $('#listView'),
    mapView: $('#mapView'),
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

  function normalize(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    return {
      id: String(o.id || uid()),
      name: String(o.name || '（無題）'),
      category: CATEGORIES.some((c) => c.value === o.category) ? o.category : 'other',
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
  const catOf = (v) => CATEGORIES.find((c) => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

  function fillSelect(select, options, extra) {
    select.innerHTML = '';
    if (extra) select.appendChild(new Option(extra.label, extra.value));
    options.forEach((o) => select.appendChild(new Option(o.label, o.value)));
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
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
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
    const isMap = which === 'map';
    el.listView.classList.toggle('is-active', !isMap);
    el.mapView.classList.toggle('is-active', isMap);
    el.tabList.classList.toggle('is-active', !isMap);
    el.tabMap.classList.toggle('is-active', isMap);
    el.tabList.setAttribute('aria-selected', String(!isMap));
    el.tabMap.setAttribute('aria-selected', String(isMap));
    if (isMap) {
      ensureMap();
      setTimeout(() => map.invalidateSize(), 50);
    }
  }

  // ダイアログ内の位置指定マップ
  function ensurePickMap() {
    if (pickMap) return pickMap;
    pickMap = L.map('pickMap', { zoomControl: true, attributionControl: false })
      .setView([35.68, 139.76], 2);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(pickMap);
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
    return (window.SPOT_PRESETS || [])
      .filter((p) => normText(p.n).includes(nq) || normText(p.k).includes(nq) || normText(p.c).includes(nq))
      .slice(0, 6)
      .map((p) => ({
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
      }));
  }

  function osmCategory(r) {
    const t = `${r.class || ''}/${r.type || ''}`.toLowerCase();
    const et = r.extratags || {};
    if (/castle|palace|fort|citadel/.test(t)) return 'castle';
    if (/place_of_worship|temple|shrine|church|cathedral|monastery|mosque|chapel/.test(t)) return 'temple';
    if (/museum|gallery|artwork/.test(t)) return 'museum';
    if (/archaeological_site|ruins|city_gate|tomb/.test(t)) return 'heritage';
    if (/monument|memorial|tower|attraction|viewpoint|bridge|lighthouse/.test(t)) return 'monument';
    if (/park|garden|zoo|theme_park/.test(t)) return 'park';
    if (/natural|volcano|peak|waterfall|water|bay|island|glacier|cave|beach|forest|nature_reserve|national_park/.test(t)) return 'nature';
    if (/city|town|village|suburb|neighbourhood|hamlet|region|state|county|administrative/.test(t)) return 'city';
    if (et.heritage) return 'heritage';
    return 'other';
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
    };
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
      n.appendChild(document.createTextNode(s.name));
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

    // Nominatim の利用規約に配慮して 600ms のデバウンス（連打しない）
    el.searchSpinner.hidden = false;
    searchTimer = setTimeout(async () => {
      const url = new URL(NOMINATIM);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('extratags', '1');
      url.searchParams.set('namedetails', '1');
      url.searchParams.set('limit', '8');
      url.searchParams.set('accept-language', 'ja');

      searchAbort = new AbortController();
      try {
        const res = await fetch(url, { signal: searchAbort.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const remote = (Array.isArray(data) ? data : []).map(toSuggestion).filter((s) => s.name);
        searchCache.set(query, remote);
        const all = merge(local, remote);
        showSuggest(all, all.length ? '' : '該当する場所が見つかりませんでした。名称を手入力してもOKです。');
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('検索に失敗しました', err);
        showSuggest(local, local.length ? '' : 'オフラインのため候補を取得できません。手入力してください。');
      } finally {
        el.searchSpinner.hidden = true;
        searchAbort = null;
      }
    }, 600);
  }

  function merge(local, remote) {
    const seen = new Set(local.map((s) => normText(s.name)));
    return local.concat(remote.filter((s) => {
      const k = normText(s.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
  }

  function applySuggestion(s) {
    el.name.value = s.name;
    el.address.value = s.address || '';
    editingCountry = s.country || (s.address || '').split(',').pop().trim();
    el.category.value = s.category || 'other';
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

    // プリセット選択時は、営業時間などを OSM から補完する
    if (s.source === 'preset') enrichFromOsm(s.name);
  }

  async function enrichFromOsm(name) {
    try {
      const url = new URL(NOMINATIM);
      url.searchParams.set('q', name);
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
      const s = toSuggestion(data[0]);
      if (!el.hours.value && s.hours) el.hours.value = s.hours;
      if (!el.fee.value && s.fee) el.fee.value = s.fee;
      if (!el.website.value && s.website) el.website.value = s.website;
      if (s.heritage) el.heritage.checked = true;
      highlightFilled();
    } catch { /* 補完は失敗しても無視 */ }
  }

  function highlightFilled() {
    [el.name, el.address, el.hours, el.fee, el.website].forEach((input) => {
      const field = input.closest('.field');
      if (field) field.classList.toggle('auto-filled', !!input.value);
    });
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
    const json = JSON.stringify({ app: 'travel-wishlist', version: 1, exportedAt: new Date().toISOString(), items }, null, 2);
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
    const picks = (window.SPOT_PRESETS || []).slice(0, 4);
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
    el.tabList.addEventListener('click', () => showView('list'));
    el.tabMap.addEventListener('click', () => showView('map'));
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
    fillSelect(el.category, CATEGORIES);
    fillSelect(el.status, STATUSES);
    fillSelect(el.priority, PRIORITIES.map((p) => ({ value: p.value, label: '優先度 ' + p.label })));
    fillSelect(el.filterStatus, STATUSES, { value: '', label: 'すべての状態' });
    fillSelect(el.filterCategory, CATEGORIES, { value: '', label: 'すべての分類' });

    applyTheme(localStorage.getItem(THEME_KEY));
    load();
    bind();
    render();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW登録に失敗', err));
      });
    }
  }

  init();
})();
