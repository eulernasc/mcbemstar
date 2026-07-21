import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const defaultProfessional = {
  id: "maykon-castro",
  nome: "Maykon Castro",
  especialidade: "Cabeleireiro e especialista em cuidados masculinos e femininos",
  foto: "assets/maykon-castro.webp",
  ordem: 1,
  ativo: true
};

const defaultServices = [
  { id: "padrao-01", nome: "Barba simples", preco: 30, duracao: 30, ordem: 1, ativo: true },
  { id: "padrao-02", nome: "Corte", preco: 45, duracao: 45, ordem: 2, ativo: true },
  { id: "padrao-03", nome: "Corte + barba", preco: 75, duracao: 60, ordem: 3, ativo: true },
  { id: "padrao-04", nome: "Corte + barba + design sobrancelha", preco: 85, duracao: 60, ordem: 4, ativo: true },
  { id: "padrao-05", nome: "Corte + barba + design sobrancelha pinça", preco: 100, duracao: 75, ordem: 5, ativo: true },
  { id: "padrao-06", nome: "Corte + design sobrancelha", preco: 55, duracao: 60, ordem: 6, ativo: true },
  { id: "padrao-07", nome: "Corte + pigmentação cabelo + barba", preco: 105, duracao: 90, ordem: 7, ativo: true, aPartirDe: true },
  { id: "padrao-08", nome: "Corte feminino curto", preco: 45, duracao: 45, ordem: 8, ativo: true },
  { id: "padrao-09", nome: "Corte feminino curto + design sobrancelha lâmina", preco: 55, duracao: 60, ordem: 9, ativo: true },
  { id: "padrao-10", nome: "Corte feminino longo", preco: 100, duracao: 75, ordem: 10, ativo: true },
  { id: "padrao-11", nome: "Corte feminino longo + sobrancelha lâmina", preco: 110, duracao: 75, ordem: 11, ativo: true },
  { id: "padrao-12", nome: "Corte feminino ombro", preco: 80, duracao: 60, ordem: 12, ativo: true },
  { id: "padrao-13", nome: "Corte feminino ombro + design sobrancelha lâmina", preco: 90, duracao: 75, ordem: 13, ativo: true },
  { id: "padrao-14", nome: "Design sobrancelha lâmina", preco: 10, duracao: 15, ordem: 14, ativo: true },
  { id: "padrao-15", nome: "Design sobrancelha pinça", preco: 25, duracao: 30, ordem: 15, ativo: true },
  { id: "padrao-16", nome: "Hidratação", preco: 45, duracao: 30, ordem: 16, ativo: true },
  { id: "padrao-17", nome: "Limpeza de pele / revitalização", preco: 45, duracao: 45, ordem: 17, ativo: true },
  { id: "padrao-18", nome: "Luzes", preco: 100, duracao: 120, ordem: 18, ativo: true },
  { id: "padrao-19", nome: "Pezinho barba", preco: 20, duracao: 15, ordem: 19, ativo: true },
  { id: "padrao-20", nome: "Pezinho cabelo + barba completa", preco: 45, duracao: 30, ordem: 20, ativo: true },
  { id: "padrao-21", nome: "Platinado", preco: 145, duracao: 150, ordem: 21, ativo: true, aPartirDe: true },
  { id: "padrao-22", nome: "Selagem / Botox", preco: 100, duracao: 45, ordem: 22, ativo: true }
];

const state = {
  professionals: [],
  services: [],
  filteredServices: [],
  schedule: { diasAtivos: [1,2,3,4,5,6], inicio: "07:00", fim: "19:00", intervalo: 30 },
  selectedProfessional: null,
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  bookingsForDate: []
};

const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const weekdays = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const $ = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const timeToMinutes = (time) => {
  const [h,m] = String(time || "00:00").split(":").map(Number);
  return h * 60 + m;
};
const minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function showToast(message, type = "success") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${type} show`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 3600);
}

async function loadProfessionals() {
  try {
    const snap = await getDocs(query(collection(db, "profissionais"), where("ativo", "==", true)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.ordem || 0) - (b.ordem || 0));
    state.professionals = list.length ? list : [defaultProfessional];
  } catch (error) {
    console.warn("Profissionais indisponíveis; usando cadastro padrão.", error);
    state.professionals = [defaultProfessional];
  }
  renderProfessionals();
}

async function loadServices() {
  try {
    const snap = await getDocs(query(collection(db, "servicos"), where("ativo", "==", true)));
    const fromDb = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.ordem || 0) - (b.ordem || 0));
    state.services = fromDb.length ? fromDb : defaultServices;
  } catch (error) {
    console.warn("Serviços do Firebase indisponíveis; usando catálogo padrão.", error);
    state.services = defaultServices;
  }
  state.filteredServices = [...state.services];
  renderServices();
}

async function loadSchedule() {
  try {
    const snap = await getDoc(doc(db, "config", "horarios"));
    if (snap.exists()) {
      const saved = snap.data();
      state.schedule = {
        diasAtivos: Array.isArray(saved.diasAtivos) ? saved.diasAtivos : [1,2,3,4,5,6],
        inicio: saved.inicio || "07:00",
        fim: saved.fim || "19:00",
        intervalo: 30
      };
    }
  } catch (error) {
    console.warn("Configuração de horário indisponível; usando padrão.", error);
  }
}

function renderProfessionals() {
  const list = $("professionals-list");
  if (!state.professionals.length) {
    list.innerHTML = '<div class="service-empty">Nenhum profissional disponível.</div>';
    return;
  }
  list.innerHTML = state.professionals.map(professional => `
    <article class="professional-card${state.selectedProfessional?.id === professional.id ? " selected" : ""}">
      <div class="professional-photo">
        <img src="${escapeHtml(professional.foto || defaultProfessional.foto)}" alt="${escapeHtml(professional.nome)}">
      </div>
      <div class="professional-copy">
        <span class="professional-kicker">Profissional</span>
        <h3>${escapeHtml(professional.nome)}</h3>
        <p>${escapeHtml(professional.especialidade || "Profissional do MC Bem Estar Studio")}</p>
        <div class="professional-tags"><span>Atendimento personalizado</span><span>Masculino e feminino</span></div>
        <button class="btn btn-primary choose-professional" data-professional-id="${escapeHtml(professional.id)}">
          ${state.selectedProfessional?.id === professional.id ? "Profissional selecionado" : `Escolher ${escapeHtml(professional.nome.split(" ")[0])}`}
        </button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-professional-id]").forEach(button => {
    button.addEventListener("click", () => selectProfessional(button.dataset.professionalId));
  });
}

function selectProfessional(professionalId) {
  state.selectedProfessional = state.professionals.find(item => item.id === professionalId);
  if (!state.selectedProfessional) return;
  renderProfessionals();
  const section = $("servicos");
  section.classList.remove("is-hidden");
  section.setAttribute("aria-hidden", "false");
  $("selected-professional-banner").innerHTML = `
    <img src="${escapeHtml(state.selectedProfessional.foto || defaultProfessional.foto)}" alt="${escapeHtml(state.selectedProfessional.nome)}">
    <div><span>Profissional selecionado</span><strong>${escapeHtml(state.selectedProfessional.nome)}</strong></div>
    <button type="button" id="change-professional">Trocar</button>`;
  $("change-professional").addEventListener("click", () => {
    document.querySelector("#profissionais").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function renderServices() {
  const list = $("services-list");
  if (!state.filteredServices.length) {
    list.innerHTML = '<div class="service-empty">Nenhum serviço encontrado.</div>';
    return;
  }
  list.innerHTML = state.filteredServices.map(service => `
    <article class="service-card">
      <div class="service-logo"><img src="assets/logo-mc-mark.png" alt="MC"></div>
      <div class="service-info">
        <h3 class="service-name">${escapeHtml(service.nome)}</h3>
        <div class="service-meta">
          <span class="service-price">${service.aPartirDe ? "A partir de " : ""}${money(service.preco)}</span>
          <span class="service-duration">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
            ${Number(service.duracao || 30)} min
          </span>
        </div>
      </div>
      <button class="btn btn-primary service-action" data-service-id="${escapeHtml(service.id)}">Agendar</button>
    </article>
  `).join("");

  list.querySelectorAll("[data-service-id]").forEach(button => {
    button.addEventListener("click", () => openBooking(button.dataset.serviceId));
  });
}

function filterServices(term) {
  const normalized = term.trim().toLocaleLowerCase("pt-BR");
  state.filteredServices = !normalized
    ? [...state.services]
    : state.services.filter(service => service.nome.toLocaleLowerCase("pt-BR").includes(normalized));
  renderServices();
}

function openBooking(serviceId) {
  if (!state.selectedProfessional) {
    showToast("Escolha o profissional antes do serviço.", "error");
    $("profissionais").scrollIntoView({ behavior: "smooth" });
    return;
  }
  state.selectedService = state.services.find(service => service.id === serviceId);
  if (!state.selectedService) return;
  state.selectedDate = null;
  state.selectedTime = null;
  state.calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.bookingsForDate = [];

  $("selected-professional").innerHTML = `
    <img src="${escapeHtml(state.selectedProfessional.foto || defaultProfessional.foto)}" alt="${escapeHtml(state.selectedProfessional.nome)}">
    <div><span>Profissional</span><strong>${escapeHtml(state.selectedProfessional.nome)}</strong></div>`;
  $("selected-service").innerHTML = `
    <div class="service-logo"><img src="assets/logo-mc-mark.png" alt="MC"></div>
    <div><span>Serviço</span><strong>${escapeHtml(state.selectedService.nome)}</strong><small>${state.selectedService.aPartirDe ? "A partir de " : ""}${money(state.selectedService.preco)} · ${Number(state.selectedService.duracao || 30)} min</small></div>`;
  $("selected-date-label").textContent = "";
  $("slot-help").textContent = "Selecione uma data";
  $("slots-grid").innerHTML = '<div class="slots-empty">Selecione um dia para ver os horários.</div>';
  $("booking-status").textContent = "";
  renderCalendar();
  $("booking-backdrop").classList.add("open");
  $("booking-backdrop").setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
  setTimeout(() => $("booking-name").focus(), 120);
}

function closeBooking() {
  $("booking-backdrop").classList.remove("open");
  $("booking-backdrop").setAttribute("aria-hidden", "true");
  document.body.classList.remove("locked");
}

function closeSuccess() {
  $("success-backdrop").classList.remove("open");
  $("success-backdrop").setAttribute("aria-hidden", "true");
  document.body.classList.remove("locked");
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  $("calendar-title").textContent = `${months[month]} ${year}`;
  const grid = $("calendar-grid");
  grid.innerHTML = weekdays.map(day => `<div class="weekday">${day}</div>`).join("");

  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstWeekday; i++) grid.insertAdjacentHTML("beforeend", '<span aria-hidden="true"></span>');

  const today = new Date();
  today.setHours(0,0,0,0);
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    date.setHours(0,0,0,0);
    const key = dateKey(date);
    const disabled = date < today || !state.schedule.diasAtivos.includes(date.getDay());
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.textContent = String(day);
    button.disabled = disabled;
    if (date.getTime() === today.getTime()) button.classList.add("today");
    if (state.selectedDate === key) button.classList.add("selected");
    if (!disabled) button.addEventListener("click", () => selectDate(date));
    grid.appendChild(button);
  }
}

function belongsToSelectedProfessional(booking) {
  if (!state.selectedProfessional) return true;
  const bookingProfessional = booking.profissionalId || defaultProfessional.id;
  return bookingProfessional === state.selectedProfessional.id;
}

async function fetchBookingsForDate(date) {
  const requests = [
    getDocs(query(collection(db, "agenda_publica"), where("data", "==", date))),
    getDocs(query(collection(db, "agendamentos"), where("data", "==", date)))
  ];
  const settled = await Promise.allSettled(requests);
  const merged = new Map();
  settled.forEach(result => {
    if (result.status !== "fulfilled") return;
    result.value.docs.forEach(snapshot => merged.set(snapshot.id, { id: snapshot.id, ...snapshot.data() }));
  });
  if (!merged.size && settled.every(result => result.status === "rejected")) {
    throw new Error("Não foi possível consultar a agenda.");
  }
  return [...merged.values()].filter(item => item.status !== "cancelado" && belongsToSelectedProfessional(item));
}

async function selectDate(date) {
  state.selectedDate = dateKey(date);
  state.selectedTime = null;
  $("selected-date-label").textContent = date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  renderCalendar();
  $("slot-help").textContent = "Carregando...";
  $("slots-grid").innerHTML = '<div class="slots-empty">Buscando horários disponíveis...</div>';

  try {
    state.bookingsForDate = await fetchBookingsForDate(state.selectedDate);
  } catch (error) {
    console.warn("Erro ao consultar agenda.", error);
    state.bookingsForDate = [];
  }
  renderSlots();
}

function bookingDuration(booking) {
  if (Number(booking.duracao)) return Number(booking.duracao);
  const service = state.services.find(item => item.id === booking.servico);
  return Number(service?.duracao || 30);
}

function isOverlapping(start, end, bookings = state.bookingsForDate) {
  return bookings.some(booking => {
    const bookingStart = timeToMinutes(booking.hora);
    const bookingEnd = bookingStart + bookingDuration(booking);
    return start < bookingEnd && end > bookingStart;
  });
}

function generateAvailableSlots() {
  if (!state.selectedDate || !state.selectedService || !state.selectedProfessional) return [];

  const opening = timeToMinutes(state.schedule.inicio);
  const closing = timeToMinutes(state.schedule.fim);
  const duration = Math.max(5, Number(state.selectedService.duracao || 30));
  const interval = 30;
  const now = new Date();
  const todayKey = dateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slots = [];

  for (let start = opening; start + duration <= closing; start += interval) {
    if (state.selectedDate === todayKey && start <= currentMinutes) continue;
    const end = start + duration;
    if (!isOverlapping(start, end)) slots.push(minutesToTime(start));
  }
  return slots;
}

function renderSlots() {
  const slots = generateAvailableSlots();
  const grid = $("slots-grid");
  $("slot-help").textContent = slots.length ? `${slots.length} disponíveis` : "Sem horários";
  if (!slots.length) {
    grid.innerHTML = '<div class="slots-empty">Não há horário livre para esse serviço neste dia.</div>';
    return;
  }
  grid.innerHTML = slots.map(time => `<button type="button" class="slot${state.selectedTime === time ? " selected" : ""}" data-time="${time}">${time}</button>`).join("");
  grid.querySelectorAll("[data-time]").forEach(button => button.addEventListener("click", () => {
    state.selectedTime = button.dataset.time;
    renderSlots();
  }));
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

function showBookingSuccess({ name, phone }) {
  const [year, month, day] = state.selectedDate.split("-");
  $("success-copy").textContent = `${name}, seu agendamento foi registrado. A confirmação automática será destinada somente ao WhatsApp informado no cadastro.`;
  $("success-details").innerHTML = `
    <div><span>Profissional</span><strong>${escapeHtml(state.selectedProfessional.nome)}</strong></div>
    <div><span>Serviço</span><strong>${escapeHtml(state.selectedService.nome)}</strong></div>
    <div><span>Data</span><strong>${day}/${month}/${year}</strong></div>
    <div><span>Horário</span><strong>${state.selectedTime}</strong></div>
    <div><span>WhatsApp</span><strong>${escapeHtml(phone)}</strong></div>`;
  $("success-backdrop").classList.add("open");
  $("success-backdrop").setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
}

async function confirmBooking() {
  const name = $("booking-name").value.trim();
  const phone = $("booking-phone").value.replace(/\D/g, "");
  const formattedPhone = $("booking-phone").value;
  const statusEl = $("booking-status");
  statusEl.textContent = "";

  if (name.length < 2) { statusEl.textContent = "Informe seu nome."; return; }
  if (phone.length < 10) { statusEl.textContent = "Informe um WhatsApp válido."; return; }
  if (!state.selectedProfessional) { statusEl.textContent = "Escolha o profissional."; return; }
  if (!state.selectedDate) { statusEl.textContent = "Escolha a data."; return; }
  if (!state.selectedTime) { statusEl.textContent = "Escolha o horário."; return; }

  const confirmButton = $("booking-confirm");
  confirmButton.disabled = true;
  confirmButton.textContent = "Confirmando...";
  try {
    const latestBookings = await fetchBookingsForDate(state.selectedDate);
    const start = timeToMinutes(state.selectedTime);
    const end = start + Number(state.selectedService.duracao || 30);
    if (isOverlapping(start, end, latestBookings)) {
      state.bookingsForDate = latestBookings;
      state.selectedTime = null;
      renderSlots();
      throw new Error("Esse horário acabou de ser ocupado. Escolha outro.");
    }

    const bookingRef = doc(collection(db, "agendamentos"));
    const publicRef = doc(db, "agenda_publica", bookingRef.id);
    await setDoc(bookingRef, {
      nome: name,
      tel: phone,
      servico: state.selectedService.id,
      servicoNome: state.selectedService.nome,
      preco: Number(state.selectedService.preco || 0),
      duracao: Number(state.selectedService.duracao || 30),
      profissionalId: state.selectedProfessional.id,
      profissionalNome: state.selectedProfessional.nome,
      data: state.selectedDate,
      hora: state.selectedTime,
      status: "confirmado",
      whatsappDestino: phone,
      whatsappConfirmacaoStatus: "pendente_api",
      criadoEm: new Date().toISOString()
    });
    await setDoc(publicRef, {
      data: state.selectedDate,
      hora: state.selectedTime,
      duracao: Number(state.selectedService.duracao || 30),
      profissionalId: state.selectedProfessional.id,
      status: "confirmado"
    }).catch(error => console.warn("Agenda pública não pôde ser espelhada.", error));

    closeBooking();
    showBookingSuccess({ name, phone: formattedPhone });
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message || "Não foi possível concluir. Tente novamente.";
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirmar agendamento";
  }
}

$("service-search").addEventListener("input", event => filterServices(event.target.value));
$("booking-close").addEventListener("click", closeBooking);
$("booking-cancel").addEventListener("click", closeBooking);
$("booking-confirm").addEventListener("click", confirmBooking);
$("booking-phone").addEventListener("input", event => { event.target.value = formatPhone(event.target.value); });
$("success-close").addEventListener("click", closeSuccess);
$("calendar-prev").addEventListener("click", () => {
  const now = new Date();
  const previous = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
  if (previous >= new Date(now.getFullYear(), now.getMonth(), 1)) state.calendarDate = previous;
  renderCalendar();
});
$("calendar-next").addEventListener("click", () => {
  state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
  renderCalendar();
});
$("booking-backdrop").addEventListener("click", event => {
  if (event.target === $("booking-backdrop")) closeBooking();
});
$("success-backdrop").addEventListener("click", event => {
  if (event.target === $("success-backdrop")) closeSuccess();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if ($("booking-backdrop").classList.contains("open")) closeBooking();
  if ($("success-backdrop").classList.contains("open")) closeSuccess();
});

await Promise.all([loadSchedule(), loadProfessionals(), loadServices()]);
