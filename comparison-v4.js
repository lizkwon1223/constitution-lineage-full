/* Same A/B/C network renderer as Yoo's overview. Reads existing, frozen results. */
window.createDocumentComparison = function (ctx) {
  'use strict';
  const { nodes, YI, state, panel, esc, links = [] } = ctx;
  const data = window.LINEAGE_FOCUS_COMPARISONS;
  const root = document.querySelector('#documentView');
  const name = i => i < 0 ? '대응 약함' : nodes[i].mapLabel;
  const source = row => row.p && row.p[2] >= data.floor ? row.p[0] : -1;
  const count = (m, i) => m.get(i) || 0;
  function counts(rows) {
    const m = new Map();
    rows.forEach(row => { const i = source(row); m.set(i, count(m, i) + 1); });
    return m;
  }
  function summary(id) {
    const selected = data.comparisons.find(c => c.id === id) || data.comparisons[0];
    const index = nodes.findIndex(n => n.id === selected.id);
    const aRows = links.filter(d => d.n === index), A = counts(aRows);
    const B = counts(selected.without), C = counts(data.with);
    const full = new Map(data.with.map(d => [d.t, d]));
    const changed = selected.without.filter(d => source(d) !== source(full.get(d.t))).length;
    return { selected, index, A, aTotal:aRows.length, B, C, changed };
  }
  function render(animate = false) {
    const { selected, index, A, aTotal, B, C } = summary(state.focusDoc);
    state.focusDoc = selected.id;
    const mode = state.focusMode || 'without';
    state.focusMode = mode;
    const ids = [...new Set([...B.keys(), ...C.keys(), index])].sort((a,b) =>
      a < 0 ? 1 : b < 0 ? -1 : nodes[a].year - nodes[b].year || a - b);
    root.innerHTML = `<div class="scope-control"><span>가운데 둘 문헌</span><div class="toggle" role="group" aria-label="가운데 비교 문헌">${data.comparisons.map(c=>`<button type="button" data-focus-doc="${c.id}" aria-pressed="${c.id===selected.id}">${esc(name(nodes.findIndex(n=>n.id===c.id)))}</button>`).join('')}</div>
      <div class="toggle" role="group" aria-label="선택 문헌의 후보 포함 여부"><button type="button" data-focus-mode="without" aria-pressed="${mode==='without'}">제외 · B</button><button type="button" data-focus-mode="with" aria-pressed="${mode==='with'}">포함 · C</button></div></div>
      <p class="figure-caption">${esc(name(index))}의 선행 대응(A)은 유지하고, 제헌헌법의 후보에서 이 문헌만 ${mode==='without'?'제외':'포함'}합니다. 유진오 초고는 두 조건 모두 포함합니다.</p>`;
    root.querySelectorAll('[data-focus-doc]').forEach(button => button.onclick = () => { state.focusDoc = button.dataset.focusDoc; render(true); });
    root.querySelectorAll('[data-focus-mode]').forEach(button => button.onclick = () => { state.focusMode = button.dataset.focusMode; render(true); });
    ctx.drawOverview({ A, B, C, focus:index, aTotal, mode }, animate);
    panel.innerHTML = `<h2>${esc(name(index))}의 제외·포함 비교</h2><p>‘연결 개요’와 같은 배치와 선 굵기 기준으로, 가운데 문헌이 제헌헌법의 1위 대응이 되는 정도를 비교합니다.</p>
      <div class="metric-line"><strong>${count(C,index)}/103</strong><span>포함(C) 시 ${esc(name(index))}이<br>1위인 제헌헌법 조문</span></div>
      <p class="note">같은 포함 조건에서 유진오 초고는 ${count(C,YI)}/103조의 1위 대응입니다. 유진오 비교의 기본 하한도 0.60으로 맞추면 동일한 기준으로 볼 수 있습니다.</p>
      <h3>두 종류의 연결</h3><table class="defs"><tr><th>옅은 선 · A</th><td>${esc(name(index))} ${aTotal}조의 선행 대응입니다. 두 화면에 공통으로 유지합니다.</td></tr><tr><th>진한 선 · B/C</th><td>제헌헌법 103조의 대응입니다. B는 ${esc(name(index))} 제외, C는 포함 결과입니다.</td></tr><tr><th>검은 선</th><td>C에서 가운데 문헌 → 제헌헌법으로 이어지는 선입니다. 1위 대응 조문 수가 많을수록 굵습니다.</td></tr></table>
      <h3>제헌헌법의 대응 조문 수</h3><table><thead><tr><th>1위 대응 문헌</th><th class="n">B 제외</th><th class="n">C 포함</th></tr></thead><tbody>${ids.map(i=>`<tr ${i===index?'class="focused-row"':''}><td>${esc(name(i))}</td><td class="n">${i===index?'<abbr title="비교 후보에서 제외">—</abbr>':count(B,i)}</td><td class="n">${count(C,i)}</td></tr>`).join('')}<tr><th>합계</th><th class="n">103</th><th class="n">103</th></tr></tbody></table>
      <h3>비교의 범위</h3><p>유진오 초고와 나머지 후보는 B·C에 공통으로 포함됩니다. 왼쪽에는 가운데 문헌보다 늦게 나온 문헌도 있지만, A는 가운데 문헌보다 앞선 조문에서만 찾습니다.</p><p>이 수치는 현재 후보 조건에서의 텍스트 대응입니다. 문헌의 역사적 중요성 전체를 뜻하지는 않습니다.</p>
      <details><summary>계산 기준</summary><p>선택 문헌을 제외한 뒤 후보 내 BM25·코사인 순위를 각각 다시 계산하고 RRF로 결합합니다. BM25의 IDF와 저장된 임베딩은 공통으로 유지합니다.</p><p>후보 내 순위가 바뀌므로, 선택 문헌이 원래 1위가 아니었던 조문의 대응도 달라질 수 있습니다.</p><p>1위 결정 후 코사인 하한 0.60을 적용합니다. 하한 미만이면 차순위로 대체하지 않고 ‘대응 약함’으로 집계합니다.</p></details>`;
  }
  return { render, summary };
};
