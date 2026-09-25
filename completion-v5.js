/* Saved completion interpretation: candidate exposure and model selections remain separate. */
window.createCompletionView = function ({state, panel, esc}) {
  const root = document.querySelector('#completionView'), index = window.COMPLETION_INDEX;
  const methods = [['rrf7','RRF 상위 7개'],['family14','14군 대표']];
  const relations = {substantive_correspondence:'실질적 대응',general_similarity:'일반적 유사',contrast:'대조',unrelated:'관련 없음',undetermined:'판단 유보'};
  const statusNames = {selected:'선택',not_selected:'비선택',missing:'검토 누락',check:'판정 확인',unoffered:'후보 미제시'};
  let method='rrf7', repeat=1, candidate=null, previousArticle=null, token=0, current=null, chartRepeat='all', family=null, lastScreen=null;
  const pending = new Map();
  let libraryQuery='', libraryChapter='';
  const methodName = key => methods.find(([k])=>key===k)[1];
  const noLabel = c => c.article_no == null ? '전문' : /^제/.test(c.article_no) ? c.article_no : `제${c.article_no}조`;
  const candidateName = c => `${c.document_title} ${noLabel(c)}`;
  const prose = text => `<div class="completion-prose">${esc(text)}</div>`;
  const list = values => Array.isArray(values)&&values.length ? `<ul class="completion-list">${values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>` : '';
  function load(n) {
    if(window.COMPLETION_ARTICLES[n]) return Promise.resolve(window.COMPLETION_ARTICLES[n]);
    if(!pending.has(n)) pending.set(n,new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=`completion-data/article-${n}.js`;
      script.onload=()=>window.COMPLETION_ARTICLES[n]?resolve(window.COMPLETION_ARTICLES[n]):reject(Error('자료 없음'));
      script.onerror=()=>{pending.delete(n);script.remove();reject(Error('자료 읽기 실패'));};document.head.appendChild(script);
    }));
    return pending.get(n);
  }
  function drawLibrary() {
    const chapters=[...new Set(index.articles.map(a=>a.chapter))];
    root.innerHTML=`<div class="library-tools"><label>내용 찾기 <input id="completionSearch" type="search" placeholder="조문 번호 또는 본문" aria-label="Completion 제헌헌법 원문 검색" value="${esc(libraryQuery)}"></label><label>장 <select id="completionChapter" aria-label="Completion 제헌헌법 장 선택"><option value="">모든 장</option>${chapters.map((ch,i)=>`<option value="${i}" ${libraryChapter===String(i)?'selected':''}>제${i+1}장 ${esc(ch)}</option>`).join('')}</select></label><output id="completionLibraryCount" aria-live="polite"></output></div><div id="completionLibraryArticles"></div>`;
    function update() {
      const q=libraryQuery.trim(), articleQuery=q.match(/^(?:제\s*)?(\d+)\s*(?:조)?$/);
      const found=index.articles.filter(a=>(libraryChapter===''||a.chapter===chapters[+libraryChapter])&&(!q||(articleQuery?a.article===Number(articleQuery[1]):`${a.original} ${a.text}`.includes(q))));
      document.querySelector('#completionLibraryCount').textContent=`${found.length} / 103조`;
      let previous=null;
      document.querySelector('#completionLibraryArticles').innerHTML=found.map(a=>{
        const heading=previous===a.chapter?'':`<h3 class="library-chapter">제${chapters.indexOf(a.chapter)+1}장 ${esc(a.chapter)}</h3>`;
        previous=a.chapter;
        return `${heading}<a class="article-card" href="#completion-${a.article}"><h4>제${a.article}조 <span>AI 해석 →</span></h4><div class="original-text">${esc(a.original)}</div>${a.original!==a.text?`<div class="hangul-text">${esc(a.text)}</div>`:''}</a>`;
      }).join('')||'<p class="note">해당하는 조문 없음</p>';
    }
    document.querySelector('#completionSearch').oninput=e=>{libraryQuery=e.target.value;update();};
    document.querySelector('#completionChapter').onchange=e=>{libraryChapter=e.target.value;update();};
    update();
    panel.innerHTML='<h2>제헌헌법 원문</h2><p>조문 번호·본문 검색 / 장별 탐색</p><p>조문 선택 → AI의 선택 결과와 판단 근거</p>';
  }
  function selectors() {
    return `<div class="completion-controls"><label>제헌헌법 <select id="completionArticle" aria-label="Completion 조문 선택">${[...new Set(index.articles.map(a=>a.chapter))].map(ch=>`<optgroup label="${esc(ch)}">${index.articles.filter(a=>a.chapter===ch).map(a=>`<option value="${a.article}" ${a.article===state.completionArticle?'selected':''}>제${a.article}조 · ${esc(ch)}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="completion-pager">${state.completionArticle>1?`<a href="#completion-${state.completionArticle-1}">← 이전</a>`:''}${state.completionArticle<103?`<a href="#completion-${state.completionArticle+1}">다음 →</a>`:''}</div></div>`;
  }
  function responseControls() {
    return `<div class="completion-switch toggle" role="group" aria-label="Completion 후보 선정 방식">${methods.map(([key,name])=>`<button type="button" data-cm="${key}" aria-pressed="${method===key}">${name}</button>`).join('')}</div><div class="completion-switch toggle" role="group" aria-label="Completion 실행 회차">${[1,2,3].map(r=>`<button type="button" data-cr="${r}" aria-pressed="${repeat===r}">${r}회</button>`).join('')}</div>`;
  }
  function wireResponseControls(container) {
    container.querySelectorAll('[data-cm]').forEach(b=>b.onclick=()=>{method=b.dataset.cm;drawArticle();});
    container.querySelectorAll('[data-cr]').forEach(b=>b.onclick=()=>{repeat=+b.dataset.cr;drawArticle();});
  }
  function obs(cid,m) {return current.methods[m].observations[cid];}
  function cells(cid,m) {
    const states=obs(cid,m);
    if(!states) return `<td class="completion-missing"><button type="button" data-pick="${esc(cid)}" data-method="${m}">미제시</button></td>`;
    const count=states.filter(o=>o.status==='selected').length, valid=states.filter(o=>['selected','not_selected'].includes(o.status)).length;
    return `<td class="completion-selection ${candidate===cid&&method===m?'active':''}"><div class="completion-dots">${states.map((o,i)=>`<button type="button" class="${o.status}" data-pick="${esc(cid)}" data-method="${m}" data-repeat="${i+1}" aria-label="${esc(candidateName(current.candidates[cid]))} · ${methodName(m)} · ${i+1}회 ${statusNames[o.status]}" title="${i+1}회: ${statusNames[o.status]}" aria-pressed="${candidate===cid&&method===m&&repeat===i+1}">${o.status==='selected'?'●':o.status==='not_selected'?'—':'?'}</button>`).join('')}</div><small>${valid===3?`${count}/3회 선택`:`${count}회 선택 · ${valid}회 확인`}</small></td>`;
  }
  function drawArticle() {
    if(!current||state.view!=='completion'||state.completionTab!=='articles') return;
    const n=current.article, q=current.query;
    if(previousArticle!==n){candidate=null;previousArticle=n;}
    const ids=Object.keys(current.candidates).sort((a,b)=>{
      const score=id=>Math.max(...methods.map(([m])=>(obs(id,m)||[]).filter(o=>o.status==='selected').length));
      return score(b)-score(a)||current.candidates[a].rrf_rank-current.candidates[b].rrf_rank;
    });
    if(!candidate||!current.candidates[candidate]) candidate=ids[0];
    root.innerHTML=`${selectors()}<section class="completion-target"><span class="completion-eyebrow">${esc(current.chapter)}</span><h3>제헌헌법 제${n}조</h3>${prose(q.original_text)}${q.workbook_text_ko!==q.original_text?`<div class="completion-korean">${esc(q.workbook_text_ko)}</div>`:''}</section>
      <div class="completion-intro"><h3>후보별 선택 비교</h3><p>같은 조문, 두 후보 구성 · 각 3회 실행</p></div>
      <div class="completion-legend"><span class="selected">● 선택</span><span>— 비선택</span><span>? 검토 누락</span><span>미제시: 해당 방식의 후보에 없음</span></div>
      <div class="completion-table-wrap"><table class="completion-table"><thead><tr><th>비교 후보 <small>선택 횟수순 · 동률은 RRF순</small></th>${methods.map(([m,name])=>`<th>${name}<small>${current.methods[m].candidate_ids.length}개 조문 · ${new Set(current.methods[m].candidate_ids.map(id=>current.candidates[id].family_id)).size}개 군</small><span class="completion-repeat-labels"><span>1회</span><span>2회</span><span>3회</span></span></th>`).join('')}</tr></thead><tbody>${ids.map(id=>{const c=current.candidates[id];return `<tr class="${candidate===id?'chosen':''}"><th scope="row"><button type="button" data-pick="${esc(id)}" class="completion-candidate">${esc(candidateName(c))}</button><small>전체 RRF ${c.rrf_rank}위</small></th>${methods.map(([m])=>cells(id,m)).join('')}</tr>`;}).join('')}</tbody></table></div>
      <p class="note">문헌명 또는 회차의 표시를 선택 → 해당 조문의 문언·판단 근거</p>
      <section id="completionReview" class="completion-review"></section>`;
    document.querySelector('#completionArticle').onchange=e=>location.hash=`#completion-${e.target.value}`;
    root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
      candidate=b.dataset.pick;if(b.dataset.method)method=b.dataset.method;if(b.dataset.repeat)repeat=+b.dataset.repeat;
      drawArticle();panel.scrollTop=0;
      if(matchMedia('(max-width:900px)').matches) panel.scrollIntoView({behavior:'smooth',block:'start'});
    });
    drawReview();drawCandidate();
  }
  function drawReview() {
    const review=current.methods[method].review;
    document.querySelector('#completionReview').innerHTML=`<h3>사후 검토 <span>${methodName(method)}</span></h3>${review?`${prose(review.data.synthesis)}${review.data.issues?.length?`<details><summary>검토 의견 ${review.data.issues.length}건</summary>${review.data.issues.map(issue=>`<div class="completion-review-item">${issue.repeats?`<small>${esc(issue.repeats.join('·'))}회${issue.candidate_id&&current.candidates[issue.candidate_id]?' · '+esc(candidateName(current.candidates[issue.candidate_id])):''}</small>`:''}${prose(issue.finding)}${issue.action?`<p class="note">${esc(issue.action)}</p>`:''}</div>`).join('')}</details>`:''}${review.data.limits?.length?`<details><summary>검토 범위</summary>${list(review.data.limits)}</details>`:''}`:'<p class="note">이 조문의 개별 사후 해설 기록 없음 · 모델의 3회 원응답은 모두 수록</p>'}`;
  }
  function drawCandidate() {
    const c=current.candidates[candidate], entry=current.methods[method], response=entry.responses[repeat-1];
    const state=(obs(candidate,method)||[])[repeat-1]?.status||'unoffered';
    const matching=response.data.candidate_reviews.filter(r=>r.candidate_id===candidate);
    const review=matching.length===1?matching[0]:null;
    panel.innerHTML=`<h2>선택 근거</h2>${responseControls()}<p class="completion-eyebrow">제헌헌법 제${current.article}조의 비교 후보</p><h3 class="completion-detail-title">${esc(candidateName(c))}</h3><p class="completion-verdict ${state}">${statusNames[state]}${review?.relation?` <span>· ${esc(relations[review.relation]||review.relation)}</span>`:''}</p>
      ${review?prose(review.reason):`<p>${state==='unoffered'?'이 방식의 입력 후보에 없음':state==='missing'?'입력 후보에 포함 · 이 회차의 개별 검토 누락':'원응답에서 판정 확인 필요'}</p>`}
      ${review?.evidence?.length?`<h3>대응 근거 · 모델의 인용</h3>${review.evidence.map(e=>`<details class="completion-evidence"><summary>${esc(e.element)}</summary><span class="completion-eyebrow">제헌헌법 제${current.article}조 · ${e.target_field==='original_text'?'원문':'한글'}</span><blockquote>${esc(e.target_quote)}</blockquote><span class="completion-eyebrow">후보 조문 · ${e.candidate_field==='original_text'?'원문':'한글'}</span><blockquote>${esc(e.candidate_quote)}</blockquote><p><b>공통점</b> ${esc(e.commonality)}</p><p><b>차이점</b> ${esc(e.difference)}</p></details>`).join('')}`:''}
      <details class="completion-source"><summary>후보 조문 전체 문언</summary>${prose(c.original_text)}${c.workbook_text_ko!==c.original_text?`<div class="completion-korean">${esc(c.workbook_text_ko)}</div>`:''}<p class="note">전체 RRF ${c.rrf_rank}위 · BM25 ${c.bm25_rank}위 · 코사인 ${c.cosine_rank}위</p></details>
      <details><summary>이번 회차의 전체 해석</summary>${prose(response.data.short_answer)}${list(response.data.unexplained_elements)}${list(response.data.limitations)}</details>
      <div class="completion-downloads"><a class="text-link" href="${response.raw}" target="_blank" rel="noopener">${repeat}회 원응답 JSON ↗</a><a class="text-link" href="${entry.input}" target="_blank" rel="noopener">입력 조문·후보 JSON ↗</a></div>
      <p class="note">모델 원응답 · 사후 검토는 왼쪽 별도 수록</p>`;
    wireResponseControls(panel);
  }
  function selectedValue(info) {return chartRepeat==='all'?info.selected.reduce((s,ids)=>s+ids.length,0)/3:info.selected[+chartRepeat-1].length;}
  function drawDocuments() {
    const entries=Object.entries(index.families).sort(([a],[b])=>Math.max(...methods.map(([m])=>selectedValue(index.methods[m].families[b])))-Math.max(...methods.map(([m])=>selectedValue(index.methods[m].families[a]))));
    root.innerHTML=`<div class="completion-controls"><label>집계 <select id="completionChartRepeat" aria-label="문헌별 선택 집계 회차"><option value="all">3회 평균</option>${[1,2,3].map(r=>`<option value="${r}">${r}회</option>`).join('')}</select></label><span class="note">단위: 선택된 제헌헌법 조문 수 / 전체 103조</span></div>
      <div class="completion-chart-key"><span><i class="rrf7"></i>RRF 상위 7개</span><span><i class="family14"></i>14군 대표</span></div>
      <div class="completion-chart">${entries.map(([fid,name])=>`<section class="completion-bar-row"><button type="button" data-family="${esc(fid)}">${esc(name)}</button><div>${methods.map(([m])=>{const info=index.methods[m].families[fid],n=selectedValue(info);return `<button type="button" class="completion-track" data-family="${esc(fid)}" aria-label="${esc(name)} · ${methodName(m)} · ${chartRepeat==='all'?'평균 ':''}${Number(n.toFixed(1))}조 선택, ${info.offered.length}조에 후보 제시"><span class="completion-bar ${m}" style="width:${n/103*100}%"></span><b>${chartRepeat==='all'?n.toFixed(1):n}</b><small>후보 제시 ${info.offered.length}조</small></button>`;}).join('')}</div></section>`).join('')}</div><p class="note">공통 눈금 0–103조 · 같은 문헌군의 복수 후보를 선택해도 제헌헌법 한 조문당 1회 집계</p>`;
    document.querySelector('#completionChartRepeat').value=chartRepeat;
    document.querySelector('#completionChartRepeat').onchange=e=>{chartRepeat=e.target.value;drawDocuments();};
    root.querySelectorAll('[data-family]').forEach(b=>b.onclick=()=>{family=b.dataset.family;drawFamily();panel.scrollTop=0;});
    drawFamily();
  }
  function drawFamily() {
    if(!family){panel.innerHTML=`<h2>문헌별 선택 분포</h2><p><b>막대:</b> 해당 문헌군이 선택된 제헌헌법 조문 수</p><p><b>후보 제시:</b> 해당 문헌군의 조문을 입력받은 제헌헌법 조문 수</p><p><b>3회 평균:</b> 회차별 선택 조문 수의 산술평균</p><h3>집계 기준</h3><p>한 조문에서 여러 문헌 선택 가능 · 문헌별 수의 합계는 103을 초과</p><p>검토 누락은 선택·비선택 어느 쪽에도 미포함</p><p class="note">문헌명이나 막대 선택 → 해당 조문 목록</p>`;return;}
    panel.innerHTML=`<h2>${esc(index.families[family])}</h2>${methods.map(([m,name])=>{const info=index.methods[m].families[family],ids=chartRepeat==='all'?[...new Set(info.selected.flat())].sort((a,b)=>a-b):info.selected[+chartRepeat-1], unknown=chartRepeat==='all'?[...new Set(info.unchecked.flat())]:info.unchecked[+chartRepeat-1];return `<h3>${name}</h3><p>후보 제시 ${info.offered.length}조 · ${chartRepeat==='all'?'한 번 이상 선택':chartRepeat+'회 선택'} ${ids.length}조</p><div class="completion-article-links">${ids.map(n=>`<a href="#completion-${n}">제${n}조</a>`).join('')||'<span class="note">선택 조문 없음</span>'}</div>${unknown.length?`<p class="note">검토 누락으로 미확정: ${unknown.map(n=>`제${n}조`).join(', ')}</p>`:''}`;}).join('')}<p><button type="button" class="action-link" id="completionClearFamily">전체 설명</button></p>`;
    document.querySelector('#completionClearFamily').onclick=()=>{family=null;drawFamily();};
  }
  function drawMethods() {
    root.innerHTML=`<div class="completion-method-intro"><span class="completion-eyebrow">검색에서 문언 해석으로</span><h3>무엇을 후보로 보여 주는가</h3><p>동일한 제헌헌법 조문에 서로 다른 후보 구성을 제시한 두 실험</p></div><div class="completion-method-grid">${methods.map(([m,name])=>`<section><span class="completion-eyebrow">${m==='rrf7'?'전체 순위 중심':'문헌군별 대표'}</span><h3>${name}</h3><strong>${m==='rrf7'?'7':'14'}<small>개 후보 / 조문</small></strong><p>${m==='rrf7'?'전체 RRF 순위 1–7위 조문':'14개 문헌군에서 각각 RRF 1위 조문'}</p><p class="note">${m==='rrf7'?'동일 문헌군의 여러 조문 가능 · 조문별 2–7개 군':'판본을 묶은 14개 군 모두 유지 · 군마다 1개 대표 선택'}</p></section>`).join('')}</div>
      <div class="completion-process"><span>제헌헌법 1개 조문</span><span>→ 후보 조문 제시</span><span>→ 문언·제도 비교</span><span>→ 복수 선택과 근거</span></div>
      <table class="completion-method-table"><tbody><tr><th>대상</th><td>제헌헌법 103개 조문</td></tr><tr><th>검색 범위</th><td>19개 판본 · 14개 문헌군 · 1,563개 후보 조문</td></tr><tr><th>검색 기준</th><td>BM25·임베딩 순위를 결합한 RRF · 코사인 하한 없음</td></tr><tr><th>반복</th><td>같은 입력으로 3회씩 · 방식별 309회 · 총 618개 저장 응답</td></tr><tr><th>모델</th><td>${esc(index.model)}</td></tr><tr><th>모델에 제시</th><td>제헌헌법과 후보의 원문·한글 문언 · 순위·점수·문헌군 표기는 미제시</td></tr><tr><th>선택 기준</th><td>실질적 대응 여부 · 복수 후보 선택 또는 선택 없음</td></tr><tr><th>사후 검토</th><td>14군 대표: 103조 전체 · RRF 상위 7개: 11개 조문</td></tr></tbody></table>
      <details><summary>14개 문헌군</summary><div class="completion-family-list">${Object.values(index.families).map(name=>`<span>${esc(name)}</span>`).join('')}</div></details>
      <details><summary>후보 선정과 검토의 구분</summary><p>후보 선정 노트북: 8개 진단 조문의 예비 검토 → 이 화면: 별도로 실행한 103조 × 3회 결과</p><p>참조메모·신우철 대응 결과: completion 입력에 미포함 · 생성 후 별도 평가 자료</p><p>모델의 선택과 인용: 저장된 원응답 그대로 · 사후 검토: 응답 생성 뒤 문언 대조와 판단 검토</p><p>후보 검토 누락: RRF 상위 7개 4건, 14군 대표 15건 · 비선택과 구분</p></details>`;
    panel.innerHTML=`<h2>Completion 해석</h2><p>검색으로 추린 후보를 모델이 문언 단위로 비교한 결과</p><h3>기존 지도와의 관계</h3><p>기존 지도: RRF 1위 조문의 대응</p><p>이 탭: 제시된 후보들의 복수 선택과 판단 근거</p><p class="note">별도 후보 범위 · 유진오 초고·행정연구위원회안 미포함</p><h3>선택 표 읽기</h3><p>● 선택 · — 비선택 · ? 검토 누락</p><p>미제시: 해당 방식의 입력 후보에 없음</p><p>3/3회 선택: 같은 후보가 세 번 모두 선택됨 · 영향력의 크기나 확률을 뜻하는 수치는 아님</p><h3>비교 예시</h3><a class="action-link" href="#completion-74">제74조 · 후보 범위의 차이 →</a>`;
  }
  async function render() {
    const t=++token;
    const screen=`${state.completionTab}:${state.completionArticle}`;
    if(screen!==lastScreen){document.querySelector('#stage').scrollTop=0;panel.scrollTop=0;lastScreen=screen;}
    if(state.completionTab==='documents'){drawDocuments();return;}
    if(state.completionTab==='methods'){drawMethods();return;}
    if(state.completionTab==='library'){drawLibrary();return;}
    root.innerHTML='<p class="note">저장된 결과를 불러오는 중…</p>';
    panel.innerHTML='<h2>Completion 해석</h2>';
    try {
      const data=await load(state.completionArticle);
      if(t!==token||state.view!=='completion'||state.completionTab!=='articles')return;
      current=data;drawArticle();
    }catch(err){if(t===token)root.innerHTML='<p>자료를 불러오지 못함 · 페이지를 새로고침해 다시 시도</p>';}
  }
  return {render};
};
