/* v4 presentation layer. Reads stored rankings; no model or ranking calls in the browser. */
window.createLineageViews = function (ctx) {
  "use strict";
  const { nodes, YI, CI, links, yj, evidence, state, svg, zoomLayer, gGlobal, gBand, gCaption,
    panel, primary, esc, pct, nodeColor, aCounts, bandData, bandStats, arts, lab, srcText,
    sumFloor, legendHTML, showTip, hideTip, canAnimate } = ctx;
  const $ = s => document.querySelector(s);
  const lecture = window.createLectureViews(ctx);
  const documentComparison = window.createDocumentComparison({ ...ctx, drawOverview:(data,animate)=>renderOverview(animate,data) });
  const g = zoomLayer.append("g").attr("class", "overview-layer").attr("display", "none");
  let articleStep = "B", articleToken = 0, selectedArticle = null;
  const count = (map, key) => map.get(key) || 0;
  const sourceName = i => i < 0 ? "대응 약함" : nodes[i].label;
  const shortName = i => i < 0 ? "대응 약함" : nodes[i].mapLabel;
  const add = (map, key) => map.set(key, count(map, key) + 1);
  const articleNo = uid => Number(uid.match(/(\d+)$/)[1]);
  const articleURL = uid => `#article-${articleNo(uid)}`;
  function counts() {
    const A = aCounts(state.floor), B = new Map(), C = new Map();
    const bands = bandData(state.floor);
    bands.forEach(d => { add(B, d.b ? d.b[0] : -1); add(C, d.c ? d.c[0] : -1); });
    return { A, B, C, bands };
  }
  function methodDetails() {
    return `<details><summary>대응 순위와 해석 기준</summary><p>BM25(한글 2-gram)와 BGE-M3 코사인 순위를 RRF로 결합한 1위 조문을 사용합니다. 시간상 앞선 문헌을 후보로 하며, 1위 조문의 코사인이 현재 하한 ${state.floor.toFixed(2)} 미만이면 ‘대응 약함’으로 분류합니다.</p><p>연결은 텍스트 대응을 나타냅니다. 역사적 영향과 참조 관계는 조문 문언·참조메모·사료를 함께 대조하여 판단합니다.</p></details>`;
  }
  const examples = d => lecture.browserHTML(d);
  function panelOverview(source) {
    const { A, B, C, bands } = counts(), st = bandStats(bands);
    if (source === undefined && state.sub === 'bars') {
      panel.innerHTML = `<h2>문헌별 대응 조문 수</h2><p>문헌별로 1위 대응 조문 수를 집계한 결과입니다. A와 B·C는 대상 조문이 다르며, B와 C는 같은 103개 조문을 비교합니다.</p><table class="defs"><tr><th>A</th><td>초고 122개 조문의 1위 선행 문헌입니다.</td></tr><tr><th>B</th><td>초고를 제외한 제헌헌법 103개 조문의 1위 문헌입니다.</td></tr><tr><th>C</th><td>초고를 포함한 제헌헌법 103개 조문의 1위 문헌입니다.</td></tr><tr><th>막대</th><td>길이는 조문 수를 나타냅니다. 오른쪽 그림의 위쪽 옅은 막대는 B, 아래쪽 진한 막대는 C입니다.</td></tr></table><h3>읽는 예</h3><p>일본국헌법의 B ${count(B,ctx.nodes.findIndex(n=>n.id==='JP1946'))}조와 C ${count(C,ctx.nodes.findIndex(n=>n.id==='JP1946'))}조는, 각 조건에서 일본국헌법이 1위인 제헌헌법 조문 수입니다. 감소 자체가 넘겨받기 성립을 뜻하지는 않습니다.</p>${examples()}${methodDetails()}`;
      return;
    }
    if (source !== undefined) {
      const rows = bands.filter(d => (d.b && d.b[0] === source) || (d.c && d.c[0] === source));
      panel.innerHTML = `<h2>${esc(sourceName(source))}</h2><p>이 문헌이 1위로 대응하는 조문 수입니다.</p>
        <table><tr><th>비교</th><th class="n">조문 수</th></tr><tr><td>A · 초고 122조</td><td class="n">${count(A, source)}</td></tr><tr><td>B · 제헌헌법, 초고 제외</td><td class="n">${count(B, source)}</td></tr><tr><td>C · 제헌헌법, 초고 포함</td><td class="n">${count(C, source)}</td></tr></table>
        <h3>관련 제헌헌법 조문</h3><div class="example-links">${rows.map(d => `<a class="example-link" href="${articleURL(d.u)}">${esc(lab(d.u))}</a>`).join("") || "<p>현재 하한에서 해당 조문이 없습니다.</p>"}</div>
        <p><a class="text-link" href="#overview-bars">문헌별 집계 보기</a></p>${methodDetails()}`;
      return;
    }
    panel.innerHTML = `<h2>초고 포함에 따른 대응 변화</h2><p>유진오 제1회 초고를 비교 후보에 추가했을 때, 제헌헌법 조문의 1위 대응 문헌이 어떻게 달라지는지</p>
      <div class="metric-line"><strong>${st.nY}/103</strong><span>초고 포함 시 초고가 1위인<br>제헌헌법 조문 · 하한 ${state.floor.toFixed(2)}</span></div>
      <h3>두 종류의 연결</h3><table class="defs"><tr><th>선행 문헌 → 초고</th><td>A · 초고 122개 조문의 선행 대응입니다. 제외·포함 전환과 관계없이 유지됩니다.</td></tr><tr><th>제헌헌법으로 향하는 선</th><td>B는 초고 제외, C는 초고 포함 결과입니다. 대상은 같은 제헌헌법 103개 조문입니다.</td></tr><tr><th>선의 굵기</th><td>1위로 대응하는 조문 수를 나타냅니다. 정확한 건수는 선을 가리키거나 문헌별 집계에서 확인할 수 있습니다.</td></tr></table>
      <h3>조문 단위에서 확인하기</h3><p>초고로 전환된 조문마다, 그 초고의 선행 문헌이 기존 대응 문헌과 일치하는지 대조할 수 있습니다.</p>${examples()}${methodDetails()}`;
  }
  function renderOverview(animate, comparison = null) {
    gGlobal.attr("display", "none"); gBand.attr("display", "none"); gCaption.attr("display", "none"); g.attr("display", null);
    const { A, B, C } = comparison || counts();
    const FI = comparison ? comparison.focus : YI, aTotal = comparison ? comparison.aTotal : 122;
    const mode = comparison ? comparison.mode : state.mode, final = mode === "without" ? B : C;
    const bounds = svg.node().getBoundingClientRect(), width = Math.max(bounds.width, 820), height = Math.max(bounds.height, 460);
    const ids = [...new Set([...A.keys(), ...B.keys(), ...C.keys()])].filter(i => i >= 0 && i !== FI).sort((a, b) => nodes[a].year - nodes[b].year);
    const pos = new Map(ids.map((id, i) => [id, {x:215,y:68+i*(height-110)/Math.max(1,ids.length-1)}]));
    pos.set(FI,{x:width*.60,y:height*.36}); pos.set(CI,{x:width-100,y:height*.68});
    const data = [];
    ids.forEach(i => { if(count(A,i)) data.push({key:`A-${i}`,s:i,t:FI,value:count(A,i),kind:"A"}); if(count(final,i)) data.push({key:`F-${i}`,s:i,t:CI,value:count(final,i),kind:mode==="without"?"B":"C"}); });
    if(count(final,FI)) data.push({key:"F-draft",s:FI,t:CI,value:count(final,FI),kind:"C"});
    const path = d => { const a=pos.get(d.s),b=pos.get(d.t); return `M${a.x+10},${a.y} C${a.x+(b.x-a.x)*.55},${a.y} ${a.x+(b.x-a.x)*.55},${b.y} ${b.x-13},${b.y}`; };
    const edge = g.selectAll("path.overview-edge").data(data,d=>d.key);
    edge.exit().remove();
    const merged=edge.enter().append("path").attr("class","overview-edge").attr("fill","none").attr("stroke-width",1).merge(edge)
      .attr("data-source",d=>nodes[d.s].id).attr("data-target",d=>nodes[d.t].id).attr("data-kind",d=>d.kind).attr("data-count",d=>d.value)
      .attr("stroke",d=>d.s===FI?"var(--focus)":nodeColor(d.s)).attr("opacity",d=>d.kind==="A"?.26:d.s===FI?.86:.65)
      .on("mouseenter",(ev,d)=>showTip(ev,`<b>${esc(nodes[d.s].label)} → ${esc(nodes[d.t].label)}</b><br>${d.kind} · ${d.value}조 / ${d.t===FI?aTotal:103}조`)).on("mouseleave",hideTip)
      .on("click",(ev,d)=>{ev.stopPropagation();if(!comparison) d.s===FI?panelOverview():panelOverview(d.s);});
    merged.interrupt();
    (animate&&canAnimate()?merged.transition().duration(550):merged).attr("d",path).attr("stroke-width",d=>1+17*Math.sqrt(d.value/103));
    const groups=g.selectAll("g.overview-node").data([...ids,FI,CI],d=>d).join(enter=>{
      const n=enter.append("g").attr("class","overview-node").attr("role","button").attr("tabindex",0);
      n.append("circle");n.append("text").attr("class","overview-label");n.append("text").attr("class","overview-label small");return n;
    }).attr("transform",i=>`translate(${pos.get(i).x},${pos.get(i).y})`).attr("aria-label",i=>nodes[i].label)
      .attr("role",comparison?null:"button").attr("tabindex",comparison?null:0).style("cursor",comparison?"default":null)
      .on("click",(ev,i)=>{ev.stopPropagation();if(!comparison) i===FI||i===CI?panelOverview():panelOverview(i);})
      .on("keydown",(ev,i)=>{if(!comparison&&(ev.key==="Enter"||ev.key===" ")){ev.preventDefault();i===FI||i===CI?panelOverview():panelOverview(i);}});
    groups.select("circle").attr("r",i=>i===FI||i===CI?13:6).attr("fill",i=>i===FI?"var(--surface)":nodeColor(i)).attr("stroke",i=>i===FI?"var(--focus)":"var(--surface)").attr("stroke-width",i=>i===FI?3:1);
    groups.select("text.overview-label:not(.small)").attr("x",i=>i===FI||i===CI?0:-14).attr("y",i=>i===FI||i===CI?-28:4).attr("text-anchor",i=>i===FI||i===CI?"middle":"end").text(i=>shortName(i));
    groups.select("text.small").attr("x",0).attr("y",-46).attr("text-anchor","middle").text(i=>i===FI?`A · ${comparison?'대상 문헌':'초고'} ${aTotal}조`:i===CI?`${mode==="without"?"B":"C"} · 제헌헌법 103조`:"");
    g.selectAll("text.overview-total").data(mode==="without"?[]:[count(C,FI)]).join("text").attr("class","overview-label strong overview-total").attr("x",pos.get(CI).x-6).attr("y",pos.get(CI).y+40).attr("text-anchor","end").text(n=>`${comparison?'선택 문헌':'초고'} 1위 ${n}/103조`);
    g.selectAll("text.overview-heading").data([comparison?"나머지 비교 문헌":"선행 문헌"]).join("text").attr("class","overview-label small overview-heading").attr("x",201).attr("y",30).attr("text-anchor","end").text(d=>d);
    g.selectAll("text.overview-weak").data([`하한 미만: ${comparison?'대상 문헌':'초고'} ${count(A,-1)}조 · 제헌헌법 ${count(final,-1)}조`]).join("text").attr("class","overview-label small overview-weak").attr("x",24).attr("y",height-8).text(d=>d);
  }
  function renderBars() {
    const { A,B,C }=counts();
    const ai=[...A.keys()].sort((a,b)=>a===-1?1:b===-1?-1:count(A,b)-count(A,a));
    const bi=[...new Set([...B.keys(),...C.keys()])].sort((a,b)=>a===YI?-1:b===YI?1:a===-1?1:b===-1?-1:count(B,b)-count(B,a)||count(C,b)-count(C,a));
    const max=Math.max(...A.values(),...B.values(),...C.values(),1), domain=Math.ceil(max/10)*10;
    const track=(n,i,opacity=1,label="")=>`<div class="bar-track" aria-label="${label}${n}조">${label?`<span class="bar-condition">${label.trim()}</span>`:''}<span class="bar-mark" style="width:${n/domain*78}%;background:${i===YI?'var(--focus)':nodeColor(i)};opacity:${opacity}"></span><b>${n}</b></div>`;
    $("#overviewBars").innerHTML=`<div class="bars-grid"><section aria-label="A 초고의 선행 대응"><h3>초고의 선행 대응 · A</h3><p class="note">초고 122개 조문을 선행 문헌과 비교</p><div class="bars-key">1위로 대응하는 초고 조문 수</div>${ai.map(i=>`<div class="bar-row"><span class="bar-name">${esc(shortName(i))}</span><div class="bar-tracks">${track(count(A,i),i)}</div></div>`).join("")}<div class="bar-scale">공통 눈금 범위 0–${domain}조</div></section>
      <section aria-label="B C 제헌헌법의 대응 변화"><h3>제헌헌법의 대응 변화 · B / C</h3><p class="note">같은 제헌헌법 103개 조문을 두 조건에서 비교</p><div class="bars-key"><span><i class="bar-key b"></i>B 초고 제외</span><span><i class="bar-key"></i>C 초고 포함</span></div>${bi.map(i=>`<div class="bar-row"><span class="bar-name">${esc(shortName(i))}</span><div class="bar-tracks">${i===YI?'<div class="bar-track"><em>B · 후보에서 제외</em></div>':track(count(B,i),i,.3,'B ')}${track(count(C,i),i,1,'C ')}</div></div>`).join("")}<div class="bar-scale">공통 눈금 범위 0–${domain}조</div></section></div>`;
  }
  function panelAnalysis() {
    const bands=bandData(state.floor),st=bandStats(bands),weakFrom=bands.filter(d=>d.viaDraft&&!d.switched).length;
    panel.innerHTML=`<h2>103개 조문의 대응 경로</h2><p>하나의 띠는 제헌헌법 한 조문을 나타냅니다. 오른쪽의 조문 위치를 유지한 채, 초고 포함 여부에 따라 연결 경로가 달라집니다.</p>
      <ol class="panel-steps"><li><b>초고 제외 · B</b><br>제헌헌법 조문의 1위 선행 문헌을 확인합니다.</li><li><b>초고 포함 · C</b><br>초고가 1위가 된 조문은 가운데 막대를 거칩니다. 왼쪽 끝은 해당 초고 조문의 선행 문헌(A)입니다.</li><li><b>문헌 일치 강조</b><br>초고로 전환된 뒤에도 선행 문헌이 일치하는 띠를 강조합니다. 이를 ‘넘겨받기’로 분류합니다.</li></ol>
      <div class="metric-line"><strong>${st.nY}/103</strong><span>초고 포함 시 초고가 1위</span></div><div class="metric-line"><strong>${st.sw}/${st.elig}</strong><span>B에서 하한을 충족한 조문 중<br>초고로 전환</span></div><div class="metric-line"><strong>${st.ho}/${st.sw}</strong><span>전환된 조문 중 선행 문헌 일치<br>이 중 같은 조문까지 일치 ${st.same}개</span></div>
      <p class="note">현재 코사인 하한 ${state.floor.toFixed(2)}. 초고 1위 ${st.nY}개에는 B에서 대응이 약했던 ${weakFrom}개가 포함됩니다. 이 조문은 넘겨받기 비율의 분모에서 제외합니다.</p>
      ${examples()}<p class="note">문헌의 색은 서로 같을 수 있습니다. 일치 여부는 실제 문헌 식별자로 판정합니다.</p>${methodDetails()}
      <details><summary>다른 조건에서의 결과</summary><table><tr><th>후보·검색 조건</th><th class="n">초고 1위</th><th class="n">문헌 일치</th></tr>${[['main','기본'],['withoutNkHodge','북한안·하지포고 제외'],['originalCosineOnly','원문 코사인'],['foreignOnly','외국 헌법 후보']].map(([key,name])=>{const s=sumFloor(key,state.floor);return `<tr><td>${name}</td><td class="n">${s.C_with_draft.YU_DRAFT||0}</td><td class="n">${s.handover_count}/${s.switch_count}</td></tr>`;}).join('')}</table><p class="note">기존에 저장된 조건별 결과입니다.</p></details>`;
  }
  const mini=(title,p)=>`<div class="mini-path"><b>${title}</b>${esc(srcText(p))}</div>`;
  function classification(d) {
    if(d.handover) return `선행 문헌 일치 · 넘겨받기${d.same?' (같은 조문)':' (같은 문헌의 다른 조문)'}`;
    if(d.switched) return d.a?'선행 문헌 불일치 · 초고로 전환':'초고로 전환 · A의 대응 약함';
    if(d.viaDraft) return 'B의 대응 약함 · 초고로 전환';
    return d.c?'초고 외 문헌이 1위':'C의 대응 약함';
  }
  function panelBand(d) {
    panel.innerHTML=`<h2>제헌헌법 ${esc(lab(d.u))}</h2><p>${esc(classification(d))}</p>${mini('B · 초고 제외',d.b)}${mini('C · 초고 포함',d.c)}${d.viaDraft?mini('A · 해당 초고의 선행 대응',d.a):''}<p><a class="action-link" href="${articleURL(d.u)}">이 조문을 단계별로 비교 →</a></p><p class="note">상단의 제외·포함 버튼으로 선택한 띠의 경로를 비교할 수 있습니다.</p><p><button class="action-link" type="button" id="clearArticle">전체 설명으로</button></p>`;
    $('#clearArticle').onclick=()=>ctx.selectBand(null);
  }
  function initSelector() {
    $('#articleSelect').innerHTML='<option value="">전체 103개 조문</option>'+yj.finalChapters.map(([chapter,uids])=>`<optgroup label="${esc(chapter)}">${uids.map(uid=>`<option value="${uid}">${esc(lab(uid))} · ${esc(chapter)}</option>`).join('')}</optgroup>`).join('');
    $('#articleSelect').onchange=e=>{const uid=e.target.value;if(state.view==='article'){if(uid)location.hash=articleURL(uid);else location.hash='#yujino-without';}else ctx.selectBand(uid?{u:uid}:null);};
  }
  async function renderArticle() {
    const d=bandData(state.floor).find(x=>articleNo(x.u)===state.article);
    if(!d) return;
    if(selectedArticle!==d.u){selectedArticle=d.u;articleStep='B';$('#stage').scrollTop=0;}
    if(!d.viaDraft&&articleStep==='A')articleStep='C';
    const token=++articleToken,stage=articleStep,no=articleNo(d.u);
    $('#articleSelect').value=d.u;
    $('#articleTab').href=articleURL(d.u);
    const articleData=await arts(CI), finalArticle=articleData[d.u];
    if(token!==articleToken||state.view!=='article')return;
    const card=async(uid,n)=>{const data=await arts(n);const a=data[uid]||{};return {uid,n,label:a.l||lab(uid),text:a.k||'',original:a.o||''};};
    let sourcePairs=stage==='B'?[d.b]:stage==='C'?[d.c]:[d.a,d.c];
    const records=await Promise.all(sourcePairs.filter(Boolean).map(p=>card(p[1],p[0])));
    records.push(await card(d.u,CI));
    if(token!==articleToken||state.view!=='article')return;
    const question={B:'초고를 제외하면, 어느 조문이 1위로 대응하는가?',C:'초고를 후보에 추가하면, 1위 대응이 달라지는가?',A:'그 초고의 선행 문헌은 B의 문헌과 일치하는가?'}[stage];
    const nodeHTML=r=>`<div class="chain-node ${r.n===YI?'draft':''}"><span>${esc(nodes[r.n].label)}</span><strong>${esc(r.label.replace(/ \(순서 \d+\)/,''))}</strong></div>`;
    const edgeLabel=i=>stage==='A'?(i===0&&d.a?'A':'C'):stage;
    let chain=records.map((r,i)=>(i?`<div class="chain-arrow" aria-hidden="true"><small>${edgeLabel(i-1)}</small><span>→</span></div>`:'')+nodeHTML(r)).join('');
    if(!sourcePairs[0]) chain=`<div class="chain-node"><span>${stage==='A'?'A':'현재 단계'}</span><strong>대응 약함</strong></div><div class="chain-arrow" aria-hidden="true"><span>→</span></div>`+chain;
    const result=stage==='B'?`B의 1위: ${esc(srcText(d.b))}`:stage==='C'?`C의 1위: ${esc(srcText(d.c))}${d.viaDraft?' · 초고로 전환':''}`:d.handover?`<strong>선행 문헌 일치 · 넘겨받기</strong><br>B와 A 모두 ${esc(nodes[d.b[0]].label)}입니다.${d.same?' 조문도 같습니다.':' 조문 번호는 다릅니다.'}`:d.switched&&d.a?`<strong>선행 문헌 불일치</strong><br>B: ${esc(srcText(d.b))}<br>A: ${esc(srcText(d.a))}`:`<strong>넘겨받기 판정 대상에서 제외</strong><br>${d.b?'초고의 선행 대응(A)이':'초고 제외 대응(B)이'} 하한을 충족하지 않습니다.`;
    $('#articleView').innerHTML=`<div class="article-title"><div><h3>제헌헌법 ${esc(lab(d.u))}</h3><p>${esc(finalArticle.c||'')} · ${esc(classification(d))}</p></div><div class="article-pager">${no>1?`<a href="#article-${no-1}">← 이전 조문</a>`:''}${no<103?`<a href="#article-${no+1}">다음 조문 →</a>`:''}</div></div>
      <div class="reading-steps" role="group" aria-label="조문 비교 단계">${[['B','① 초고 없이'],['C','② 초고 추가'],['A','③ 선행 문헌 대조']].map(([s,t])=>`<button type="button" data-reading="${s}" aria-pressed="${stage===s}" ${s==='A'&&!d.viaDraft?'disabled':''}>${t} · ${s}</button>`).join('')}</div>
      ${!d.viaDraft?'<p class="note">현재 하한에서 C의 1위가 초고가 아니므로, 해당 초고의 A를 대조하는 단계는 적용되지 않습니다.</p>':''}
      <h4 class="comparison-question">${question}</h4><div class="chain" role="img" aria-label="${esc(records.map(r=>nodes[r.n].label+' '+r.label).join(' → '))}">${chain}</div>
      <div class="comparison-result ${d.handover?'':'different'}" aria-live="polite">${result}</div>
      <div class="text-comparison">${records.map((r,i)=>`<section><h4>${r.n===CI?'제헌헌법':r.n===YI?'유진오 제1회 초고':'선행 문헌'}</h4><div class="meta">${esc(nodes[r.n].label)} ${esc(r.label)}${i<sourcePairs.filter(Boolean).length?` · 코사인 ${sourcePairs.filter(Boolean)[i][2].toFixed(3)}`:''}</div><div class="txt">${esc(r.text)}</div><details><summary>원문 보기</summary><div class="txt">${esc(r.original)}</div></details></section>`).join('')}</div>
      ${d.viaDraft?lecture.memoHTML(d.c[1]):''}`;
    $('#articleView').querySelectorAll('[data-reading]').forEach(button=>button.onclick=()=>{articleStep=button.dataset.reading;renderArticle();});
    panel.innerHTML=`<h2>한 조문의 비교 절차</h2><p>대상 조문은 고정하고, 비교 후보와 선행 대응을 단계별로 확인합니다.</p><table class="defs"><tr><th>B</th><td>초고를 제외한 선행 문헌에서 제헌헌법 조문의 1위 대응을 찾습니다.</td></tr><tr><th>C</th><td>초고를 후보에 추가해 같은 조문의 1위 대응을 확인합니다.</td></tr><tr><th>A 대조</th><td>C에서 선택된 초고 조문의 1위 선행 문헌을 B의 문헌과 비교합니다.</td></tr></table><h3>판정</h3><p>${esc(classification(d))}</p><p class="note">넘겨받기는 B·C·A가 하한을 충족하고 C의 1위가 초고이며, A와 B의 선행 문헌이 일치하는 경우입니다.</p>${examples(d)}${methodDetails()}<p><a class="text-link" href="#yujino-handover">전체 조문에서 문헌 일치 보기 →</a></p>`;
  }
  function panelChapters() {
    const foreign=state.sk==='foreign', included=state.skMode!=='without';
    const totals=window.LINEAGE_CHAPTER_SUMMARY[foreign?'foreign':'all'];
    const figure=`figures/chapter_${foreign?'foreign':'all'}${included?'':'_without'}_060.svg`;
    $('#figureOpen').href=figure;
    $('#skImg').src=figure;
    $('#skImg').alt=`${foreign?'외국 헌법':'국내외 문헌'} · 초고 ${included?'포함':'제외'} · 선행 문헌${included?', 유진오 초고의 장':''}과 제헌헌법의 장별 대응 분포`;
    $('#skAll').setAttribute('aria-pressed',!foreign); $('#skForeign').setAttribute('aria-pressed',foreign);
    $('#skWith').setAttribute('aria-pressed',included); $('#skWithout').setAttribute('aria-pressed',!included);
    $('#chapterSummary').hidden=!included;
    $('#chapterSummary').innerHTML=included?`<span>초고 경유 <b>${totals.via}조</b></span><span>초고를 거치지 않음 <b>${totals.direct+totals.weak}조</b><small>다른 문헌과 직접 대응 ${totals.direct}조 · 대응 약함 ${totals.weak}조</small></span>`:'';
    panel.innerHTML=`<h2>장별 대응 분포</h2>
      <p><b>초고 제외(B):</b> 선행 문헌 → 제헌헌법의 장</p>
      <p><b>초고 포함(C):</b> 초고가 1위인 조문은 해당 초고의 선행 대응(A)까지 연결</p>
      <h3>그림의 구성</h3><table class="defs"><tr><th>왼쪽</th><td>${foreign?'외국 헌법':'국내외 선행 문헌'} · 주요 문헌 외 ‘기타’로 묶음</td></tr>${included?'<tr><th>가운데</th><td>유진오 초고의 장 / 초고를 거치지 않는 경로</td></tr>':''}<tr><th>오른쪽</th><td>제헌헌법의 장 · 전체 103개 조문</td></tr><tr><th>띠·막대</th><td>폭·크기·숫자 = 해당 제헌헌법 조문 수</td></tr></table>
      ${included?`<details><summary>장별 조문 수</summary><table><tr><th>장</th><th class="n">초고<br>경유</th><th class="n">직접<br>대응</th><th class="n">대응<br>약함</th></tr>${Object.entries(totals.chapters).map(([chapter,s])=>`<tr><td>${esc(chapter)}</td><td class="n">${s.via}</td><td class="n">${s.direct}</td><td class="n">${s.weak}</td></tr>`).join('')}</table></details>`:''}
      <h3>후보 범위</h3><p>${foreign?'외국 헌법':'국내외 헌법·헌법안'}${included?' + 유진오 초고':' · 유진오 초고 제외'}</p>${foreign&&included?'<p>초고의 선행 대응(A): 외국 헌법</p>':''}<p class="note">각 조건의 RRF 1위 · 코사인 0.60 미만은 ‘대응 약함’</p>`;
    $('#chapterCaption').textContent=`${foreign?'외국 헌법':'국내외 문헌'} · 초고 ${included?'포함: 초고 경유와 초고 외 직접 대응':'제외: 선행 문헌 → 제헌헌법의 장'}`;
  }
  return { renderOverview, renderBars, panelOverview, panelAnalysis, panelBand, renderArticle, panelChapters, initSelector,
    renderLibrary:lecture.renderLibrary, renderMemo:lecture.renderMemo, renderDocument:documentComparison.render,
    hideOverview:()=>g.attr('display','none'), invalidateArticle:()=>{articleToken++;lecture.invalidate();},
    syncSelection:()=>{const h=ctx.getBandSelection();$('#articleSelect').value=h&&h.u?h.u:'';if(h&&h.u)$('#articleTab').href=articleURL(h.u);} };
};
