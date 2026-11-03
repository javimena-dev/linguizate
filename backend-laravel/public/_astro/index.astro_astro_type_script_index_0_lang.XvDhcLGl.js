import{t as e}from"./client.Cy7fLNQY.js";import{t}from"./api.H-sYx554.js";import{n,t as r}from"./store.D7eAaHey.js";import{n as i}from"./audio.DLPgoG4q.js";import{i as a,n as o}from"./feedback.BxC_oX2S.js";var s=[],c=!1,l={general:`#6366F1`,descriptiva:`#8B5CF6`,historica:`#F59E0B`,sociolinguistica:`#FF8C00`,psicolinguistica:`#EC4899`,computacional:`#06B6D4`,aplicada:`#10B981`,diversidad_curiosidades:`#F97316`};function u(e){return l[e]||`#6366F1`}async function d(l=!1){let f=document.getElementById(`categories-screen`);if(!f||!l&&f.dataset.initialized===`true`)return;f.dataset.initialized=`true`;let p=document.getElementById(`categories-grid`),m=document.getElementById(`subcategories-grid`),h=document.getElementById(`cat-screen-title`),g=document.getElementById(`cat-screen-subtitle`),_=document.getElementById(`cat-nav-actions`),v=document.getElementById(`btn-back-to-categories`);p&&(p.innerHTML=`
        <div class="loading-spinner-wrap" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
          <span class="wave-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          <p style="margin-top: 10px;">Cargando catálogo…</p>
        </div>
      `);try{s=(await t.get(`/catalog`)).categories||[],y()}catch{p&&(p.innerHTML=`
          <div class="error-msg" style="grid-column: 1 / -1; text-align: center; color: var(--error-color); padding: 30px;">
            <i class="fas fa-exclamation-triangle fa-2x"></i>
            <p style="margin: 10px 0 16px;">No se pudo cargar el catálogo de preguntas.</p>
            <button type="button" class="btn-secondary" id="btn-retry-catalog">
              <i class="fas fa-redo"></i> Reintentar
            </button>
          </div>
        `,document.getElementById(`btn-retry-catalog`)?.addEventListener(`click`,()=>void d(!0)))}function y(){p&&(p.style.display=`grid`,m&&(m.style.display=`none`),_&&(_.style.display=`none`),h&&(h.textContent=`Selecciona una Categoría`),g&&(g.textContent=`Elige la rama lingüística en la que deseas poner a prueba tus conocimientos`),p.innerHTML=`
        <button type="button" class="random-category-btn" id="btn-random-category" aria-label="Seleccionar una categoría al azar">
          <i class="fas fa-random" aria-hidden="true"></i>
          <h3>Selección Aleatoria</h3>
          <p>¡Deja que la suerte decida tu categoría!</p>
        </button>
      `+s.map(e=>`
          <button type="button" class="category-card" data-cat-id="${e.id}" style="--category-color: ${u(e.id)}">
            <div class="category-card-icon">
              <i class="${e.icon||`fas fa-book`}"></i>
            </div>
            <div class="category-card-info">
              <h3>${e.name}</h3>
              <p>${e.description||``}</p>
              <span class="category-card-badge">
                ${e.subcategories.length} temas
              </span>
            </div>
          </button>
        `).join(``),document.getElementById(`btn-random-category`)?.addEventListener(`click`,b),p.querySelectorAll(`.category-card`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.getAttribute(`data-cat-id`),n=s.find(e=>e.id===t);n&&(i(`select`),x(n))})}))}function b(){if(!p||c||!s.length)return;let e=Array.from(p.querySelectorAll(`.category-card`)),t=document.getElementById(`btn-random-category`);if(!e.length)return;c=!0,p.setAttribute(`aria-busy`,`true`),e.forEach(e=>{e.disabled=!0}),t&&(t.disabled=!0),i(`select`);let n=Math.floor(Math.random()*e.length),r=e.length*2+n+1,a=0,o=()=>e.forEach(e=>e.classList.remove(`ruleta-active`,`ruleta-winner`)),l=()=>{o();let u=a%e.length,d=e[u],f=a===r-1;if(d.classList.add(f?`ruleta-winner`:`ruleta-active`),f){i(`correct`),window.setTimeout(()=>{o(),p.removeAttribute(`aria-busy`),e.forEach(e=>{e.disabled=!1}),t&&(t.disabled=!1),c=!1,x(s[n])},850);return}a+=1;let m=a/r;window.setTimeout(l,65+Math.round(m*m*180))};l()}function x(s){p&&m&&(p.style.display=`none`,m.style.display=`grid`,m.dataset.count=String(s.subcategories.length),_&&(_.style.display=`block`),h&&(h.textContent=s.name),g&&(g.textContent=`Selecciona una subcategoría para comenzar la trivia`),m.innerHTML=s.subcategories.map(e=>`
          <button type="button" class="subcategory-card" data-sub-id="${e.id}" style="--category-color: ${u(s.id)}">
            <div class="subcategory-card-icon">
              <i class="${e.icon||`fas fa-book-open`}"></i>
            </div>
            <div class="subcategory-card-info">
              <h4>${e.name}</h4>
              <p>${e.description||``}</p>
              <span class="subcategory-card-count">
                <i class="fas fa-question-circle"></i> ${e.questionCount} preguntas
              </span>
            </div>
          </button>
        `).join(``),m.querySelectorAll(`.subcategory-card`).forEach(c=>{c.addEventListener(`click`,async()=>{let l=c.getAttribute(`data-sub-id`),u=s.subcategories.find(e=>e.id===l);if(!u)return;let d=c;a(d,!0,`Preparando`),i(`select`);try{let i=(await t.get(`/subcategories/${l}/questions`)).questions||[];if(!i.length){o({kind:`warning`,message:`Esta subcategoría no tiene preguntas activas.`}),a(d,!1);return}r.set({clientGameId:`game_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,category:{id:s.id,name:s.name},subcategory:{id:u.id,name:u.name},mode:n.get(),questions:i,currentQuestionIndex:0,score:0,streak:0,correctAnswers:0,incorrectAnswers:0,attempts:[],playedAt:new Date().toISOString()}),await e(`/juego`)}catch(e){a(d,!1),o({kind:`error`,message:e.message||`No se pudieron cargar las preguntas.`})}})}))}v?.addEventListener(`click`,()=>{i(`select`),y()})}d(),document.addEventListener(`astro:page-load`,()=>void d());