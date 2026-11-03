import { api } from './api';
import { $currentUser, logoutUser } from './store';
import { notify, runAsyncAction } from './feedback';
import { guardRoute } from './guards';

type Item = Record<string, any>;
type ListName = 'users' | 'questions' | 'categories';

const configurations: Record<ListName, { endpoint: string; key: string; fields: (item: Item) => string[] }> = {
  users: {
    endpoint: '/admin/users', key: 'users',
    fields: (u) => [
      String(u.id), u.name || '', u.email || '', u.role || '', String(u.score || 0), String(u.gamesPlayed || 0),
      u.role === 'profesor' && !u.authMethods?.includes('password') ? 'Invitación pendiente' : 'Activo'
    ]
  },
  questions: {
    endpoint: '/admin/questions', key: 'questions',
    fields: (q) => [String(q.id), q.question || '', q.difficulty || '', q.subcategoryId || '—']
  },
  categories: {
    endpoint: '/admin/categories', key: 'categories',
    fields: (c) => [String(c.id), c.name || '', c.isPersonal ? 'Profesor' : 'Sistema', c.accessCode || '—', c.approved ? 'Aprobada' : 'Pendiente / Oculta']
  }
};

class AdminList {
  private items: Item[] = [];
  private page = 1;
  private loading = false;
  private error = '';
  private request = 0;
  private search: HTMLInputElement;
  private sort: HTMLSelectElement;
  private direction: HTMLSelectElement;
  private size: HTMLSelectElement;
  private body: HTMLElement;
  private status: HTMLElement;
  private count: HTMLElement;
  private pageLabel: HTMLElement;
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;

  constructor(private root: HTMLElement, private name: ListName) {
    const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    this.search = get('[data-search]'); this.sort = get('[data-sort]');
    this.direction = get('[data-direction]'); this.size = get('[data-size]');
    this.body = get('[data-body]'); this.status = get('[data-status]');
    this.count = get('[data-count]'); this.pageLabel = get('[data-page]');
    this.previous = get('[data-prev]'); this.next = get('[data-next]');
    [this.search, this.sort, this.direction, this.size].forEach((control) => {
      control.addEventListener(control === this.search ? 'input' : 'change', () => { this.page = 1; this.render(); });
    });
    this.previous.addEventListener('click', () => { this.page--; this.render(); });
    this.next.addEventListener('click', () => { this.page++; this.render(); });
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-approval]');
      if (button) void this.updateApproval(button);
      const resend = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-resend-invitation]');
      if (resend) void this.resendInvitation(resend);
    });
    this.render();
  }

  async load() {
    const request = ++this.request;
    this.loading = true; this.error = ''; this.render();
    try {
      const config = configurations[this.name];
      const response = await api.get<Record<string, Item[]>>(config.endpoint);
      if (request !== this.request) return;
      this.items = response[config.key] || [];
    } catch (error: any) {
      if (request !== this.request) return;
      const isConnection = error?.isConnection || error?.code === 'CONNECTION' || error?.code === 'TIMEOUT';
      this.error = isConnection
        ? 'No se pudo conectar al servidor.'
        : error.message || 'No se pudieron cargar los datos.';
    } finally {
      if (request === this.request) { this.loading = false; this.render(); }
    }
  }

  private async updateApproval(button: HTMLButtonElement) {
    await runAsyncAction(button, async () => {
      await api.patch(`/admin/categories/${encodeURIComponent(button.dataset.id!)}/approval`, { approved: button.dataset.approval === 'true' });
      await this.load();
    }, {
      successMessage: 'Categoría actualizada',
      errorPrefix: 'No se pudo actualizar la categoría'
    });
  }

  private async resendInvitation(button: HTMLButtonElement) {
    await runAsyncAction(button, async () => {
      await api.post(`/admin/users/${encodeURIComponent(button.dataset.resendInvitation!)}/invitation`);
    }, {
      loadingLabel: 'Enviando…',
      successMessage: 'Invitación docente reenviada',
      errorPrefix: 'No se pudo reenviar la invitación'
    });
  }

  private render() {
    const config = configurations[this.name];
    const term = this.search.value.trim().toLocaleLowerCase('es');
    const filtered = this.items.filter((item) => config.fields(item).some((value) => value.toLocaleLowerCase('es').includes(term)));
    const key = this.sort.value;
    const multiplier = this.direction.value === 'asc' ? 1 : -1;
    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    filtered.sort((a, b) => {
      const comparison = key === 'score' || key === 'gamesPlayed'
        ? (Number(a[key]) || 0) - (Number(b[key]) || 0)
        : collator.compare(String(a.id), String(b.id));
      return multiplier * (comparison || collator.compare(String(a.id), String(b.id)));
    });
    const size = Number(this.size.value);
    const pages = Math.max(1, Math.ceil(filtered.length / size));
    this.page = Math.min(Math.max(this.page, 1), pages);
    this.body.replaceChildren();
    if (!this.loading && !this.error) {
      filtered.slice((this.page - 1) * size, this.page * size).forEach((item) => {
        const row = document.createElement('tr');
        const labels = Array.from(this.root.querySelectorAll('th')).map((th) => th.textContent || '');
        config.fields(item).forEach((value, index) => {
          const cell = document.createElement('td');
          cell.dataset.label = labels[index]; cell.textContent = value; row.append(cell);
        });
        if (this.name === 'categories') {
          const cell = document.createElement('td'); cell.dataset.label = 'Acciones';
          if (item.isPersonal) {
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'btn-secondary admin-action'; button.dataset.id = String(item.id);
            button.dataset.approval = String(!item.approved);
            button.textContent = item.approved ? 'Desaprobar' : 'Aprobar'; cell.append(button);
          } else cell.textContent = '—';
          row.append(cell);
        }
        if (this.name === 'users') {
          const cell = document.createElement('td'); cell.dataset.label = 'Acciones';
          if (item.role === 'profesor' && !item.authMethods?.includes('password')) {
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'btn-secondary admin-action';
            button.dataset.resendInvitation = String(item.id);
            button.textContent = 'Reenviar invitación'; cell.append(button);
          } else cell.textContent = '—';
          row.append(cell);
        }
        this.body.append(row);
      });
    }
    this.status.textContent = this.loading ? 'Cargando datos…' : this.error || (filtered.length === 0 ? 'No se encontraron resultados.' : '');
    this.count.textContent = this.loading || this.error ? '' : `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}`;
    this.pageLabel.textContent = `Página ${this.page} de ${pages}`;
    this.previous.disabled = this.loading || !!this.error || this.page <= 1;
    this.next.disabled = this.loading || !!this.error || this.page >= pages;
  }
}

async function setupAdmin() {
  const panel = document.getElementById('admin-panel-wrap');
  if (!panel || panel.dataset.initialized) return;
  panel.dataset.initialized = 'true';

  await guardRoute('admin');
  if (!$currentUser.get()?.isAdmin) return;

  const logoutBtn = document.getElementById('btn-admin-logout') as HTMLButtonElement | null;
  const exportBtn = document.getElementById('btn-export-research') as HTMLButtonElement | null;
  const invitationForm = document.getElementById('teacher-invitation-form') as HTMLFormElement | null;
  const invitationSubmit = document.getElementById('teacher-invite-submit') as HTMLButtonElement | null;

  const lists = Object.fromEntries(
    (['users', 'questions', 'categories'] as ListName[]).map((name) => [
      name,
      new AdminList(document.querySelector<HTMLElement>(`[data-list="${name}"]`)!, name)
    ])
  ) as Record<ListName, AdminList>;

  async function dashboard() {
    const statUsers = document.getElementById('stat-total-users')!;
    const statQuestions = document.getElementById('stat-total-questions')!;
    const statCategories = document.getElementById('stat-total-categories')!;
    try {
      // Un solo request al dashboard enriquecido que ya devuelve los conteos
      const result = await api.get<{
        users: Item[];
        totalUsers: number;
        totalQuestions: number;
        totalCategories: number;
      }>('/admin/dashboard');
      statUsers.textContent = String(result.totalUsers ?? (result.users || []).filter(u => u.role !== 'admin').length);
      statQuestions.textContent = String(result.totalQuestions ?? '—');
      statCategories.textContent = String(result.totalCategories ?? '—');
    } catch (err: any) {
      const isConn = err?.isConnection || err?.code === 'CONNECTION';
      const msg = isConn ? 'Sin conexión' : '—';
      statUsers.textContent = msg;
      statQuestions.textContent = msg;
      statCategories.textContent = msg;
    }
  }

  let panelShown = false;

  function selectSection() {
    if (!panelShown) return;
    const hash = window.location.hash.slice(1);
    const name = ['dashboard', 'users', 'questions', 'categories'].includes(hash) ? hash : 'dashboard';
    document.querySelectorAll<HTMLElement>('.admin-tab-content').forEach((section) => {
      section.style.display = section.id === `admin-sec-${name}` ? 'block' : 'none';
    });
    if (name in lists) void lists[name as ListName].load();
  }

  function showPanel() {
    if (panelShown) return;
    panelShown = true;
    panel!.style.display = 'block';
    void dashboard();
    selectSection();
  }

  showPanel();

  invitationForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = (document.getElementById('teacher-name') as HTMLInputElement | null)?.value.trim() || '';
    const email = (document.getElementById('teacher-email') as HTMLInputElement | null)?.value.trim() || '';
    if (!name || !email) {
      notify({ kind: 'warning', message: 'Completa nombre y correo del docente.' });
      return;
    }
    void runAsyncAction(invitationSubmit, async () => {
      await api.post('/admin/users', { name, email });
      invitationForm.reset();
      await lists.users.load();
    }, {
      loadingLabel: 'Enviando…',
      successMessage: 'Invitación docente enviada',
      errorPrefix: 'No se pudo invitar al docente'
    });
  });

  logoutBtn?.addEventListener('click', async () => {
    await runAsyncAction(logoutBtn, async () => {
      await logoutUser();
      window.location.href = '/';
    }, { loadingLabel: 'Saliendo…', silent: true });
  });

  exportBtn?.addEventListener('click', async () => {
    await runAsyncAction(exportBtn, async () => {
      const { default: XLSX } = await import('xlsx');
      const [dashboardData, questionData] = await Promise.all([
        api.get<{ users: Item[] }>('/admin/dashboard'),
        api.get<{ questions: Item[] }>('/admin/questions')
      ]);
      const games = (dashboardData.users || []).flatMap((user) =>
        (user.gameHistory || []).map((game: Item) => ({
          usuario: user.name, categoria: game.categoryName, subcategoria: game.subcategoryName,
          fecha: game.date, puntos: game.score, correctas: game.correctAnswers,
          incorrectas: game.incorrectAnswers, tiempoPromedioSegundos: game.avgResponseTimeSeconds
        }))
      );
      const questions = (questionData.questions || []).map((question) => ({
        id: question.id, pregunta: question.question, categoria: question.categoryName,
        subcategoria: question.subcategoryName, intentos: question.attemptCount,
        correctas: question.correctCount, precision: question.accuracyPercent
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(games), 'Partidas');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(questions), 'Preguntas');
      XLSX.writeFile(workbook, `linguizate_investigacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }, {
      loadingLabel: 'Exportando…',
      successMessage: 'Excel de investigación descargado'
    });
  });

  window.addEventListener('hashchange', selectSection);
  document.addEventListener('astro:before-swap', () => {
    window.removeEventListener('hashchange', selectSection);
  }, { once: true });
}

void setupAdmin();
document.addEventListener('astro:page-load', () => void setupAdmin());
