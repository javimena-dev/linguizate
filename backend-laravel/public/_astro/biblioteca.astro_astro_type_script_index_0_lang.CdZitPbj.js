import{t as e}from"./client.Cy7fLNQY.js";import{t}from"./api.H-sYx554.js";import{n,t as r}from"./store.D7eAaHey.js";import{t as i}from"./guards.RIMmCtw9.js";import{n as a,r as o}from"./feedback.BxC_oX2S.js";async function s(){let c=document.getElementById(`library-screen`);if(!c||c.dataset.initialized===`true`)return;c.dataset.initialized=`true`,await i(`estudiante`);let l=document.getElementById(`lib-access-code`),u=document.getElementById(`btn-lib-join`),d=document.getElementById(`lib-categories-grid`);d&&(d.innerHTML=`
        <div style="grid-column: 1 / -1; padding: 20px 0;">
          <span class="wave-loader" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="text-secondary" style="margin-left: 8px;">Cargando catálogo…</span>
        </div>
      `);try{let n=(await t.get(`/catalog`)).categories||[];d&&(d.innerHTML=n.map(e=>`
            <div class="category-card" style="cursor: pointer;" data-cat-id="${e.id}">
              <div class="category-card-icon">
                <i class="${e.icon||`fas fa-book`}"></i>
              </div>
              <div class="category-card-info">
                <h3>${e.name}</h3>
                <p>${e.description||``}</p>
                <span class="category-card-badge">${e.subcategories.length} subtemas</span>
              </div>
            </div>
          `).join(``),d.querySelectorAll(`.category-card`).forEach(t=>{t.addEventListener(`click`,()=>{e(`/categorias`)})}))}catch{d&&(d.innerHTML=`
          <div style="grid-column: 1 / -1; text-align: center; padding: 24px;">
            <p class="text-secondary" style="color: var(--error-color); margin-bottom: 12px;">No se pudo cargar el catálogo.</p>
            <button type="button" class="btn-secondary" id="btn-retry-lib"><i class="fas fa-redo"></i> Reintentar</button>
          </div>
        `,document.getElementById(`btn-retry-lib`)?.addEventListener(`click`,()=>{c.dataset.initialized=`false`,s()}))}u?.addEventListener(`click`,async()=>{let i=(l?.value||``).trim().toUpperCase();!i||i.length!==6?a({message:`Ingresa un código de 6 caracteres válido.`,kind:`warning`}):await o(u,async()=>{let a=await t.post(`/classes/join`,{accessCode:i});if(a?.category){let t=a.category,i=t.questions||[];if(!i.length)throw Error(`Esta categoría de clase no tiene preguntas aún.`);r.set({clientGameId:`game_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,category:{id:t.id,name:t.name},subcategory:{id:t.id,name:t.name},mode:n.get(),questions:i,currentQuestionIndex:0,score:0,streak:0,correctAnswers:0,incorrectAnswers:0,attempts:[],playedAt:new Date().toISOString()}),await e(`/juego`)}},{loadingLabel:`Verificando…`,silent:!0})})}s(),document.addEventListener(`astro:page-load`,s);