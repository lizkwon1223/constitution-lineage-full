/* 제헌헌법 조문 계보 지도. 계산된 JSON(data/)을 읽어 그리기만 함. */
(async function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const LANES = [
    { id: "foreign", label: "외국 헌법", h: 0.40 },
    { id: "domestic", label: "국내 문헌", h: 0.38 },
    { id: "drafting", label: "유진오–제헌 과정", h: 0.22 },
  ];
  const displayLane = n => ['provisional', 'liberation'].includes(n.lane) ? 'domestic' : n.lane;
  // 자료는 data/*.js를 <script>로 읽음(파일을 더블클릭해 file://로 열어도 작동)
  const store = (window.__LINEAGE__ = window.__LINEAGE__ || {});
  const load = (n) => new Promise((resolve, reject) => {
    if (store[n]) return resolve(store[n]);
    const s = document.createElement("script");
    s.src = `data/${n}.js`;
    s.onload = () => (store[n] ? resolve(store[n]) : reject(new Error(`data/${n}.js`)));
    s.onerror = () => reject(new Error(`data/${n}.js`));
    document.head.appendChild(s);
  });
  // 설정: 켤 화면과 조문 본문 표시 여부. 공개판은 index.html에서 window.LINEAGE_CONFIG로 바꿈.
  const CFG = Object.assign({ views: ["global", "overview", "yujino", "article", "sankey", "library", "memo", "document", "completion"], texts: true }, window.LINEAGE_CONFIG || {});
  const hasYujino = CFG.views.includes("yujino");
  let nodes, links, yj = { linksB: [], top10: {}, finalChapters: [] }, evidence, summary = null, labels = {};
  try {
    if (typeof d3 === "undefined") throw new Error("D3 라이브러리(인터넷의 cdn.jsdelivr.net)");
    [nodes, links, evidence] = await Promise.all(["nodes", "links", "evidence"].map(load));
    if (hasYujino) [yj, summary] = await Promise.all(["yujino", "summary"].map(load));
    if (!CFG.texts || hasYujino) labels = await load("labels");   // 조문 번호(본문 없는 공개판, 유진오 화면의 툴팁·목록)
  } catch (err) {
    $("#panel").innerHTML = `<h2>자료를 불러오지 못함</h2><p>${err.message}을(를) 읽지 못함. index.html과 같은 폴더에 data 폴더가 있는지, 인터넷에 연결되어 있는지 확인해 주세요.</p>`;
    return;
  }
  const idx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
  const YI = idx.YU_DRAFT, CI = idx.KR1948;
  const nodeColor = (i) => (i >= 0 && nodes[i].slot ? `var(--e${nodes[i].slot})` : "var(--node-neutral)");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 조문 ID → 노드 번호
  const uidNode = {};
  const note = (L) => { uidNode[L.t] = L.n; if (L.p) uidNode[L.p[1]] = L.p[0]; L.k.forEach((k) => (uidNode[k[3]] = k[0])); };
  links.forEach(note); yj.linksB.forEach(note);
  Object.values(yj.top10).forEach((m) => Object.values(m).forEach((rows) => rows.forEach((r) => (uidNode[r[0]] = r[1]))));
  const articleCache = {};
  async function arts(i) { const id = nodes[i].id; if (!articleCache[id]) articleCache[id] = await load(`articles/${id}`); return articleCache[id]; }

  // 근거: 해설·사료 관계, 참조메모(초고 조문 → 문헌)
  const documented = new Map(evidence.documented.map((d) => [`${d.s}>${d.t}`, d]));
  const memoByNode = d3.group(evidence.memo, (m) => m.node);
  const memoKey = new Set(evidence.memo.map((m) => `${m.draft}|${m.node}`));

  // mode(유진오 화면): without = 초고 제외, with = 초고 포함, handover = 초고 포함 + 넘겨받기 띠만 진하게
  const state = { view: "global", mode: "with", floor: 0.6, minCount: 3, topN: 3, lanes: new Set(LANES.map((l) => l.id)),
                  sel: null, sk: "all", skMode: "with", focusDoc: "KR1947", focusMode: "without", weight: "count", sub: "network", article: 8, completionArticle:1, completionTab:"articles" };
  const isDraftToFinal = (e) => e.s === YI && e.t === CI;
  const edgeColor = (e) => (isDraftToFinal(e) ? "var(--focus)" : nodeColor(e.s));   // 초고 → 제헌헌법 선만 검정

  // ── 계산: 하한별 1위 문헌 ──────────────────────────────────────
  const primary = (L, f) => (L.p && L.p[2] >= f ? L.p : null);
  function globalEdges(f) {
    const m = new Map();
    const get = (s, t) => { const k = `${s}>${t}`; if (!m.has(k)) m.set(k, { s, t, count: 0, top5: 0, cos: [], pairs: [] }); return m.get(k); };
    const tcount = new Map();
    for (const L of links) {
      tcount.set(L.n, (tcount.get(L.n) || 0) + 1);
      const p = primary(L, f);
      if (p) { const e = get(p[0], L.n); e.count++; e.cos.push(p[2]); e.pairs.push([L.t, p[1], p[2]]); }
      for (const k of L.k) if (k[2] >= f) get(k[0], L.n).top5++;
    }
    const out = [...m.values()].filter((e) => e.count > 0);
    out.forEach((e) => { e.targets = tcount.get(e.t); e.mean = d3.mean(e.cos); e.doc = documented.get(`${e.s}>${e.t}`) || null;
      e.memo = e.t === YI ? (memoByNode.get(e.s) || []) : []; e.evidence = !!e.doc || e.memo.length > 0; });
    return out;
  }
  const sumFloor = (key, f) => summary[key].find((s) => Math.abs(s.floor - f) < 1e-9);

  // ── 화면 ──────────────────────────────────────────────────
  const svg = d3.select("#chart");
  const zoomLayer = svg.append("g");
  const gGlobal = zoomLayer.append("g");   // 전체 지도
  const gLanes = gGlobal.append("g"), gAxis = gGlobal.append("g").attr("class", "axis");
  const gEdges = gGlobal.append("g"), gNodes = gGlobal.append("g");
  const gBand = zoomLayer.append("g").attr("display", "none");   // 유진오 중심(띠)
  const gBandLinks = gBand.append("g"), gBandBlocks = gBand.append("g"), gBandText = gBand.append("g");
  const gCaption = svg.append("g").attr("display", "none");   // 확대해도 움직이지 않는 설명 줄
  let bandSel = null;   // 유진오 화면에서 누른 것: { u } 띠, { cat } 왼쪽 막대, { ch } 장, { draft } 초고 막대
  const zoom = d3.zoom().scaleExtent([0.4, 6]).on("zoom", (e) => zoomLayer.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (e) => {
    if (e.target !== svg.node()) return;
    state.sel = null; highlight(null);
    if (bandSel) { bandSel = null; bandHighlight(); v4.syncSelection(); }
    showPanel();
  });
  const tip = $("#tip");
  const moveTip = (e) => { const r = $("#stage").getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(e.clientX - r.left + 14, r.width - 310)) + "px"; tip.style.top = e.clientY - r.top + $("#stage").scrollTop + 14 + "px"; };
  const showTip = (e, html) => { tip.innerHTML = html; tip.style.display = "block"; moveTip(e); };
  const hideTip = () => (tip.style.display = "none");
  const canAnimate = () => !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 1000, H = 700, M = { l: 150, r: 36, t: 44, b: 16 };
  const gpos = {};
  // 시간축: 1918년 이전은 두 구간으로 압축, 1946~1948년은 넓힘
  const SEG = [[1785, 1860, 0, 0.07], [1860, 1918.5, 0.07, 0.21], [1918.5, 1945.8, 0.21, 0.42], [1945.8, 1948.75, 0.42, 1]];
  const xFrac = (y) => { for (const [a, b, x0, x1] of SEG) if (y <= b) return x0 + ((Math.max(y, a) - a) / (b - a)) * (x1 - x0); return 1; };
  const X = (y) => M.l + xFrac(y) * (W - M.l - M.r);

  function layoutGlobal() {
    const r = svg.node().getBoundingClientRect(); W = Math.max(r.width, 640); H = Math.max(r.height, 420);
    let y0 = M.t;
    const bandH = H - M.t - M.b;
    LANES.forEach((lane) => {
      lane.y0 = y0; lane.y1 = y0 + lane.h * bandH; y0 = lane.y1;
      const ns = nodes.map((n, i) => i).filter((i) => displayLane(nodes[i]) === lane.id).sort((a, b) => nodes[a].year - nodes[b].year);
      const rows = [];
      ns.forEach((i) => {
        const x = X(nodes[i].year);
        let k = rows.findIndex((last) => x - last >= 96);
        if (k < 0) { rows.push(x); k = rows.length - 1; } else rows[k] = x;
        gpos[i] = { x, row: k };
      });
      const n = Math.max(rows.length, 1);
      ns.forEach((i) => { gpos[i].y = lane.y0 + ((gpos[i].row + 0.5) / n) * (lane.y1 - lane.y0) - 6; });
    });
  }

  function drawFrame() {
    gLanes.selectAll("*").remove(); gAxis.selectAll("*").remove();
    if (state.view !== "global") return;
    LANES.forEach((lane, k) => {
      gLanes.append("rect").attr("x", 0).attr("y", lane.y0).attr("width", W).attr("height", lane.y1 - lane.y0)
        .attr("fill", k % 2 ? "transparent" : "var(--lane)");
      gLanes.append("text").attr("class", "lane-label").attr("x", 12).attr("y", (lane.y0 + lane.y1) / 2).attr("dy", "0.35em").text(lane.label);
    });
    const ticks = [[1787, "1787"], [1850, "1850"], [1889, "1889"], [1919, "1919"], [1936, "1936"],
      [1946, "1946"], [1946.5, "46.7"], [1947, "1947"], [1947.5, "47.7"], [1948, "1948"], [1948.5, "48.7"]];
    gAxis.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", M.t - 14).attr("y2", M.t - 14);
    ticks.forEach(([y, t]) => {
      gAxis.append("line").attr("x1", X(y)).attr("x2", X(y)).attr("y1", M.t - 18).attr("y2", H - M.b).attr("stroke", "var(--grid)").attr("stroke-dasharray", "2 4");
      gAxis.append("text").attr("x", X(y)).attr("y", M.t - 22).attr("text-anchor", "middle").text(t);
    });
  }

  const curve = (a, b, ra = 9, rb = 9) => {
    const x0 = a.x + ra, x1 = b.x - rb, dx = Math.max((x1 - x0) / 2, 30);
    return `M${x0},${a.y}C${x0 + dx},${a.y} ${x1 - dx},${b.y} ${x1},${b.y}`;
  };
  const rad = (i) => (i === YI || i === CI ? 12 : 8.5);

  function drawNodes(visible, pos, animate) {
    const sel = gNodes.selectAll("g.node").data(nodes, (d) => d.id);
    const enter = sel.enter().append("g").attr("class", "node").style("cursor", "pointer")
      .attr("transform", (d, i) => `translate(${(pos[i] || gpos[i]).x},${(pos[i] || gpos[i]).y})`);
    enter.append("circle").attr("r", (d, i) => rad(i)).attr("fill", (d, i) => nodeColor(i))
      .attr("stroke", (d, i) => (i === YI ? "var(--focus)" : "var(--surface)")).attr("stroke-width", (d, i) => (i === YI ? 3 : 1.5));
    enter.append("text").attr("class", "node-label").attr("text-anchor", "middle").attr("y", (d, i) => rad(i) + 14)
      .attr("font-weight", (d, i) => (i === YI || i === CI ? 700 : 400)).text((d) => d.mapLabel);
    enter.append("text").attr("class", "node-date").attr("text-anchor", "middle").attr("y", (d, i) => rad(i) + 26).text((d) => d.dateShort);
    enter.append("title").text((d) => `${d.label} (${d.dateLabel})`);
    enter.on("click", (e, d) => { e.stopPropagation(); onNode(idx[d.id]); })
      .on("mouseenter", (e, d) => { if (state.view === "global" && state.sel === null) highlight({ node: idx[d.id] }); })
      .on("mouseleave", () => { if (state.view === "global" && state.sel === null) highlight(null); });
    const all = enter.merge(sel);
    const t = animate ? all.transition().duration(650).ease(d3.easeCubicInOut) : all;
    t.attr("transform", (d, i) => `translate(${(pos[i] || gpos[i]).x},${(pos[i] || gpos[i]).y})`)
      .style("opacity", (d, i) => (visible.has(i) ? 1 : 0));
    all.style("pointer-events", (d, i) => (visible.has(i) ? "auto" : "none"));
  }

  // ── 전체 지도 ─────────────────────────────────────────────────
  let gEdgesData = [];
  function renderGlobal(animate) {
    gBand.attr("display", "none"); gCaption.attr("display", "none"); gGlobal.attr("display", null);
    layoutGlobal(); drawFrame();
    const all = globalEdges(state.floor);
    // 굵기: 조문 수(1위 대응 조문 수) 또는 비율(그 수 ÷ 도착 문헌의 대상 조문 수)
    const wv = (e) => (state.weight === "share" ? e.count / e.targets : e.count);
    const maxW = d3.max(all, wv) || 1;
    const wScale = (e) => 1 + 13 * Math.sqrt(wv(e) / maxW);
    let vis = all.filter((e) => e.count >= state.minCount && state.lanes.has(displayLane(nodes[e.s])) && state.lanes.has(displayLane(nodes[e.t])));
    const byT = d3.group(vis, (e) => e.t);
    vis = [...byT.values()].flatMap((es) => es.sort((a, b) => b.count - a.count).slice(0, state.topN));
    vis.sort((a, b) => b.count - a.count);
    gEdgesData = vis;
    const visibleNodes = new Set(nodes.map((n, i) => i).filter((i) => state.lanes.has(displayLane(nodes[i]))));
    const sel = gEdges.selectAll("path.edge").data(vis, (e) => `${e.s}>${e.t}`);
    sel.exit().interrupt().remove();
    const ent = sel.enter().append("path").attr("class", "edge").style("opacity", 0)
      .on("mouseenter", (ev, e) => { showTip(ev, `<b>${esc(nodes[e.s].label)} → ${esc(nodes[e.t].label)}</b><br>1위 대응 ${e.count}조 (대상 ${e.targets}조의 ${pct(e.count, e.targets)}%) · 상위5 등장 ${e.top5}<br>평균 코사인 ${e.mean.toFixed(3)}${e.evidence ? "<br>참조메모·해설 기록 있음" : ""}`); })
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip)
      .on("click", (ev, e) => { ev.stopPropagation(); state.sel = { edge: e }; highlight({ edge: e }); panelEdge(e); });
    const merged = ent.merge(sel);
    (animate ? merged.transition().duration(500) : merged)
      .attr("d", (e) => curve(gpos[e.s], gpos[e.t])).attr("stroke", edgeColor)
      .attr("stroke-width", wScale).style("opacity", (e) => (e.evidence || isDraftToFinal(e) ? 0.85 : 0.42));
    drawNodes(visibleNodes, gpos, animate);
    highlight(state.sel);
  }
  function highlight(h) {
    if (state.view !== "global") return;
    gEdges.selectAll("path.edge").style("opacity", (e) => {
      if (!h) return e.evidence || isDraftToFinal(e) ? 0.85 : 0.42;
      if (h.edge) return e === h.edge ? 1 : 0.06;
      return e.s === h.node || e.t === h.node ? 0.95 : 0.06;
    });
    gNodes.selectAll("g.node").select("circle").attr("opacity", (d, i) => {
      if (!h) return 1;
      if (h.edge) return i === h.edge.s || i === h.edge.t ? 1 : 0.25;
      return i === h.node || gEdgesData.some((e) => (e.s === h.node && e.t === i) || (e.t === h.node && e.s === i)) ? 1 : 0.25;
    });
  }

  // ── 유진오 중심 화면: 띠 1개 = 제헌헌법 조문 1개 ───────────────────────────
  // 띠의 왼쪽 끝은 그 조문을 거슬러 올라간 선행 문헌임. 초고 제외면 B의 1위 문헌. 초고 포함이면 C의 1위가 초고인 조문은
  // 그 초고 조문의 A 1위 문헌, 나머지는 C의 1위 문헌. 초고 제외 → 포함으로 바꾸면 ① 띠가 왼쪽 끝을 둔 채 초고로 휘어
  // 들어가고 ② 왼쪽 끝이 다른 문헌인 띠만 옮겨 감. 초고를 지나가면서 옮겨 가지 않는 띠가 넘겨받기임.
  const WEAK = -1, OTHER = -2;
  const Bmap = new Map(yj.linksB.map((L) => [L.t, L])), Gmap = new Map(links.map((L) => [L.t, L]));
  const CHAPTERS = (yj.finalChapters || []).map(([key, uids], i) => ({ key, uids, label: `제${i + 1}장 ${key}` }));
  const lab = (uid) => labels[uid] || uid;
  const bandCache = {};
  function bandData(f) {
    if (bandCache[f]) return bandCache[f];
    const out = [];
    CHAPTERS.forEach((ch, ci) => ch.uids.forEach((u, no) => {
      const LB = Bmap.get(u), LC = Gmap.get(u);
      const b = primary(LB, f), c = primary(LC, f);
      const viaDraft = !!c && c[0] === YI;
      const LA = LC.p[0] === YI ? Gmap.get(LC.p[1]) : null;
      const a = viaDraft ? primary(LA, f) : null;
      const switched = viaDraft && !!b, handover = switched && !!a && a[0] === b[0];
      out.push({ u, ch: ci, no, bRaw: LB.p, cRaw: LC.p, aRaw: LA ? LA.p : null, b, c, a, viaDraft, switched, handover,
                 same: handover && a[1] === b[1], bSrc: b ? b[0] : WEAK, cSrc: viaDraft ? (a ? a[0] : WEAK) : c ? c[0] : WEAK });
    }));
    return (bandCache[f] = out);
  }
  function bandStats(bands) {
    const via = bands.filter((d) => d.viaDraft);
    return { total: bands.length, nY: via.length, sw: bands.filter((d) => d.switched).length, elig: bands.filter((d) => d.b).length,
             ho: bands.filter((d) => d.handover).length, same: bands.filter((d) => d.same).length, used: new Set(via.map((d) => d.c[1])).size };
  }
  // 왼쪽 막대: 초고 제외·포함 어느 쪽에서든 띠가 2개 이상인 문헌은 따로, 나머지는 '기타'. 시간순, 끝에 기타·대응 약함.
  function bandCats(bands) {
    const nB = d3.rollup(bands, (v) => v.length, (d) => d.bSrc), nC = d3.rollup(bands, (v) => v.length, (d) => d.cSrc);
    const srcs = [...new Set([...nB.keys(), ...nC.keys()])].filter((s) => s !== WEAK).sort((a, b) => nodes[a].year - nodes[b].year);
    const shown = new Set(srcs.filter((s) => Math.max(nB.get(s) || 0, nC.get(s) || 0) >= 2));
    const order = srcs.filter((s) => shown.has(s)), others = srcs.filter((s) => !shown.has(s));
    if (others.length) order.push(OTHER);
    if (nB.has(WEAK) || nC.has(WEAK)) order.push(WEAK);
    return { order, others, cat: (s) => (s === WEAK ? WEAK : shown.has(s) ? s : OTHER) };
  }
  const catName = (c) => (c === WEAK ? "대응 약함" : c === OTHER ? "기타" : nodes[c].mapLabel);
  const catFull = (c) => (c >= 0 ? nodes[c].label : catName(c));
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const catColor = (c) => cssVar(c === WEAK ? "--weak" : c === OTHER || !nodes[c].slot ? "--node-neutral" : `--e${nodes[c].slot}`);
  const srcText = (p) => (p ? `${nodes[p[0]].mapLabel} ${lab(p[1])}` : "대응 약함");
  function statusText(d) {
    if (d.handover) return d.same ? "넘겨받기(같은 조문)" : "넘겨받기(같은 문헌의 다른 조문)";
    if (d.switched) return d.a ? "초고로 전환 · 선행 문헌 불일치" : "초고로 전환 · A의 대응 약함";
    if (d.viaDraft) return "초고 제외 때 대응 약함 → 초고";
    if (!d.c) return "초고 밖, 대응 약함";
    return d.b && d.b[0] === d.c[0] ? "초고 밖, 그대로" : "초고 밖, 초고를 넣자 1위 문헌이 바뀜";
  }
  const shortStatus = (d) => (d.handover ? "문헌 일치" : d.switched ? d.a ? "문헌 불일치" : "A 대응 약함" : d.viaDraft ? "B 대응 약함" : d.c ? "초고 외 문헌" : "C 대응 약함");

  // 띠 모양: 모든 띠를 곡선 세 조각(왼쪽 → 초고 막대 왼쪽 → 초고 막대 오른쪽 → 오른쪽)으로 써서 단계 사이에 모양이 부드럽게 바뀌게 함
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function splitCubic(p, t) {
    const a = lerp2(p[0], p[1], t), b = lerp2(p[1], p[2], t), c = lerp2(p[2], p[3], t);
    const ab = lerp2(a, b, t), bc = lerp2(b, c, t), m = lerp2(ab, bc, t);
    return [[p[0], a, ab, m], [m, bc, c, p[3]]];
  }
  function tAtX(p, x) {   // x가 커지기만 하는 곡선에서 x에 닿는 t(이분법)
    let lo = 0, hi = 1;
    for (let k = 0; k < 32; k++) {
      const t = (lo + hi) / 2, s = 1 - t;
      const xt = s * s * s * p[0][0] + 3 * s * s * t * p[1][0] + 3 * s * t * t * p[2][0] + t * t * t * p[3][0];
      if (xt < x) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }
  const fmt = (q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`;
  const pathOf = (segs) => `M${fmt(segs[0][0])}` + segs.map((s) => `C${fmt(s[1])} ${fmt(s[2])} ${fmt(s[3])}`).join("");
  function directPath(x0, y0, x3, y3, xa, xb) {   // 곧장 가는 띠: 곡선 하나를 초고 막대의 두 x에서 나눔
    const k = (x3 - x0) / 2, p = [[x0, y0], [x0 + k, y0], [x3 - k, y3], [x3, y3]];
    const t1 = tAtX(p, xa), t2 = tAtX(p, xb);
    const [s1, rest] = splitCubic(p, t1), [s2, s3] = splitCubic(rest, (t2 - t1) / (1 - t1));
    return pathOf([s1, s2, s3]);
  }
  function routedPath(x0, y0, xa, ya, xb, yb, x3, y3) {   // 초고 막대를 지나가거나 막대 위·아래로 비켜 가는 띠
    const k1 = (xa - x0) / 2, k3 = (x3 - xb) / 2;
    return pathOf([[[x0, y0], [x0 + k1, y0], [xa - k1, ya], [xa, ya]],
      [[xa, ya], [xa + (xb - xa) / 3, ya + (yb - ya) / 3], [xb - (xb - xa) / 3, yb - (yb - ya) / 3], [xb, yb]],
      [[xb, yb], [xb + k3, yb], [x3 - k3, y3], [x3, y3]]]);
  }

  // 배치. stage: B = 초고 제외, M = 초고를 지나가되 왼쪽 끝은 B 그대로(애니메이션 중간), C = 초고 포함
  const BD = { top: 88, bottom: 22, gap: 8, bw: 10, dw: 14 };
  function bandLayout(bands, cats, stage) {
    const { top, gap, bw, dw } = BD, colH = H - BD.bottom - top;
    const xL = Math.round(Math.max(158, Math.min(220, W * 0.16)));
    const xR = Math.round(W - Math.max(175, Math.min(230, W * 0.17)) - bw);
    const xM = Math.round((xL + bw + xR) / 2 - dw / 2);
    const u = Math.max(1.5, Math.min(8, (colH - Math.max(cats.order.length - 1, CHAPTERS.length - 1) * gap) / bands.length));
    const P = Object.fromEntries(bands.map((d) => [d.u, {}]));
    const catIdx = new Map(cats.order.map((c, i) => [c, i]));
    // 오른쪽: 장 안에서 초고 제외 때의 왼쪽 막대 순서 → 조문 번호. 어느 단계에서나 같은 자리.
    let y = top + (colH - (bands.length * u + (CHAPTERS.length - 1) * gap)) / 2;
    const right = CHAPTERS.map((ch, ci) => {
      const bs = bands.filter((d) => d.ch === ci).sort((p, q) => catIdx.get(cats.cat(p.bSrc)) - catIdx.get(cats.cat(q.bSrc)) || p.no - q.no);
      const y0 = y;
      bs.forEach((d, i) => (P[d.u].yR = y0 + (i + 0.5) * u));
      y += bs.length * u + gap;
      return { ci, y0, y1: y0 + bs.length * u, n: bs.length };
    });
    // 왼쪽: 단계의 왼쪽 끝 문헌별 막대
    const leftCat = (d) => cats.cat(stage === "C" ? d.cSrc : d.bSrc);
    const n = d3.rollup(bands, (v) => v.length, leftCat);
    const k = cats.order.filter((c) => n.get(c)).length;
    y = top + (colH - (bands.length * u + (k - 1) * gap)) / 2;
    const left = new Map();
    cats.order.forEach((c) => { const h = (n.get(c) || 0) * u; left.set(c, { y0: y, y1: y + h, n: n.get(c) || 0 }); if (h) y += h + gap; });
    // 가운데: 초고를 지나가는 띠는 초고 막대로, 나머지는 막대 위·아래로 비켜 감(초고 제외 단계에서는 막대 높이 0)
    const via = (d) => stage !== "B" && d.viaDraft;
    const D = bands.filter(via), R = bands.filter((d) => !via(d));
    let draft = { y0: top + colH / 2, y1: top + colH / 2 };
    if (stage !== "B") {
      const mid = (d) => { const b = left.get(leftCat(d)); return ((b.y0 + b.y1) / 2 + P[d.u].yR) / 2; };
      const yc = top + colH / 2;
      const above = R.filter((d) => mid(d) < yc).sort((p, q) => mid(p) - mid(q));
      const below = R.filter((d) => mid(d) >= yc).sort((p, q) => mid(p) - mid(q));
      y = top + (colH - (bands.length * u + (above.length ? gap : 0) + (below.length ? gap : 0))) / 2;
      above.forEach((d, i) => (P[d.u].yM = y + (i + 0.5) * u));
      y += above.length * u + (above.length ? gap : 0);
      draft = { y0: y, y1: y + D.length * u };
      y = draft.y1 + (below.length ? gap : 0);
      below.forEach((d, i) => (P[d.u].yM = y + (i + 0.5) * u));
    }
    // 왼쪽 막대 안의 순서: 위로 비켜 가는 띠 → 초고로 가는 띠 → 아래로 비켜 가는 띠(각각 다음 지점의 높이 순)
    const grp = (d) => (P[d.u].yM == null ? 1 : P[d.u].yM < draft.y0 ? 0 : 2);
    const nextY = (d) => (P[d.u].yM == null ? P[d.u].yR : P[d.u].yM);
    d3.group(bands, leftCat).forEach((bs, c) => {
      bs.sort((p, q) => grp(p) - grp(q) || nextY(p) - nextY(q) || p.ch - q.ch || p.no - q.no);
      bs.forEach((d, i) => (P[d.u].yL = left.get(c).y0 + (i + 0.5) * u));
    });
    // 초고 막대: 들어오는 쪽은 왼쪽 순서, 나가는 쪽은 오른쪽 순서(막대 안에서 순서가 바뀜)
    D.slice().sort((p, q) => P[p.u].yL - P[q.u].yL).forEach((d, i) => (P[d.u].yIn = draft.y0 + (i + 0.5) * u));
    D.slice().sort((p, q) => P[p.u].yR - P[q.u].yR).forEach((d, i) => (P[d.u].yOut = draft.y0 + (i + 0.5) * u));
    const x0 = xL + bw, x3 = xR, xa = xM, xb = xM + dw;
    bands.forEach((d) => {
      const p = P[d.u];
      p.cat = leftCat(d); p.via = via(d);
      p.path = p.via ? routedPath(x0, p.yL, xa, p.yIn, xb, p.yOut, x3, p.yR)
        : p.yM != null ? routedPath(x0, p.yL, xa, p.yM, xb, p.yM, x3, p.yR)
        : directPath(x0, p.yL, x3, p.yR, xa, xb);
    });
    return { stage, P, left, right, draft, u, xL, xR, xM, top, colH, nDraft: D.length };
  }
  // 이름표가 겹치지 않게 세로로 벌림
  function spread(items, minGap, lo, hi) {
    const vis = items.filter((d) => d.n > 0).sort((a, b) => a.y - b.y);
    for (let i = 1; i < vis.length; i++) vis[i].y = Math.max(vis[i].y, vis[i - 1].y + minGap);
    if (vis.length && vis[vis.length - 1].y > hi) {
      vis[vis.length - 1].y = hi;
      for (let i = vis.length - 2; i >= 0; i--) vis[i].y = Math.min(vis[i].y, vis[i + 1].y - minGap);
    }
    if (vis.length && vis[0].y < lo) vis[0].y = lo;
    return new Map(items.map((d) => [d.k, d.y]));
  }

  let bandPrev = null, bandCur = null;
  function renderBands(animate, entering) {
    gGlobal.attr("display", "none"); gBand.attr("display", null); gCaption.attr("display", null);
    const r = svg.node().getBoundingClientRect(); W = Math.max(r.width, 640); H = Math.max(r.height, 420);
    const bands = bandData(state.floor), cats = bandCats(bands), st = bandStats(bands);
    const target = state.mode === "without" ? "B" : "C";
    const LY = { B: bandLayout(bands, cats, "B"), M: bandLayout(bands, cats, "M"), C: bandLayout(bands, cats, "C") };
    const T = LY[target];
    // 같은 하한에서 초고 제외 ↔ 포함으로 바뀌면 가운데 단계(M)를 거쳐 두 번에 나눠 움직임
    const morph = animate && !entering && bandPrev && bandPrev.floor === state.floor && bandPrev.stage !== target;
    const seq = morph ? ["M", target] : [target], dur = 800;
    bandPrev = { stage: target, floor: state.floor };
    bandCur = { LY: T, bands, cats };
    const col = new Map(cats.order.map((c) => [c, catColor(c)]));
    const run = (sel, set) => {
      sel.interrupt(); sel.selectAll("tspan").interrupt();
      if (!animate || entering) return set(sel, target);
      let t = sel;
      seq.forEach((s) => { t = t.transition().duration(dur).ease(d3.easeCubicInOut); set(t, s); });
    };
    // 띠
    const bs = gBandLinks.selectAll("path.band").data(bands, (d) => d.u);
    bs.exit().remove();
    const bAll = bs.enter().append("path").attr("class", "band")
      .attr("d", (d) => T.P[d.u].path).attr("stroke", (d) => col.get(T.P[d.u].cat))
      .on("mouseenter", (ev, d) => showTip(ev, bandTip(d))).on("mousemove", moveTip).on("mouseleave", hideTip)
      .on("click", (ev, d) => { ev.stopPropagation(); selectBand({ u: d.u }); })
      .merge(bs).attr("stroke-width", Math.max(1, T.u * 0.8))
      .attr("stroke-dasharray", null);
    run(bAll, (t, s) => t.attr("d", (d) => LY[s].P[d.u].path).attr("stroke", (d) => col.get(LY[s].P[d.u].cat)));
    // 왼쪽 막대와 이름표
    const blockEvents = (sel) => sel.style("cursor", "pointer")
      .on("mouseenter", (ev, c) => { showTip(ev, catTip(c)); bandHighlight({ cat: c }); }).on("mousemove", moveTip)
      .on("mouseleave", () => { hideTip(); bandHighlight(); })
      .on("click", (ev, c) => { ev.stopPropagation(); selectBand({ cat: c }); });
    const lb = gBandBlocks.selectAll("rect.lblock").data(cats.order, (c) => c);
    lb.exit().remove();
    const lAll = lb.enter().append("rect").attr("class", "lblock").call(blockEvents)
      .attr("y", (c) => T.left.get(c).y0).attr("height", (c) => T.left.get(c).y1 - T.left.get(c).y0)
      .merge(lb).attr("x", T.xL).attr("width", BD.bw).attr("fill", (c) => col.get(c));
    run(lAll, (t, s) => t.attr("y", (c) => LY[s].left.get(c).y0).attr("height", (c) => LY[s].left.get(c).y1 - LY[s].left.get(c).y0));
    const labY = (L) => spread(cats.order.map((c) => { const b = L.left.get(c); return { k: c, y: (b.y0 + b.y1) / 2, n: b.n }; }), 14, L.top, L.top + L.colH);
    const ys = { B: labY(LY.B), M: labY(LY.M), C: labY(LY.C) };
    const lt = gBandText.selectAll("text.llabel").data(cats.order, (c) => c);
    lt.exit().remove();
    const ltE = lt.enter().append("text").attr("class", "band-label llabel").attr("text-anchor", "end").attr("dy", "0.35em")
      .attr("y", (c) => ys[target].get(c)).call(blockEvents);
    ltE.append("tspan").attr("class", "nm");
    ltE.append("tspan").attr("class", "ct").attr("dx", 6);
    const ltAll = ltE.merge(lt).attr("x", T.xL - 8);
    ltAll.select(".nm").attr("font-weight", (c) => (c >= 0 ? 600 : 400)).text(catName);
    // 넘겨받기 단계의 수는 진하게 보이는 띠(넘겨받기)의 수
    const hand = state.mode === "handover";
    const keptBy = d3.rollup(bands.filter((d) => d.handover), (v) => v.length, (d) => cats.cat(d.bSrc));
    const keptCh = d3.rollup(bands.filter((d) => d.handover), (v) => v.length, (d) => d.ch);
    run(ltAll, (t, s) => {
      t.attr("y", (c) => ys[s].get(c)).style("opacity", (c) => (LY[s].left.get(c).n ? 1 : 0));
      t.select(".ct").text((c) => (hand && s === "C" ? keptBy.get(c) || 0 : LY[s].left.get(c).n));
    });
    // 오른쪽 막대(제헌헌법의 장)와 이름표: 어느 단계에서나 같음
    const chEvents = (sel) => sel.style("cursor", "pointer")
      .on("mouseenter", (ev, d) => { showTip(ev, chapterTip(d.ci)); bandHighlight({ ch: d.ci }); }).on("mousemove", moveTip)
      .on("mouseleave", () => { hideTip(); bandHighlight(); })
      .on("click", (ev, d) => { ev.stopPropagation(); selectBand({ ch: d.ci }); });
    gBandBlocks.selectAll("rect.rblock").data(T.right, (d) => d.ci)
      .join((en) => en.append("rect").attr("class", "rblock").call(chEvents))
      .attr("x", T.xR).attr("width", BD.bw).attr("y", (d) => d.y0).attr("height", (d) => d.y1 - d.y0);
    const rys = spread(T.right.map((d) => ({ k: d.ci, y: (d.y0 + d.y1) / 2, n: d.n })), 14, T.top, T.top + T.colH);
    const rt = gBandText.selectAll("text.rlabel").data(T.right, (d) => d.ci)
      .join((en) => { const t = en.append("text").attr("class", "band-label rlabel").attr("dy", "0.35em").call(chEvents);
        t.append("tspan").attr("class", "nm"); t.append("tspan").attr("class", "ct").attr("dx", 6); return t; })
      .attr("x", T.xR + BD.bw + 8).attr("y", (d) => rys.get(d.ci));
    rt.select(".nm").text((d) => CHAPTERS[d.ci].label);
    rt.select(".ct").text((d) => (hand ? keptCh.get(d.ci) || 0 : d.n));
    // 가운데 막대(유진오 제1회 초고)
    const dr = gBandBlocks.selectAll("rect.dblock").data([0])
      .join((en) => en.append("rect").attr("class", "dblock").style("cursor", "pointer")
        .attr("y", T.draft.y0).attr("height", T.draft.y1 - T.draft.y0)
        .on("mouseenter", (ev) => { showTip(ev, draftTip()); bandHighlight({ draft: true }); }).on("mousemove", moveTip)
        .on("mouseleave", () => { hideTip(); bandHighlight(); })
        .on("click", (ev) => { ev.stopPropagation(); selectBand({ draft: true }); }))
      .attr("x", T.xM).attr("width", BD.dw);
    run(dr, (t, s) => t.attr("y", LY[s].draft.y0).attr("height", LY[s].draft.y1 - LY[s].draft.y0));
    // 열 제목
    const heads = [
      { k: "L", x: T.xL + BD.bw, anchor: "end", a: "선행 문헌", b: hand ? "시간순 · 수는 넘겨받기 띠" : "시간순" },
      { k: "M", x: T.xM + BD.dw / 2, anchor: "middle", a: "유진오 제1회 초고",
        b: target === "B" ? "비교 후보에서 제외" : hand ? `초고 1위 ${T.nDraft}조 · 일치 ${st.ho}조` : `초고 1위 ${T.nDraft}조` },
      { k: "R", x: T.xR, anchor: "start", a: "제헌헌법", b: hand ? "장별 · 수는 넘겨받기 띠" : `장별 · ${st.total}조` },
    ];
    const hd = gBandText.selectAll("text.bhead").data(heads, (d) => d.k)
      .join((en) => { const t = en.append("text").attr("class", "bhead"); t.append("tspan").attr("class", "a"); t.append("tspan").attr("class", "b"); return t; })
      .attr("text-anchor", (d) => d.anchor);
    hd.select(".a").attr("x", (d) => d.x).attr("y", T.top - 30).text((d) => d.a);
    hd.select(".b").attr("x", (d) => d.x).attr("y", T.top - 14).text((d) => d.b);
    // 설명 줄(확대해도 고정)
    const cap = state.mode === "without" ? "B · 초고를 제외한 1위 대응"
      : state.mode === "handover" ? `선행 문헌 일치 ${st.ho}/${st.sw}조 · 해당 띠 강조`
      : `C + A · 초고가 1위인 ${st.nY}조의 선행 대응까지 연결`;
    const cp = gCaption.selectAll("text.bcap").data([0])
      .join((en) => { const t = en.append("text").attr("class", "bcap"); t.append("tspan").attr("class", "t"); t.append("tspan").attr("class", "s"); return t; });
    cp.select(".t").attr("x", 24).attr("y", 18).text("띠 1개 = 제헌헌법 1개 조문");
    cp.select(".s").attr("x", 24).attr("y", 37).text(cap);
    // 넘겨받기 단계는 띠가 다 움직인 뒤에 진하게 함
    bandHighlight(null, animate && !entering ? (state.mode === "handover" && morph ? seq.length * dur : 0) : null);
  }
  function bandHighlight(hover, delay) {
    if (!bandCur) return;
    const h = hover || bandSel, P = bandCur.LY.P;
    const on = (d) => ("u" in h ? d.u === h.u : "cat" in h ? P[d.u].cat === h.cat : "ch" in h ? d.ch === h.ch : P[d.u].via);
    const op = (d) => (state.mode === "handover" && !d.handover ? 0.05 : h ? (on(d) ? 0.95 : 0.07) : state.mode === "handover" ? 0.95 : 0.64);
    const sel = gBandLinks.selectAll("path.band").interrupt("op");
    if (delay == null) sel.style("opacity", op);
    else sel.transition("op").delay(delay).duration(350).style("opacity", op);
  }
  function selectBand(h) { bandSel = h; bandHighlight(); lastPanelKey = null; v4.syncSelection(); showPanel();
    if (state.mode === "handover" && h && h.u && !bandData(state.floor).find(d => d.u === h.u)?.handover) location.hash = "#yujino";
  }

  function bandTip(d) {
    const cPart = d.viaDraft ? `${esc(lab(d.c[1]))} ← ${esc(srcText(d.a))}` : esc(srcText(d.c));
    return `<b>제헌헌법 ${esc(lab(d.u))}</b> · ${esc(CHAPTERS[d.ch].label)}<br>초고 제외: ${esc(srcText(d.b))}<br>초고 포함: ${cPart}<br><span class="chip">${esc(statusText(d))}</span>`;
  }
  function catTip(c) {
    const { bands, cats } = bandCur;
    const nB = bands.filter((d) => cats.cat(d.bSrc) === c).length, nC = bands.filter((d) => cats.cat(d.cSrc) === c).length;
    const kept = bands.filter((d) => d.handover && cats.cat(d.bSrc) === c).length;
    const members = c === OTHER ? `<br><span class="note">${cats.others.map((s) => esc(nodes[s].mapLabel)).join(", ")}</span>` : "";
    return `<b>${esc(catFull(c))}</b>${members}<br>B 직접 대응 ${nB}조 · 초고 포함 후 왼쪽 연결 ${nC}조${c === WEAK ? "" : `<br>그중 B·A 문헌 일치(넘겨받기) ${kept}조`}`;
  }
  function chapterTip(ci) {
    const list = bandCur.bands.filter((d) => d.ch === ci);
    return `<b>${esc(CHAPTERS[ci].label)}</b><br>${list.length}조 · 초고를 지나가는 조문 ${list.filter((d) => d.viaDraft).length} · 넘겨받기 ${list.filter((d) => d.handover).length}`;
  }
  function draftTip() {
    const st = bandStats(bandCur.bands);
    return `<b>유진오 제1회 초고</b><br>지나가는 띠 ${st.nY} · 그중 넘겨받기 ${st.ho}`;
  }

  // ── 패널 ──────────────────────────────────────────────────
  const panel = $("#panel");
  function legendHTML() {
    const ents = nodes.map((n, i) => i).filter((i) => nodes[i].slot).sort((a, b) => nodes[a].slot - nodes[b].slot);
    return `<div class="legend">${ents.map((i) => `<span><i style="background:${nodeColor(i)}"></i>${esc(nodes[i].label)}</span>`).join("")}<span><i style="background:var(--node-neutral)"></i>그 밖의 문헌</span><span><i style="background:var(--focus)"></i>초고 → 제헌헌법</span></div>`;
  }
  function panelDefault() {
    const all = globalEdges(state.floor);
    const weightText = state.weight === "share"
      ? "해당 문헌(선이 도착하는 문헌)의 조문 가운데, 선행 문헌의 조문이 1위로 대응한 조문의 <b>비율</b>"
      : "해당 문헌(선이 도착하는 문헌)의 조문 가운데, 선행 문헌의 조문이 1위로 대응한 조문의 <b>수</b>";
    panel.innerHTML = `<h2>전체 지도</h2>
      <table class="defs">
        <tr><th>노드(node)</th><td>문헌</td></tr>
        <tr><th>선(edge)</th><td>선행 문헌에서 해당 문헌으로 가는 조문의 대응</td></tr>
        <tr><th>선의 굵기(edge weight)</th><td>${weightText}</td></tr>
        <tr><th>대응</th><td>BM25(한글 2-gram)와 BGE-M3 코사인을 RRF로 합친 순위의 1위 조문. 후보는 시간상 앞선 문헌의 조문만 씀(외국 헌법이 대상이면 외국 헌법만)</td></tr>
      </table>
      <h3>조절 막대</h3>
      <table class="defs">
        <tr><th>코사인 하한</th><td>1위 조문의 코사인이 하한(0.50~0.75에서 선택, 지금 ${state.floor.toFixed(2)}) 미만이면 세지 않음</td></tr>
        <tr><th>최소 조문 수</th><td>해당 문헌의 조문 가운데 선행 문헌의 조문이 1위로 대응한 조문의 수가 n 이상인 선만 보여 줌(지금 ${state.minCount})</td></tr>
        <tr><th>대상별 상위</th><td>선이 도착하는 문헌마다, 들어오는 선 가운데 가장 굵은 n개만 보여 줌(지금 ${state.topN})</td></tr>
        <tr><th>굵기 기준</th><td>조문 수 또는 비율. 비율은 조문 수를 해당 문헌의 조문 수로 나눈 값</td></tr>
      </table>
      <h3>색</h3>
      ${legendHTML()}
      <div class="cards"><div class="card"><b>${nodes.length}</b><span>문헌(노드)</span></div><div class="card"><b>${links.length.toLocaleString()}</b><span>순위를 매긴 조문</span></div>
      <div class="card"><b>${all.length}</b><span>하한 이상 연결(필터 전)</span></div><div class="card"><b>${gEdgesData.length}</b><span>지금 보이는 선</span></div></div>`;
  }
  async function panelNode(i) {
    const n = nodes[i];
    const all = globalEdges(state.floor);
    const inc = all.filter((e) => e.t === i).sort((a, b) => b.count - a.count).slice(0, 8);
    const out = all.filter((e) => e.s === i).sort((a, b) => b.count - a.count).slice(0, 8);
    const row = (e, other) => `<tr><td>${esc(nodes[other].label)}</td><td class="n">${e.count}</td><td class="n">${pct(e.count, e.targets)}%</td></tr>`;
    panel.innerHTML = `<h2>${esc(n.label)}</h2><p>${esc(n.dateLabel)} · 조문 ${n.articles}개(대상 ${n.targets})</p>
      ${n.uncertain.length ? `<p><span class="chip">확인 필요</span>${n.uncertain.map(esc).join(" · ")}</p>` : ""}
      <h3>판본</h3><table>${n.versions.map((v) => `<tr><td>${esc(v.label)}</td><td>${esc(v.dateLabel)}</td><td class="note">${esc(v.basis)}</td></tr>`).join("")}</table>
      <h3>들어오는 선(이 문헌 조문의 1위 문헌)</h3>${inc.length ? `<table><tr><th>앞선 문헌</th><th class="n">조문</th><th class="n">비율</th></tr>${inc.map((e) => row(e, e.s)).join("")}</table>` : "<p>없음</p>"}
      <h3>나가는 선</h3>${out.length ? `<table><tr><th>뒤 문헌</th><th class="n">조문</th><th class="n">비율</th></tr>${out.map((e) => row(e, e.t)).join("")}</table>` : "<p>없음</p>"}`;
  }
  async function pairHTML(tUid, sUid, cos, extra = "") {
    const tN = uidNode[tUid], sN = uidNode[sUid];
    if (!CFG.texts) {   // 공개판: 본문 없이 조문 번호와 점수만
      return `<div class="pair"><div class="meta">${esc(nodes[tN].label)} ${esc(labels[tUid])} ← ${esc(nodes[sN].label)} ${esc(labels[sUid])} · 코사인 ${cos.toFixed(3)} ${extra}</div></div>`;
    }
    const [ta, sa] = await Promise.all([arts(tN), arts(sN)]);
    const T = ta[tUid] || {}, S = sa[sUid] || {};
    return `<div class="pair"><div class="meta">${esc(nodes[tN].label)} ${esc(T.l)} ← ${esc(nodes[sN].label)} ${esc(S.l)} · 코사인 ${cos.toFixed(3)} ${extra}</div>
      <div class="txt">${esc(T.k)}</div><div class="arrow">↑ 대응</div><div class="txt">${esc(S.k)}</div>
      <details><summary class="note">원문</summary><div class="txt">${esc(T.o)}</div><div class="txt">${esc(S.o)}</div></details></div>`;
  }
  async function panelEdge(e) {
    const pairs = e.pairs.slice().sort((a, b) => b[2] - a[2]);
    panel.innerHTML = `<h2>${esc(nodes[e.s].label)} → ${esc(nodes[e.t].label)}</h2>
      <div class="cards"><div class="card"><b>${e.count}</b><span>1위 대응 조문 (대상 ${e.targets}조의 ${pct(e.count, e.targets)}%)</span></div>
      <div class="card"><b>${e.top5}</b><span>상위5에 든 조문</span></div><div class="card"><b>${e.mean.toFixed(3)}</b><span>평균 코사인</span></div>
      <div class="card"><b>${Math.max(...e.cos).toFixed(3)}</b><span>최고 코사인</span></div></div>
      ${e.doc ? `<p><span class="chip">해설·사료</span>${esc(e.doc.topic)} — ${esc(e.doc.source)}</p>` : ""}
      ${e.memo.length ? `<p><span class="chip">참조메모</span>${e.memo.map((m) => `${esc(m.note)} “${esc(m.verbatim)}”`).join(" · ")}</p>` : ""}
      <h3>조문쌍(코사인 높은 순, 최대 15개)</h3><div id="pairs"><p class="note">불러오는 중…</p></div>`;
    const html = await Promise.all(pairs.slice(0, 15).map((p) => pairHTML(p[0], p[1], p[2], e.t === YI && memoKey.has(`${p[0]}|${e.s}`) ? '<span class="chip">메모 기재</span>' : "")));
    if (state.sel && state.sel.edge === e) $("#pairs").innerHTML = html.join("");
  }

  // ── 유진오 화면 패널 ─────────────────────────────────────────────
  let panelTok = 0, lastPanelKey = null;
  const backLink = `<p><a href="#" class="back">← 전체 설명</a></p>`;
  function wirePanel() {
    panel.querySelectorAll("tr.pick").forEach((tr) => tr.addEventListener("click", () => selectBand({ u: tr.dataset.u })));
    const back = panel.querySelector("a.back");
    if (back) back.addEventListener("click", (e) => { e.preventDefault(); selectBand(null); });
  }
  function bandRowsHTML(list) {
    return `<table><tr><th>조문</th><th>초고 제외</th><th>초고 포함</th></tr>${list.map((d) =>
      `<tr class="pick" data-u="${esc(d.u)}"><td><button type="button">${esc(lab(d.u))}</button></td><td>${esc(srcText(d.b))}</td><td>${d.viaDraft ? `${esc(lab(d.c[1]))}<br>← ${esc(srcText(d.a))}` : esc(srcText(d.c))} <span class="chip">${shortStatus(d)}</span></td></tr>`).join("")}</table>`;
  }
  const groupsHTML = (groups) => groups.filter(([, l]) => l.length).map(([h, l]) => `<h3>${esc(h)} ${l.length}</h3>${bandRowsHTML(l)}`).join("");
  function aCounts(f) {
    const m = new Map();
    links.forEach((L) => { if (L.n === YI) { const p = primary(L, f), k = p ? p[0] : WEAK; m.set(k, (m.get(k) || 0) + 1); } });
    return m;
  }
  function panelYujino() { return v4.panelAnalysis(); }
  async function artHTML(uid, head) {
    const n = uidNode[uid];
    if (!CFG.texts || n === undefined) return `<div class="meta">${esc(head)} ${esc(lab(uid))}</div>`;
    const a = (await arts(n))[uid] || {};
    return `<div class="meta">${esc(head)} ${esc(a.l || lab(uid))}</div><div class="txt">${esc(a.k)}</div><details><summary class="note">원문</summary><div class="txt">${esc(a.o)}</div></details>`;
  }
  function panelBand(d) { return v4.panelBand(d); }
  function panelCat(c) {
    const { bands, cats } = bandCur;
    const cb = (d) => cats.cat(d.bSrc), cc = (d) => cats.cat(d.cSrc);
    const nB = bands.filter((d) => cb(d) === c).length, nC = bands.filter((d) => cc(d) === c).length;
    panel.innerHTML = `<h2>${esc(catFull(c))}</h2>
      ${c === OTHER ? `<p>${cats.others.map((s) => esc(nodes[s].label)).join(", ")}</p>` : ""}
      <p>B 직접 대응 ${nB}조 · 초고 포함 후 왼쪽 연결 ${nC}조.</p><p class="note">초고 포함 후에는 초고를 지나는 조문의 A와 초고 외 직접 대응 C를 합산합니다. B와 총수가 같아도 해당 조문의 구성은 다를 수 있습니다.</p>
      ${groupsHTML([
        ["넘겨받기(초고를 지나가도 그대로)", bands.filter((d) => d.handover && cb(d) === c)],
        ["초고를 지나감, 넘겨받기 아님", bands.filter((d) => d.viaDraft && !d.handover && cb(d) === c && cc(d) === c)],
        ["초고 밖, 그대로", bands.filter((d) => !d.viaDraft && cb(d) === c && cc(d) === c)],
        ["초고 포함 후 왼쪽 연결이 다른 문헌", bands.filter((d) => cb(d) === c && cc(d) !== c)],
        ["초고 포함 후 이 문헌에 새로 연결", bands.filter((d) => cc(d) === c && cb(d) !== c)]])}${backLink}`;
    wirePanel();
  }
  function panelChapter(ci) {
    const list = bandCur.bands.filter((d) => d.ch === ci);
    panel.innerHTML = `<h2>${esc(CHAPTERS[ci].label)}</h2><p>${list.length}조 · 초고를 지나가는 조문 ${list.filter((d) => d.viaDraft).length} · 넘겨받기 ${list.filter((d) => d.handover).length}. 줄을 누르면 조문을 봄.</p>${bandRowsHTML(list)}${backLink}`;
    wirePanel();
  }
  function panelDraft() {
    const { bands } = bandCur;
    panel.innerHTML = `<h2>유진오 제1회 초고를 지나가는 띠</h2><p>C에서 초고가 1위인 제헌헌법 조문 ${bands.filter((d) => d.viaDraft).length}개. 줄을 누르면 조문을 봄.</p>
      ${groupsHTML([["넘겨받기(왼쪽 끝이 그대로)", bands.filter((d) => d.handover)],
        ["선행 문헌 불일치", bands.filter((d) => d.switched && !d.handover && d.a)],
        ["A의 대응 약함", bands.filter((d) => d.switched && !d.a)],
        ["초고 제외 때 대응 약함", bands.filter((d) => d.viaDraft && !d.switched)]])}${backLink}`;
    wirePanel();
  }
  // 하한이나 누른 것이 그대로면 패널을 다시 그리지 않음(초고 제외·포함만 바꿀 때 패널이 맨 위로 튀지 않게)
  function panelBandView() {
    const key = `${JSON.stringify(bandSel)}@${state.floor}`;
    if (key === lastPanelKey) return;
    lastPanelKey = key;
    const h = bandSel;
    if (!h) return panelYujino();
    if ("u" in h) { const d = bandCur.bands.find((x) => x.u === h.u); return d ? panelBand(d) : panelYujino(); }
    if ("cat" in h) { if (bandCur.cats.order.includes(h.cat)) return panelCat(h.cat); bandSel = null; return panelYujino(); }
    if ("ch" in h) return panelChapter(h.ch);
    return panelDraft();
  }
  function showPanel() {
    if (state.view === "yujino") return panelBandView();
    lastPanelKey = null;
    if (state.view === "overview") return v4.panelOverview();
    if (["article", "library", "memo", "document", "completion"].includes(state.view)) return;
    if (state.view === "sankey") return v4.panelChapters();
    if (state.sel && state.sel.node !== undefined) return panelNode(state.sel.node);
    panelDefault();
  }
  function onNode(i) {
    if (state.view === "global" && i === YI && hasYujino) { location.hash = "#overview"; return; }
    if (state.view === "yujino") return;
    state.sel = { node: i }; highlight({ node: i }); panelNode(i);
  }

  const v4 = window.createLineageViews({ nodes, YI, CI, links, yj, evidence, state, svg, zoomLayer, gGlobal, gBand, gCaption,
    panel, primary, esc, pct, nodeColor, aCounts, bandData, bandStats, arts, lab, srcText, sumFloor, legendHTML,
    showTip, hideTip, canAnimate, selectBand, getBandSelection: () => bandSel });
  v4.initSelector();
  const completion = window.createCompletionView({state,panel,esc,memoForArticle:v4.memoForArticle});
  // ── 주소와 조작 ────────────────────────────────────────────────
  // 주소 뒤에는 화면 이름만 둠(#global, #yujino, #yujino-without, #yujino-handover, #sankey). 하한 등 나머지 상태는 페이지 안에 둠.
  const ROUTES = { global: { view: "global" }, overview: { view: "overview", mode: "with", sub: "network" },
                   "overview-without": { view: "overview", mode: "without", sub: "network" },
                   "overview-bars": { view: "overview", sub: "bars" }, yujino: { view: "yujino", mode: "with" },
                   "yujino-without": { view: "yujino", mode: "without" }, "yujino-handover": { view: "yujino", mode: "handover" },
                   sankey: { view: "sankey" }, library: { view: "library" }, memo: { view: "memo" },
                   "document-comparison": { view: "document" } };
  function readHash() {
    const completionMatch = location.hash.match(/^#completion(?:-(\d+|documents|methods|library))?$/);
    if (completionMatch && CFG.views.includes('completion')) {
      const value=completionMatch[1], n=Number(value);
      return {view:'completion', completionTab: ['documents','methods','library'].includes(value)?value:'articles', completionArticle:n>=1&&n<=103?n:state.completionArticle};
    }
    const articleMatch = location.hash.match(/^#article-(\d+)$/);
    if (articleMatch && +articleMatch[1] >= 1 && +articleMatch[1] <= 103) return { view: "article", article: +articleMatch[1], mode: state.mode, sub: state.sub };
    let r = ROUTES[location.hash.slice(1)] || ROUTES.global;
    if (!CFG.views.includes(r.view)) r = ROUTES.global;
    return { view: r.view, mode: r.mode || state.mode, sub: r.sub || state.sub };
  }
  // 켜지 않은 화면의 메뉴는 숨김. 화면이 하나뿐이면 메뉴 전체를 숨김.
  [["global", "#navGlobal"], ["overview", "#navOverview"], ["yujino", "#navYujino"]].forEach(([v, id]) => { if (!CFG.views.includes(v)) $(id).hidden = true; });
  if (CFG.views.length === 1) $("nav").hidden = true;
  let first = true;
  function route() {
    const h = readHash();
    const changedView = h.view !== state.view;
    Object.assign(state, h);
    render(changedView);
  }
  function render(changedView) {
    $("#floor").value = state.floor; $("#floorOut").textContent = state.floor.toFixed(2);
    ["navGlobal", "navOverview", "navYujino", "navCompletion"].forEach((id) => $("#" + id).removeAttribute("aria-current"));
    $(state.view === 'completion' ? '#navCompletion' : state.view === "global" ? "#navGlobal" : ["overview", "memo", "document"].includes(state.view) ? "#navOverview" : "#navYujino").setAttribute("aria-current", "page");
    const overview = state.view === "overview", bars = overview && state.sub === "bars", analysis = ["yujino", "article", "sankey", "library"].includes(state.view);
    $("#overviewNav").hidden = !overview && !["memo", "document"].includes(state.view); $("#analysisNav").hidden = !analysis;
    document.querySelectorAll(".subnav a").forEach(a => a.removeAttribute("aria-current"));
    $('#completionNav').hidden=state.view!=='completion';
    if(state.view==='completion') $({articles:'#completionArticlesTab',documents:'#completionDocumentsTab',methods:'#completionMethodsTab',library:'#completionLibraryTab'}[state.completionTab]).setAttribute('aria-current','page');
    if (overview) $(bars ? '#overviewNav a[href="#overview-bars"]' : '#overviewNav a[href="#overview"]').setAttribute("aria-current", "page");
    if (state.view === "memo") $("#memoTab").setAttribute("aria-current", "page");
    if (state.view === "document") $("#documentTab").setAttribute("aria-current", "page");
    if (analysis) $(state.view === "sankey" ? "#navSankey" : state.view === "article" ? "#articleTab" : state.view === "library" ? "#libraryTab" : "#flowTab").setAttribute("aria-current", "page");
    const headings = { global: ["문헌 사이의 대응을 시간순으로", "선행 헌법·헌법안과 후속 문헌의 조문 대응을 함께 살펴봅니다."], overview: [bars ? "문헌별 1위 대응 조문 수" : "초고를 포함하면 무엇이 달라지는가", bars ? "초고의 선행 대응(A)과 제헌헌법의 대응 변화(B·C)를 구분해 비교합니다." : "같은 제헌헌법 조문을 대상으로 초고 제외·포함 결과를 비교합니다."], yujino: ["103개 조문을 하나씩 따라가기", "띠를 선택하거나 조문 목록에서 대상을 골라, 초고 포함 전후의 연결을 확인합니다."], article: ["한 조문의 비교 과정을 단계별로", "초고 제외(B) → 초고 포함(C) → 해당 초고의 선행 문헌 대조(A)"], sankey: ["선행 문헌과 장별 대응 분포", "조문별 연결을 초고와 제헌헌법의 장으로 묶어 비교합니다."] };
    headings.library = ["제헌헌법 103조를 원문으로 읽기", "원문과 한글 표기를 읽고, 조문을 선택해 상세 비교로 이동합니다."];
    headings.memo = ["참조메모에 기록된 문헌과 초고 조문", "유진오 초고의 참조메모를 바탕으로 연결한 사료 지도"];
    headings.document = ["가운데 문헌을 바꾸어 제외·포함 비교", "‘연결 개요’와 같은 방식으로, 약헌이나 행정연구위원회안의 제헌헌법 대응을 살펴봅니다."];
    headings.sankey = ["선행 문헌과 장별 대응 분포", "초고 제외·포함 × 국내외 문헌·외국 헌법"];
    headings.completion = state.completionTab==='library' ? ['제헌헌법 원문에서 AI 해석으로', '내용·장별로 찾고, 조문을 선택해 해석 결과 확인'] : [state.completionTab==='documents'?'문헌별 선택 분포':state.completionTab==='methods'?'두 가지 후보 구성':'AI의 조문 해석', 'RRF 상위 7개 / 14군 대표 · 제헌헌법 103조 × 각 3회'];
    $("#viewTitle").textContent = headings[state.view][0]; $("#viewLead").textContent = headings[state.view][1];
    document.querySelectorAll(".g-only").forEach((el) => (el.style.display = state.view === "global" ? "" : "none"));
    document.querySelectorAll(".y-only").forEach((el) => (el.style.display = state.view === "yujino" || overview && !bars ? "" : "none"));
    $("#modeHand").hidden = state.view !== "yujino";
    $("#floorControl").hidden = ["sankey", "library", "memo", "document", "completion"].includes(state.view); $("#fixedFloor").hidden = !["sankey", "document"].includes(state.view);
    $("#floorDefault").hidden = $("#floorControl").hidden || state.floor === .6;
    $("#controls").hidden = ["library", "memo", "completion"].includes(state.view);
    $("#articleControl").hidden = !["yujino", "article"].includes(state.view);
    $("#reset").hidden = !["global", "yujino", "overview"].includes(state.view) || bars;
    [["#modeWithout", "without"], ["#modeWith", "with"], ["#modeHand", "handover"]].forEach(([id, m]) => $(id).setAttribute("aria-pressed", state.mode === m));
    $("#canvasWrap").hidden = bars || ["sankey", "article", "library", "memo", "completion"].includes(state.view);
    $("#overviewBars").hidden = !bars; $("#articleView").hidden = state.view !== "article";
    $("#libraryView").hidden = state.view !== "library"; $("#memoView").hidden = state.view !== "memo";
    $("#documentView").hidden = state.view !== "document";
    $('#completionView').hidden=state.view!=='completion';
    if ($("#sankeyView")) $("#sankeyView").style.display = state.view === "sankey" ? "block" : "none";
    hideTip();
    v4.hideOverview(); v4.invalidateArticle();
    if (changedView) { svg.call(zoom.transform, d3.zoomIdentity); $("#stage").scrollTop = 0; $("#panel").scrollTop = 0; }
    if (state.view === "global") { state.sel = null; renderGlobal(false); }
    else if (state.view === "yujino") { if (changedView) { bandSel = null; lastPanelKey = null; } renderBands(!first && canAnimate(), changedView); }
    else if (overview) { if (bars) v4.renderBars(); else v4.renderOverview(!first); }
    else if (state.view === "article") v4.renderArticle();
    else if (state.view === "library") v4.renderLibrary();
    else if (state.view === "memo") v4.renderMemo();
    else if (state.view === "document") v4.renderDocument();
    else if (state.view === "completion") completion.render();
    if (state.view === "yujino") v4.syncSelection();
    showPanel();
    first = false;
  }
  $("#floor").addEventListener("input", (e) => { $("#floorOut").textContent = (+e.target.value).toFixed(2); });
  $("#floor").addEventListener("change", (e) => { state.floor = +(+e.target.value).toFixed(2); render(false); });
  $("#floorDefault").addEventListener("click", () => { state.floor = .6; render(false); });
  $("#minCount").addEventListener("input", (e) => { state.minCount = +e.target.value; $("#minOut").textContent = state.minCount; renderGlobal(true); panelDefault(); });
  $("#topN").addEventListener("input", (e) => { state.topN = +e.target.value; $("#topOut").textContent = state.topN; renderGlobal(true); panelDefault(); });
  const setWeight = (w) => { state.weight = w; $("#wCount").setAttribute("aria-pressed", w === "count"); $("#wShare").setAttribute("aria-pressed", w === "share");
    renderGlobal(false); panelDefault(); };
  $("#wCount").addEventListener("click", () => setWeight("count"));
  $("#wShare").addEventListener("click", () => setWeight("share"));
  $("#modeWithout").addEventListener("click", () => { location.hash = state.view === "overview" ? "#overview-without" : "#yujino-without"; });
  $("#modeWith").addEventListener("click", () => { location.hash = state.view === "overview" ? "#overview" : "#yujino"; });
  $("#modeHand").addEventListener("click", () => { bandSel = null; lastPanelKey = null; location.hash = "#yujino-handover"; if (state.mode === "handover") { bandHighlight(); v4.syncSelection(); showPanel(); } });
  $("#reset").addEventListener("click", () => { state.sel = null; svg.call(zoom.transform, d3.zoomIdentity);
    if (state.view === "global") { highlight(null); panelDefault(); }
    if (state.view === "overview") v4.panelOverview();
    if (state.view === "yujino") selectBand(null); });
  if ($("#sankeyView")) {   // 공개판(전체 지도만)에는 Sankey 화면이 없음
    [["skAll", "all"], ["skForeign", "foreign"]].forEach(([id, scope]) => $("#"+id).addEventListener("click", () => { state.sk = scope; v4.panelChapters(); }));
    [["skWithout", "without"], ["skWith", "with"]].forEach(([id, mode]) => $("#"+id).addEventListener("click", () => { state.skMode = mode; v4.panelChapters(); }));
  }
  // 띠 색은 CSS 변수를 읽어 쓰므로 밝기가 바뀌면 다시 그림
  const redrawBands = () => { if (state.view === "yujino") renderBands(false); };
  $("#theme").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
    redrawBands();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawBands);
  const laneBox = $("#laneBoxes");
  LANES.forEach((l) => {
    const lab = document.createElement("label");
    lab.innerHTML = `<input type="checkbox" checked data-lane="${l.id}"> ${l.label.replace("대한민국임시정부 계열", "임시정부")}`;
    lab.querySelector("input").addEventListener("change", (e) => { e.target.checked ? state.lanes.add(l.id) : state.lanes.delete(l.id); renderGlobal(true); panelDefault(); });
    laneBox.appendChild(lab);
  });
  window.addEventListener("hashchange", route);
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (state.view === "yujino") renderBands(false); else if (state.view === "global") renderGlobal(false); else if (state.view === "overview" && state.sub !== "bars") v4.renderOverview(false); else if(state.view === "document") v4.renderDocument(false); }, 200); });
  route();
})();
