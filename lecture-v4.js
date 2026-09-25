/* Reading aids for the preserved rankings and separately transcribed reference notes. */
window.createLectureViews = function (ctx) {
  'use strict';
  const { state, nodes, CI, YI, yj, bandData, arts, lab, esc, panel } = ctx;
  const $ = s => document.querySelector(s);
  const no = uid => Number(uid.match(/(\d+)$/)[1]);
  const url = uid => `#article-${no(uid)}`;
  const notes = window.LINEAGE_MEMO_NOTES || [];
  const memoImages = window.LINEAGE_MEMO_IMAGES || {};
  let memoDialog=null;
  function openMemoImage(id) {
    const image=memoImages[id];
    if(!image)return;
    if(!memoDialog){
      memoDialog=document.createElement('dialog');
      memoDialog.className='memo-image-dialog';
      memoDialog.setAttribute('aria-labelledby','memoImageTitle');
      memoDialog.innerHTML='<div class="memo-image-header"><h2 id="memoImageTitle"></h2><div><button type="button" id="memoImageZoom" aria-pressed="false">원본 크기</button><button type="button" id="memoImageClose" autofocus aria-label="원본 메모 닫기">닫기 ×</button></div></div><div class="memo-image-body"><img id="memoImageFull" alt=""></div>';
      document.body.appendChild(memoDialog);
      $('#memoImageClose').onclick=()=>memoDialog.close();
      $('#memoImageZoom').onclick=()=>{
        const zoomed=memoDialog.classList.toggle('natural-size');
        $('#memoImageZoom').setAttribute('aria-pressed',zoomed);
        $('#memoImageZoom').textContent=zoomed?'화면에 맞추기':'원본 크기';
      };
      memoDialog.addEventListener('click',e=>{
        const r=memoDialog.getBoundingClientRect();
        if(e.target===memoDialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))memoDialog.close();
      });
      window.addEventListener('hashchange',()=>{if(memoDialog.open)memoDialog.close();});
    }
    const ids=Object.keys(memoImages).filter(key=>memoImages[key].src===image.src);
    $('#memoImageTitle').textContent=`${ids.join(' · ')} · 원본 메모`;
    $('#memoImageFull').src=image.src;
    $('#memoImageFull').alt=`${ids.join(' · ')} 참조메모 원본 · 초고 ${image.page}면`;
    memoDialog.classList.remove('natural-size');
    $('#memoImageZoom').setAttribute('aria-pressed',false);
    $('#memoImageZoom').textContent='원본 크기';
    memoDialog.showModal();
    memoDialog.querySelector('.memo-image-body').scrollTo(0,0);
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-memo-image]');
    if(button)openMemoImage(button.dataset.memoImage);
  });
  const type = d => d.handover ? 'match' : d.switched && d.a ? 'different' : d.c && !d.viaDraft ? 'outside' : 'weak';
  const types = [ ['match','문헌 일치'], ['different','문헌 불일치'], ['outside','초고 외 문헌'], ['weak','대응 약함'] ];
  const descriptions = {
    match:'B와 A의 선행 문헌이 같은 넘겨받기 조문입니다. 아래에서 같은 조문까지 일치하는지 구분할 수 있습니다.',
    different:'C에서는 초고가 1위이지만, B와 A의 선행 문헌이 서로 다른 조문입니다.',
    outside:'현재 하한에서 C의 1위가 초고 외 문헌인 조문입니다.',
    weak:'C가 하한 미만이거나, 초고가 1위여도 A·B 중 하나가 하한 미만인 조문입니다.'
  };
  let pickedType = 'match', pickedMatch = 'all', libraryToken = 0, memoSelection = null;
  function browserHTML(current, chosen = false) {
    if (current && !chosen) {
      if (pickedType !== type(current)) { pickedType = type(current); pickedMatch = 'all'; }
      if (pickedType === 'match' && pickedMatch !== 'all' && (pickedMatch === 'same') !== !!current.same) pickedMatch = 'all';
    }
    const bands = bandData(state.floor), matches = bands.filter(d=>d.handover);
    const rows = bands.filter(d=>type(d)===pickedType && (pickedType!=='match' || pickedMatch==='all' || (pickedMatch==='same' ? d.same : !d.same)));
    return `<div class="type-browser" data-current="${current?.u || ''}"><h3>유형별 조문 찾기</h3>
      <div class="type-tabs" role="group" aria-label="대응 유형">${types.map(([key,name])=>`<button type="button" data-type="${key}" aria-pressed="${pickedType===key}">${name} <b>${bands.filter(d=>type(d)===key).length}</b></button>`).join('')}</div>
      <p class="note">${descriptions[pickedType]}</p>
      ${pickedType==='match'?`<div class="match-options" role="group" aria-label="문헌 일치의 세부 유형">${[['all','전체',matches.length],['same','같은 조문',matches.filter(d=>d.same).length],['other','다른 조문',matches.filter(d=>!d.same).length]].map(([key,name,n])=>`<button type="button" data-match="${key}" aria-pressed="${pickedMatch===key}">${name} ${n}</button>`).join('')}</div>`:''}
      <div class="article-chips">${rows.map(d=>`<a href="${url(d.u)}" ${current?.u===d.u?'aria-current="page"':''} title="${esc(lab(d.u))} · ${esc(yj.finalChapters[d.ch][0])}${d.handover ? d.same?' · 같은 선행 조문':' · 같은 문헌의 다른 조문':''}">${esc(lab(d.u))}</a>`).join('') || '<p class="note">현재 조건에 해당하는 조문이 없습니다.</p>'}</div>
      <p class="note">코사인 하한 ${state.floor.toFixed(2)} · 조문을 누르면 상세 비교로 이동</p></div>`;
  }
  panel.addEventListener('click', e=>{
    const button=e.target.closest('[data-type],[data-match]');
    if(!button)return;
    const root=button.closest('.type-browser'); if(!root)return;
    if(button.dataset.type){pickedType=button.dataset.type;pickedMatch='all';}
    else pickedMatch=button.dataset.match;
    const current=bandData(state.floor).find(d=>d.u===root.dataset.current);
    root.outerHTML=browserHTML(current,true);
  });
  const names = { 'JP?':'일본 헌법 · 판본 미확정', 'JP1889':'대일본제국헌법', 'JP1946':'일본국헌법', 'PH?':'필리핀 헌법 · 판본 미확정', 'FR?':'프랑스 헌법 · 판본 미확정', 'WEIMAR?':'바이마르헌법', 'NK?':'북한 헌법안 · 판독 주의', 'ROC?':'중화민국 헌법·초안', 'HODGE?':'하지포고', 'US':'미국 헌법', 'AT?':'오스트리아 헌법 · 판본 미확정', 'KR_YAKHEON?':'조선임시약헌', 'PR?':'프로이센 헌법 · 판본 미확정' };
  function noteHTML(note) {
    const correction=['N03','N04'].includes(note.id)?'일본의 「十三」은 공포본 제14조로 잠정 보정하여 대조합니다. 메모에 적힌 번호와 분석상의 연결을 구분합니다.':note.id==='N08'?'일본의 「十五」는 공포본 제16조로 잠정 보정하여 대조합니다.':note.id==='N19'?'일본 신헌법의 「74」는 공포본 제78조로 잠정 보정하여 대조합니다.':'';
    const image=memoImages[note.id];
    return `<article class="memo-note" data-note-id="${esc(note.id)}"><h4>${esc(note.id)} <span>${esc(lab(note.draft))}</span></h4><p class="note">${esc(note.position)}</p>${image?`<button class="memo-image-preview" type="button" data-memo-image="${esc(note.id)}" aria-label="${esc(note.id)} 원본 메모 보기"><img src="${image.src}" alt="${esc(note.id)} 참조메모 미리보기" loading="lazy"><span>원본 메모 보기 <b aria-hidden="true">↗</b></span></button>`:''}<blockquote>${esc(note.original)}</blockquote>
      <dl><dt>기록된 참조</dt><dd>${esc(note.refs || '조번호 표기 없음')}</dd><dt>대조할 문헌</dt><dd>${note.codes.map(code=>esc(names[code]||code)).join(' · ')}</dd><dt>판독 상태</dt><dd>${esc(note.legibility)}</dd></dl>
      ${correction?`<p class="memo-caution">${correction}</p>`:''}${note.linkType==='moved'?'<p class="memo-caution">삭제·이동된 조문에 붙은 메모를 현재 대응 초고 조문에 연결했습니다.</p>':''}
      ${note.remarks?`<details><summary>판독·연결의 확인 사항</summary><p class="note">${esc(note.remarks)}</p></details>`:''}</article>`;
  }
  function memoHTML(draft) {
    const found=notes.filter(n=>n.draft===draft);
    if(!found.length)return '';
    return `<details class="source-note"><summary>초고의 참조메모 ${found.length}건</summary><p class="note">초고에 기록된 메모를 한 건씩 제시합니다. N은 메모 식별번호이며, 순위 계산과 별도로 대조하는 사료입니다.</p>${found.map(noteHTML).join('')}<a class="action-link" href="#memo">참조메모 연결 전체 보기 →</a></details>`;
  }
  async function renderLibrary() {
    const token=++libraryToken;
    const records=await arts(CI);
    if(token!==libraryToken||state.view!=='library')return;
    $('#libraryView').innerHTML=`<div class="library-tools"><label>내용 찾기 <input id="articleSearch" type="search" placeholder="조문 번호 또는 본문" aria-label="제헌헌법 원문 검색"></label><label>장 <select id="chapterSearch" aria-label="제헌헌법 장 선택"><option value="">모든 장</option>${yj.finalChapters.map(([ch],i)=>`<option value="${i}">제${i+1}장 ${esc(ch)}</option>`).join('')}</select></label><output id="libraryCount"></output></div><div id="libraryArticles"></div>`;
    function update() {
      const q=$('#articleSearch').value.trim(), chapter=$('#chapterSearch').value;
      const articleQuery=q.match(/^(?:제\s*)?(\d+)\s*(?:조)?$/);
      const found=yj.finalChapters.flatMap(([ch,uids],ci)=>uids.map(uid=>({uid,ch,ci,...records[uid]}))).filter(a=>(chapter===''||a.ci===Number(chapter))&&(!q||(articleQuery?no(a.uid)===Number(articleQuery[1]):`${a.l} ${a.o} ${a.k}`.includes(q))));
      $('#libraryCount').textContent=`${found.length} / 103조`;
      let previous=-1;
      $('#libraryArticles').innerHTML=found.map(a=>{
        const heading=previous===a.ci?'':`<h3 class="library-chapter">제${a.ci+1}장 ${esc(a.ch)}</h3>`;previous=a.ci;
        return `${heading}<a class="article-card" href="${url(a.uid)}"><h4>${esc(a.l)} <span>상세 비교 →</span></h4><div class="original-text">${esc(a.o)}</div>${a.o!==a.k?`<div class="hangul-text">${esc(a.k)}</div>`:''}</a>`;
      }).join('') || '<p>해당하는 조문이 없습니다.</p>';
    }
    $('#articleSearch').oninput=update;$('#chapterSearch').onchange=update;update();
    panel.innerHTML='<h2>제헌헌법 원문</h2><p>조문을 선택하면 선행 문헌과의 상세 비교로 이동합니다.</p><p>조문 번호·본문으로 검색하거나 장별로 찾아볼 수 있습니다.</p>';
  }
  function renderMemo() {
    const drafts=[...new Set(notes.map(n=>n.draft))].sort((a,b)=>no(a)-no(b));
    const codes=[...new Set(notes.flatMap(n=>n.codes))];
    const pairs=new Map();
    notes.forEach(n=>n.codes.forEach(code=>{const key=code+'|'+n.draft;if(!pairs.has(key))pairs.set(key,{code,draft:n.draft,ids:[]});pairs.get(key).ids.push(n.id);}));
    const filtered=notes.filter(n=>!memoSelection || memoSelection.id===n.id || memoSelection.draft===n.draft || n.codes.includes(memoSelection.code));
    const active=new Set(filtered.map(n=>n.id));
    const height=Math.max(600,100+drafts.length*31), leftY=i=>75+i*(height-115)/Math.max(1,codes.length-1),rightY=i=>75+i*(height-115)/Math.max(1,drafts.length-1);
    $('#memoView').innerHTML=`<div class="memo-tools"><label>참조메모 <select id="memoSelect" aria-label="참조메모 선택"><option value="">전체 메모 ${notes.length}건</option>${notes.map(n=>`<option value="${n.id}" ${memoSelection?.id===n.id?'selected':''}>${esc(n.id)} · ${esc(lab(n.draft))}</option>`).join('')}</select></label><button type="button" id="memoReset">전체 연결</button><span class="note">선 굵기는 일정 · 참조 관계의 강도를 뜻하지 않음</span></div>
      <div class="memo-graph-wrap"><svg class="memo-graph" viewBox="0 0 820 ${height}" role="img" aria-label="참조메모에 기록된 문헌과 유진오 초고 조문의 연결"><text x="210" y="28" text-anchor="end" class="memo-head">기록된 문헌명</text><text x="605" y="28" class="memo-head">유진오 초고 조문</text>
      ${[...pairs.values()].map(p=>{const y1=leftY(codes.indexOf(p.code)),y2=rightY(drafts.indexOf(p.draft)),on=p.ids.some(id=>active.has(id));return `<path class="memo-edge" d="M230,${y1} C400,${y1} 425,${y2} 590,${y2}" opacity="${on ? .6 : .07}"><title>${esc(names[p.code]||p.code)} → ${esc(lab(p.draft))} · ${p.ids.join(', ')}</title></path>`;}).join('')}
      ${codes.map((code,i)=>`<g class="memo-pick" role="button" tabindex="0" data-memo-code="${esc(code)}" aria-label="${esc(names[code]||code)}의 참조메모"><circle cx="230" cy="${leftY(i)}" r="5"/><text x="215" y="${leftY(i)+4}" text-anchor="end">${esc(names[code]||code)}</text></g>`).join('')}
      ${drafts.map((draft,i)=>`<g class="memo-pick" role="button" tabindex="0" data-memo-draft="${draft}" aria-label="${esc(lab(draft))}의 참조메모"><circle cx="590" cy="${rightY(i)}" r="5"/><text x="605" y="${rightY(i)+4}">${esc(lab(draft))}</text></g>`).join('')}</svg></div>`;
    const selectionLabel=memoSelection?.id||memoSelection?.draft&&lab(memoSelection.draft)||memoSelection?.code&&(names[memoSelection.code]||memoSelection.code);
    panel.innerHTML=`<h2>${selectionLabel?esc(selectionLabel):'참조메모'}</h2>
      ${selectionLabel?`${filtered.length>1?`<p class="note">메모 ${filtered.length}건</p>`:''}${filtered.map(noteHTML).join('')}`:'<p>문헌·초고 조문 선택 → 메모와 원본 이미지</p>'}`;
    panel.scrollTop=0;
    $('#memoSelect').onchange=e=>{memoSelection=e.target.value?{id:e.target.value}:null;renderMemo();};
    $('#memoReset').onclick=()=>{memoSelection=null;renderMemo();};
    $('#memoView').querySelectorAll('.memo-pick').forEach(el=>{
      const pick=()=>{memoSelection=el.dataset.memoCode?{code:el.dataset.memoCode}:{draft:el.dataset.memoDraft};renderMemo();};
      el.onclick=pick;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};
    });
  }
  return { browserHTML, memoHTML, renderLibrary, renderMemo, type, invalidate:()=>{libraryToken++;} };
};
