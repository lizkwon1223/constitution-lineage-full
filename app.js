/* 제헌헌법 조문 계보 지도. 계산된 JSON(data/)을 읽어 그리기만 함. */
(async function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const LANES = [
    { id: "foreign", label: "외국 헌법", h: 0.36 },
    { id: "provisional", label: "대한민국임시정부 계열", h: 0.10 },
    { id: "liberation", label: "해방 후 국내 헌법안", h: 0.34 },
    { id: "drafting", label: "유진오–제헌 과정", h: 0.20 },
  ];
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
  const CFG = Object.assign({ views: ["global", "yujino", "sankey"], texts: true }, window.LINEAGE_CONFIG || {});
  const hasYujino = CFG.views.includes("yujino");
  let nodes, links, yj = { linksB: [], top10: {} }, evidence, summary = null, labels = {};
  try {
    if (typeof d3 === "undefined") throw new Error("D3 라이브러리(인터넷의 cdn.jsdelivr.net)");
    [nodes, links, evidence] = await Promise.all(["nodes", "links", "evidence"].map(load));
    if (hasYujino) [yj, summary] = await Promise.all(["yujino", "summary"].map(load));
    if (!CFG.texts) labels = await load("labels");
  } catch (err) {
    $("#panel").innerHTML = `<h2>자료를 불러오지 못함</h2><p>${err.message}을(를) 읽지 못함. index.html과 같은 폴더에 data 폴더가 있는지, 인터넷에 연결되어 있는지 확인해 주세요.</p>`;
    return;
  }
  const idx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
  const YI = idx.YU_DRAFT, CI = idx.KR1948;
  const nodeColor = (i) => (i >= 0 && nodes[i].slot ? `var(--e${nodes[i].slot})` : "var(--node-neutral)");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const change = (from, to) => { const x = (100 * (to - from)) / from; return Math.sign(x) * Math.round(Math.abs(x)); };  // −87.5 → −88
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

  const state = { view: "global", mode: "with", floor: 0.6, minCount: 3, topN: 3, lanes: new Set(LANES.map((l) => l.id)),
                  sel: null, sk: "all", weight: "count" };
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
  function abcCounts(f) {
    const A = new Map(), B = new Map(), C = new Map();
    const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    const Apri = {};
    for (const L of links) {
      if (L.n === YI) { const p = primary(L, f); Apri[L.t] = p; add(A, p ? p[0] : -1, [L.t, p ? p[1] : L.p[1], L.p[2]]); }
      if (L.n === CI) { const p = primary(L, f); add(C, p ? p[0] : -1, [L.t, p ? p[1] : L.p[1], L.p[2]]); }
    }
    for (const L of yj.linksB) { const p = primary(L, f); add(B, p ? p[0] : -1, [L.t, p ? p[1] : L.p[1], L.p[2]]); }
    return { A, B, C, Apri };
  }
  const sumFloor = (key, f) => summary[key].find((s) => Math.abs(s.floor - f) < 1e-9);

  // ── 화면 ──────────────────────────────────────────────────
  const svg = d3.select("#chart");
  const zoomLayer = svg.append("g");
  const gLanes = zoomLayer.append("g"), gAxis = zoomLayer.append("g").attr("class", "axis");
  const gEdges = zoomLayer.append("g"), gFocus = zoomLayer.append("g"), gNodes = zoomLayer.append("g");
  const zoom = d3.zoom().scaleExtent([0.4, 6]).on("zoom", (e) => zoomLayer.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (e) => { if (e.target === svg.node()) { state.sel = null; highlight(null); showPanel(); } });
  const tip = $("#tip");
  const showTip = (e, html) => { const r = $("#stage").getBoundingClientRect(); tip.innerHTML = html; tip.style.display = "block";
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 330) + "px"; tip.style.top = e.clientY - r.top + 14 + "px"; };
  const hideTip = () => (tip.style.display = "none");

  let W = 1000, H = 700, M = { l: 150, r: 36, t: 44, b: 16 };
  const gpos = {}, fpos = {};
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
      const ns = nodes.map((n, i) => i).filter((i) => nodes[i].lane === lane.id).sort((a, b) => nodes[a].year - nodes[b].year);
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
  function layoutFocus(counts) {
    const srcs = nodes.map((n, i) => i).filter((i) => i !== YI && i !== CI &&
      (counts.A.has(i) || counts.B.has(i) || counts.C.has(i))).sort((a, b) => nodes[a].year - nodes[b].year);
    const top = M.t + 10, bot = H - 30;
    srcs.forEach((i, k) => { fpos[i] = { x: M.l + 0.10 * (W - M.l), y: top + ((k + 0.5) / srcs.length) * (bot - top) }; });
    fpos[YI] = { x: M.l + 0.50 * (W - M.l - M.r), y: top + 0.26 * (bot - top) };
    fpos[CI] = { x: W - M.r - 90, y: top + 0.60 * (bot - top) };
    return new Set([...srcs, YI, CI]);
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
    layoutGlobal(); drawFrame();
    gNodes.selectAll("g.node text").style("opacity", 1);   // 유진오 화면에서 숨긴 이름표를 되살림
    gFocus.selectAll("*").interrupt().remove();   // 유진오 화면의 선은 바로 지움(애니메이션 타이머가 멈춘 창에서도 남지 않게)
    const all = globalEdges(state.floor);
    // 굵기: 조문 수(1위 대응 조문 수) 또는 비율(그 수 ÷ 도착 문헌의 대상 조문 수)
    const wv = (e) => (state.weight === "share" ? e.count / e.targets : e.count);
    const maxW = d3.max(all, wv) || 1;
    const wScale = (e) => 1 + 13 * Math.sqrt(wv(e) / maxW);
    let vis = all.filter((e) => e.count >= state.minCount && state.lanes.has(nodes[e.s].lane) && state.lanes.has(nodes[e.t].lane));
    const byT = d3.group(vis, (e) => e.t);
    vis = [...byT.values()].flatMap((es) => es.sort((a, b) => b.count - a.count).slice(0, state.topN));
    vis.sort((a, b) => b.count - a.count);
    gEdgesData = vis;
    const visibleNodes = new Set(nodes.map((n, i) => i).filter((i) => state.lanes.has(nodes[i].lane)));
    const sel = gEdges.selectAll("path.edge").data(vis, (e) => `${e.s}>${e.t}`);
    sel.exit().interrupt().remove();
    const ent = sel.enter().append("path").attr("class", "edge").style("opacity", 0)
      .on("mouseenter", (ev, e) => { showTip(ev, `<b>${esc(nodes[e.s].label)} → ${esc(nodes[e.t].label)}</b><br>1위 대응 ${e.count}조 (대상 ${e.targets}조의 ${pct(e.count, e.targets)}%) · 상위5 등장 ${e.top5}<br>평균 코사인 ${e.mean.toFixed(3)}${e.evidence ? "<br>참조메모·해설 기록 있음" : ""}`); })
      .on("mousemove", (ev) => { tip.style.left = Math.min(ev.clientX - $("#stage").getBoundingClientRect().left + 14, $("#stage").clientWidth - 330) + "px"; tip.style.top = ev.clientY - $("#stage").getBoundingClientRect().top + 14 + "px"; })
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
  // ── 유진오 중심 화면 ───────────────────────────────────────────
  function renderYujino(animate) {
    layoutGlobal(); drawFrame();
    gEdges.selectAll("path.edge").interrupt().remove();
    const counts = abcCounts(state.floor);
    const visible = layoutFocus(counts);
    gNodes.selectAll("g.node").select("circle").attr("opacity", 1);   // 전체 지도의 강조 상태를 지움
    drawNodes(visible, fpos, animate);
    const n = (m, k) => (m.get(k) || []).length;
    const srcs = [...visible].filter((i) => i !== YI && i !== CI);
    const wScale = (c) => (c ? 1.5 + 22 * Math.sqrt(c / 103) : 0);
    const edges = [];
    srcs.forEach((s) => {
      if (n(counts.A, s)) edges.push({ kind: "A", s, t: YI, c: n(counts.A, s) });
      edges.push({ kind: "SC", s, t: CI, b: n(counts.B, s), cc: n(counts.C, s) });
    });
    edges.push({ kind: "YC", s: YI, t: CI, c: n(counts.C, YI) });
    const val = (e) => (e.kind === "SC" ? (state.mode === "with" ? e.cc : e.b) : e.kind === "YC" ? (state.mode === "with" ? e.c : 0) : e.c);
    const key = (e) => `${e.kind}:${e.s}`;
    const sel = gFocus.selectAll("path.edge").data(edges, key);
    sel.exit().remove();
    const ent = sel.enter().append("path").attr("class", "edge").attr("stroke-width", 0)
      .attr("d", (e) => curve(gpos[e.s] || fpos[e.s], gpos[e.t] || fpos[e.t], rad(e.s), rad(e.t)))
      .on("mouseenter", (ev, e) => showTip(ev, tipFocus(e)))
      .on("mouseleave", hideTip)
      .on("click", (ev, e) => { ev.stopPropagation(); panelFocusEdge(e, counts); });
    const merged = ent.merge(sel).attr("stroke", (e) => (e.kind === "YC" ? "var(--focus)" : nodeColor(e.s)));
    (animate ? merged.transition().duration(700).ease(d3.easeCubicInOut) : merged)
      .attr("d", (e) => curve(fpos[e.s], fpos[e.t], rad(e.s), rad(e.t)))
      .attr("stroke-width", (e) => wScale(val(e))).style("opacity", (e) => (e.kind === "YC" ? 0.9 : e.kind === "A" ? 0.55 : 0.5));
    // 이름표: 초고로 가는 선의 수, 제헌헌법으로 가는 선의 증감
    // 이름표: 선행 문헌은 점 왼쪽에 '이름 + B→C 증감'을 한 줄로 씀(원래 점 아래 이름표는 이 화면에서 숨김).
    // '초고 → 제헌헌법 79'는 그 선의 가운데에 둠. 한곳에 몰려 겹치지 않게 하려는 것.
    gFocus.selectAll("text.edge-label").remove();
    gNodes.selectAll("g.node").each(function (d) {
      const i = idx[d.id];
      d3.select(this).selectAll("text").style("opacity", i === YI || i === CI ? 1 : 0);
    });
    const sc = new Map(edges.filter((e) => e.kind === "SC").map((e) => [e.s, e]));
    const changeText = (s) => {
      const e = sc.get(s);
      if (!e || (!e.b && !e.cc)) return "";
      if (state.mode !== "with") return String(e.b);
      if (!e.b) return `0→${e.cc}`;
      const d = change(e.b, e.cc);
      return `${e.b}→${e.cc} (${d < 0 ? "−" + -d : "+" + d}%)`;
    };
    const srcLab = gFocus.selectAll("text.src").data(srcs).enter().append("text").attr("class", "edge-label src")
      .attr("text-anchor", "end").attr("x", (s) => fpos[s].x - 14).attr("y", (s) => fpos[s].y + 4);
    srcLab.append("tspan").attr("font-weight", 400).text((s) => nodes[s].mapLabel);
    srcLab.append("tspan").attr("dx", 8).text(changeText);
    gFocus.append("text").attr("class", "edge-label").attr("text-anchor", "start")
      .attr("x", (fpos[YI].x + fpos[CI].x) / 2 + 14).attr("y", (fpos[YI].y + fpos[CI].y) / 2 - 10)
      .text(state.mode === "with" ? `초고 → 제헌헌법 ${n(counts.C, YI)}` : "");
    const labs = gFocus.selectAll("text.edge-label");
    if (animate) labs.style("opacity", 0).transition().delay(500).duration(300).style("opacity", 1); else labs.style("opacity", 1);
    panelYujino(counts);
  }
  function tipFocus(e) {
    const S = nodes[e.s].label;
    if (e.kind === "A") return `<b>${esc(S)} → 유진오 제1회 초고</b><br>초고 조문 ${e.c}개의 1위 문헌 (A)`;
    if (e.kind === "YC") return `<b>유진오 제1회 초고 → 제헌헌법</b><br>제헌헌법 ${e.c}조의 1위 문헌 (C)`;
    return `<b>${esc(S)} → 제헌헌법</b><br>초고 제외(B) ${e.b}조 → 초고 포함(C) ${e.cc}조`;
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
  function panelYujino(counts) {
    const s = sumFloor("main", state.floor), x = sumFloor("withoutNkHodge", state.floor), o = sumFloor("originalCosineOnly", state.floor), fo = sumFloor("foreignOnly", state.floor);
    const n = (m, k) => (m.get(k) || []).length;
    const srcs = nodes.map((d, i) => i).filter((i) => i !== YI && i !== CI && (n(counts.A, i) || n(counts.B, i) || n(counts.C, i)))
      .sort((a, b) => n(counts.B, b) + n(counts.A, b) - n(counts.B, a) - n(counts.A, a));
    const rows = srcs.map((i) => { const b = n(counts.B, i), c = n(counts.C, i);
      const d = b ? change(b, c) : null;
      return `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${nodeColor(i)};margin-right:5px"></i>${esc(nodes[i].label)}</td><td class="n">${n(counts.A, i)}</td><td class="n">${b}</td><td class="n">${c}</td><td class="n">${d === null ? "–" : (d < 0 ? "−" + -d : "+" + d) + "%"}</td></tr>`; }).join("");
    panel.innerHTML = `<h2>유진오 제1회 초고 중심</h2>
      <table class="defs">
        <tr><th>A</th><td>초고 조문(122개)마다, 초고보다 앞선 문헌에서 1위로 대응한 조문의 문헌을 셈. 선: 선행 문헌 → 초고</td></tr>
        <tr><th>B</th><td>제헌헌법 조문(103개)마다, 초고를 뺀 선행 문헌에서 1위로 대응한 조문의 문헌을 셈. 선: 선행 문헌 → 제헌헌법(‘초고 제외’)</td></tr>
        <tr><th>C</th><td>같은 제헌헌법 조문마다, 초고까지 넣고 1위로 대응한 조문의 문헌을 셈. 선: 선행 문헌·초고 → 제헌헌법(‘초고 포함’)</td></tr>
        <tr><th>넘겨받기</th><td>C에서 1위가 초고로 바뀐 조문 가운데, 그 초고 조문의 A 1위 문헌이 B의 1위 문헌과 같은 조문</td></tr>
      </table>
      <div class="cards">
        <div class="card"><b>${s.C_with_draft.YU_DRAFT || 0}/103</b><span>C에서 초고가 1위인 제헌헌법 조문 (${Math.round(100 * s.yujino_share)}%)</span></div>
        <div class="card"><b>${s.switch_count}/${s.switch_eligible}</b><span>B의 1위 문헌에서 초고로 바뀐 조문</span></div>
        <div class="card"><b>${s.handover_count}/${s.switch_count}</b><span>바뀐 조문 중 초고 조문의 1위 문헌 = B의 1위 문헌 (무관할 때 기대 ${Math.round(100 * s.handover_expected_if_independent)}%)</span></div>
        <div class="card"><b>${s.draft_units_used_by_constitution}/122</b><span>제헌헌법의 1위로 쓰인 초고 단위</span></div>
      </div>
      <h3>문헌별 1위 조문 수</h3>
      <table><tr><th>문헌</th><th class="n">A</th><th class="n">B</th><th class="n">C</th><th class="n">B→C</th></tr>${rows}
      <tr><td>대응 약함(하한 미만)</td><td class="n">${n(counts.A, -1)}</td><td class="n">${n(counts.B, -1)}</td><td class="n">${n(counts.C, -1)}</td><td></td></tr></table>
      <p class="note">A의 유효 문헌 수 ${s.A_effective_sources}. 하한 ${state.floor.toFixed(2)}.</p>
      <h3>같은 계산을 다르게 해 보면</h3>
      <table><tr><th>설정</th><th class="n">초고 1위</th><th class="n">바뀐 조문</th><th class="n">넘겨받기</th></tr>
      <tr><td>기본</td><td class="n">${s.C_with_draft.YU_DRAFT || 0}</td><td class="n">${s.switch_count}/${s.switch_eligible}</td><td class="n">${Math.round(100 * s.handover_rate)}%</td></tr>
      <tr><td>북한안·하지포고 제외</td><td class="n">${x.C_with_draft.YU_DRAFT || 0}</td><td class="n">${x.switch_count}/${x.switch_eligible}</td><td class="n">${Math.round(100 * x.handover_rate)}%</td></tr>
      <tr><td>원문 코사인만</td><td class="n">${o.C_with_draft.YU_DRAFT || 0}</td><td class="n">${o.switch_count}/${o.switch_eligible}</td><td class="n">${Math.round(100 * o.handover_rate)}%</td></tr>
      <tr><td>외국 헌법만 후보</td><td class="n">${fo.C_with_draft.YU_DRAFT || 0}</td><td class="n">${fo.switch_count}/${fo.switch_eligible}</td><td class="n">${Math.round(100 * fo.handover_rate)}%</td></tr></table>`;
  }
  async function panelFocusEdge(e, counts) {
    const f = state.floor;
    if (e.kind === "YC") {
      const list = (counts.C.get(YI) || []).slice().sort((a, b) => b[2] - a[2]);
      panel.innerHTML = `<h2>유진오 제1회 초고 → 제헌헌법</h2><p>C에서 초고가 1위인 제헌헌법 조문 ${list.length}개. 초고 조문의 1위 선행 문헌(A)이 하한 이상이면 3단 연결로 보여 줌.</p><div id="pairs"><p class="note">불러오는 중…</p></div>`;
      const html = await Promise.all(list.map(async ([c, y, cos]) => {
        const a = counts.Apri[y];
        const [cn, yn] = [uidNode[c], uidNode[y]];
        const [ca, ya] = await Promise.all([arts(cn), arts(yn)]);
        let up = "";
        if (a) { const ua = await arts(a[0]); const U = ua[a[1]] || {};
          up = `<div class="meta">${esc(nodes[a[0]].label)} ${esc(U.l)} · 코사인 ${a[2].toFixed(3)}</div><div class="txt">${esc(U.k)}</div><div class="arrow">↓</div>`; }
        const Y = ya[y] || {}, C = ca[c] || {};
        return `<div class="pair">${up}<div class="meta">${esc(Y.l)}</div><div class="txt">${esc(Y.k)}</div><div class="arrow">↓ 코사인 ${cos.toFixed(3)}</div><div class="meta">제헌헌법 ${esc(C.l)}</div><div class="txt">${esc(C.k)}</div>
          <details><summary class="note">원문</summary><div class="txt">${esc(Y.o)}</div><div class="txt">${esc(C.o)}</div></details></div>`;
      }));
      $("#pairs").innerHTML = html.join("");
      return;
    }
    if (e.kind === "A") {
      const list = (counts.A.get(e.s) || []).slice().sort((a, b) => b[2] - a[2]);
      panel.innerHTML = `<h2>${esc(nodes[e.s].label)} → 유진오 제1회 초고</h2><p>A에서 이 문헌이 1위인 초고 조문 ${list.length}개.</p>
        ${memoByNode.get(e.s) ? `<p><span class="chip">참조메모</span>${memoByNode.get(e.s).map((m) => `${esc(m.note)} “${esc(m.verbatim)}”`).join(" · ")}</p>` : ""}<div id="pairs"><p class="note">불러오는 중…</p></div>`;
      const html = await Promise.all(list.map((p) => pairHTML(p[0], p[1], p[2], memoKey.has(`${p[0]}|${e.s}`) ? '<span class="chip">메모 기재</span>' : "")));
      $("#pairs").innerHTML = html.join("");
      return;
    }
    const m = state.mode === "with" ? counts.C : counts.B;
    const list = (m.get(e.s) || []).slice().sort((a, b) => b[2] - a[2]);
    panel.innerHTML = `<h2>${esc(nodes[e.s].label)} → 제헌헌법</h2><p>초고 제외(B) ${e.b}조 → 초고 포함(C) ${e.cc}조. 지금은 ${state.mode === "with" ? "C" : "B"}의 조문을 보여 줌.</p><div id="pairs"><p class="note">불러오는 중…</p></div>`;
    const html = await Promise.all(list.map((p) => pairHTML(p[0], p[1], p[2])));
    $("#pairs").innerHTML = html.join("");
  }
  function showPanel() {
    if (state.view === "yujino") return panelYujino(abcCounts(state.floor));
    if (state.view === "sankey") { panel.innerHTML = `<h2>PPT용 Sankey</h2><p>제헌헌법 103조를 한 조문씩 따라감. 제헌헌법 조문 → C에서 1위인 초고 조문(초고의 장) → 그 초고 조문의 A 1위 문헌. 1위가 초고가 아니면 가운데 ‘초고 밖(직접 대응)’으로 감.</p><p>왼쪽 문헌은 시간순. 색은 문헌마다 고정이고 지도와 같음. 코사인 하한 0.60, 수동 보정 없음.</p>${legendHTML()}`; return; }
    if (state.sel && state.sel.node !== undefined) return panelNode(state.sel.node);
    panelDefault();
  }
  function onNode(i) {
    if (state.view === "global" && i === YI && hasYujino) { location.hash = "#yujino"; return; }
    if (state.view === "yujino") return;
    state.sel = { node: i }; highlight({ node: i }); panelNode(i);
  }

  // ── 주소와 조작 ────────────────────────────────────────────────
  // 주소 뒤에는 화면 이름만 둠(#global, #yujino, #yujino-without, #sankey). 하한 등 나머지 상태는 페이지 안에 둠.
  const ROUTES = { global: { view: "global" }, yujino: { view: "yujino", mode: "with" },
                   "yujino-without": { view: "yujino", mode: "without" }, sankey: { view: "sankey" } };
  function readHash() {
    let r = ROUTES[location.hash.slice(1)] || ROUTES.global;
    if (!CFG.views.includes(r.view)) r = ROUTES.global;
    return { view: r.view, mode: r.mode || state.mode };
  }
  // 켜지 않은 화면의 메뉴는 숨김. 화면이 하나뿐이면 메뉴 전체를 숨김.
  [["global", "#navGlobal"], ["yujino", "#navYujino"], ["sankey", "#navSankey"]].forEach(([v, id]) => { if (!CFG.views.includes(v)) $(id).hidden = true; });
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
    ["navGlobal", "navYujino", "navSankey"].forEach((id) => $("#" + id).removeAttribute("aria-current"));
    $({ global: "#navGlobal", yujino: "#navYujino", sankey: "#navSankey" }[state.view]).setAttribute("aria-current", "page");
    document.querySelectorAll(".g-only").forEach((el) => (el.style.display = state.view === "global" ? "" : "none"));
    document.querySelectorAll(".y-only").forEach((el) => (el.style.display = state.view === "yujino" ? "" : "none"));
    $("#modeWith").setAttribute("aria-pressed", state.mode === "with"); $("#modeWithout").setAttribute("aria-pressed", state.mode === "without");
    $("#chart").style.display = state.view === "sankey" ? "none" : "block";
    if ($("#sankeyView")) $("#sankeyView").style.display = state.view === "sankey" ? "block" : "none";
    if (state.view === "global") { state.sel = null; renderGlobal(!first && changedView); }
    else if (state.view === "yujino") { if (changedView) svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); renderYujino(!first); }
    showPanel();
    first = false;
  }
  $("#floor").addEventListener("input", (e) => { $("#floorOut").textContent = (+e.target.value).toFixed(2); });
  $("#floor").addEventListener("change", (e) => { state.floor = +(+e.target.value).toFixed(2); render(false); });
  $("#minCount").addEventListener("input", (e) => { state.minCount = +e.target.value; $("#minOut").textContent = state.minCount; renderGlobal(true); panelDefault(); });
  $("#topN").addEventListener("input", (e) => { state.topN = +e.target.value; $("#topOut").textContent = state.topN; renderGlobal(true); panelDefault(); });
  const setWeight = (w) => { state.weight = w; $("#wCount").setAttribute("aria-pressed", w === "count"); $("#wShare").setAttribute("aria-pressed", w === "share");
    renderGlobal(false); panelDefault(); };
  $("#wCount").addEventListener("click", () => setWeight("count"));
  $("#wShare").addEventListener("click", () => setWeight("share"));
  $("#modeWith").addEventListener("click", () => { location.hash = "#yujino"; });
  $("#modeWithout").addEventListener("click", () => { location.hash = "#yujino-without"; });
  $("#reset").addEventListener("click", () => { state.sel = null; svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    if (state.view === "global") { highlight(null); panelDefault(); } });
  if ($("#sankeyView")) {   // 공개판(전체 지도만)에는 Sankey 화면이 없음
    $("#skAll").addEventListener("click", () => { $("#skImg").src = "figures/sankey_ppt_all_060.svg"; $("#skAll").setAttribute("aria-pressed", true); $("#skForeign").setAttribute("aria-pressed", false); });
    $("#skForeign").addEventListener("click", () => { $("#skImg").src = "figures/sankey_ppt_foreign_060.svg"; $("#skForeign").setAttribute("aria-pressed", true); $("#skAll").setAttribute("aria-pressed", false); });
  }
  $("#theme").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
  });
  const laneBox = $("#laneBoxes");
  LANES.forEach((l) => {
    const lab = document.createElement("label");
    lab.innerHTML = `<input type="checkbox" checked data-lane="${l.id}"> ${l.label.replace("대한민국임시정부 계열", "임시정부")}`;
    lab.querySelector("input").addEventListener("change", (e) => { e.target.checked ? state.lanes.add(l.id) : state.lanes.delete(l.id); renderGlobal(true); panelDefault(); });
    laneBox.appendChild(lab);
  });
  window.addEventListener("hashchange", route);
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => (state.view === "yujino" ? renderYujino(false) : state.view === "global" && renderGlobal(false)), 200); });
  route();
})();
