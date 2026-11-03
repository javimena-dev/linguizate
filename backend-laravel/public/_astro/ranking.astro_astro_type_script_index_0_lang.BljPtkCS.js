import{t as e}from"./api.H-sYx554.js";import{c as t,r as n}from"./store.D7eAaHey.js";import{n as r,r as i}from"./avatar.BwDzOlBp.js";var a=e=>String(e??``).replace(/[&<>'"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,"'":`&#039;`,'"':`&quot;`})[e]);async function o(s=!1){let c=document.getElementById(`ranking-screen`);if(!c||!s&&c.dataset.initialized===`true`)return;c.dataset.initialized=`true`,await t();let l=document.getElementById(`ranking-loading`),u=document.getElementById(`ranking-table-wrap`),d=document.getElementById(`ranking-tbody`);l&&(l.style.display=`block`,l.innerHTML=`<span class="wave-loader" aria-hidden="true"><i></i><i></i><i></i></span><p style="margin-top: 10px;">Cargando clasificación…</p>`),u&&(u.style.display=`none`);try{let t=(await e.get(`/ranking`)).users||[],o=n.get();l&&(l.style.display=`none`),u&&(u.style.display=`block`),d&&(d.innerHTML=t.map((e,t)=>{let n=o&&o.id===e.id,s=t===0?`🥇`:t===1?`🥈`:t===2?`🥉`:`${t+1}`,c=e.role===`profesor`?`<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: rgba(99, 102, 241, 0.15); color: var(--primary-color);">Profesor</span>`:`<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); color: var(--success-color);">Estudiante</span>`,l=i(e.avatar),u=r(e.name||`U`);return`
              <tr style="border-bottom: 1px solid var(--table-row-border); ${n?`background: rgba(99, 102, 241, 0.08); font-weight: 600;`:``}">
                <td style="padding: 14px 20px; font-size: 1.1rem;">${s}</td>
                <td style="padding: 14px 20px; display: flex; align-items: center; gap: 10px;">
                  ${l?`<img src="${a(l)}" alt="Avatar" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">`:`<span style="display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); font-weight: 700; font-size: 0.85rem;">${a(u)}</span>`}
                  <span>${a(e.name)} ${n?`<span style="color: var(--primary-color);">(Tú)</span>`:``}</span>
                </td>
                <td style="padding: 14px 20px;">${c}</td>
                <td style="padding: 14px 20px; text-align: right;">${e.gamesPlayed||0}</td>
                <td style="padding: 14px 20px; text-align: right; font-weight: 700; color: var(--primary-color); font-size: 1.05rem;">
                  ${(e.score||0).toLocaleString()} pts
                </td>
              </tr>
            `}).join(``))}catch(e){l&&(l.style.display=`block`,l.innerHTML=`
          <div style="text-align: center; padding: 20px;">
            <p class="text-secondary" style="color: var(--error-color); margin-bottom: 12px;">
              ${a(e.message||`No se pudo cargar el ranking.`)}
            </p>
            <button type="button" class="btn-secondary" id="btn-retry-ranking">
              <i class="fas fa-redo"></i> Reintentar
            </button>
          </div>
        `,document.getElementById(`btn-retry-ranking`)?.addEventListener(`click`,()=>void o(!0)))}}o(),document.addEventListener(`astro:page-load`,()=>void o());