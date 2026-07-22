const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret, defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const REGION = "southamerica-east1";
const ZAPI_INSTANCE_ID = defineSecret("ZAPI_INSTANCE_ID");
const ZAPI_INSTANCE_TOKEN = defineSecret("ZAPI_INSTANCE_TOKEN");
const ZAPI_CLIENT_TOKEN = defineSecret("ZAPI_CLIENT_TOKEN");
const PUBLIC_SITE_URL = defineString("PUBLIC_SITE_URL", {
  default: "https://eulernasc.github.io/mcbemstar",
});

function digits(value = "") {
  const raw = String(value).replace(/\D/g, "");
  if (!raw) return "";
  return raw.startsWith("55") ? raw : `55${raw}`;
}

function brDate(value = "") {
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function publicSiteUrl() {
  return PUBLIC_SITE_URL.value().replace(/\/$/, "");
}

function managementLink(token, action = "") {
  const params = new URLSearchParams({token});
  if (action) params.set("acao", action);
  return `${publicSiteUrl()}/agendamento.html?${params.toString()}`;
}

function zapiUrl(endpoint) {
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID.value()}` +
    `/token/${ZAPI_INSTANCE_TOKEN.value()}/${endpoint}`;
}

async function zapiRequest(endpoint, payload) {
  const response = await fetch(zapiUrl(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN.value(),
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  let body = {};

  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {raw: rawBody};
  }

  if (!response.ok) {
    throw new Error(
        body.error || body.message ||
        `Erro HTTP ${response.status}: ${rawBody || "sem resposta"}`,
    );
  }

  return body;
}

async function sendText(phone, message) {
  return zapiRequest("send-text", {
    phone: digits(phone),
    message,
  });
}

async function sendManagementButtons(phone, bookingId, token) {
  const rescheduleUrl = managementLink(token, "remarcar");
  const cancelUrl = managementLink(token, "cancelar");

  return zapiRequest("send-button-actions", {
    phone: digits(phone),
    title: "MC Bem Estar Studio",
    message: "Caso aconteça algum imprevisto, escolha uma opção:",
    footer: "Seu horário já está confirmado.",
    buttonActions: [
      {
        id: `remarcar:${bookingId}`,
        type: "URL",
        label: "Remarcar",
        url: rescheduleUrl,
      },
      {
        id: `cancelar:${bookingId}`,
        type: "URL",
        label: "Desmarcar",
        url: cancelUrl,
      },
    ],
  });
}

function bookingMessage(booking) {
  return `Olá, ${booking.nome || "Cliente"}! 👋\n\n` +
    "Seu agendamento foi confirmado com sucesso.\n\n" +
    `💈 Serviço: ${booking.servicoNome || "Serviço"}\n` +
    `👤 Profissional: ${booking.profissionalNome || "Maykon Castro"}\n` +
    `📅 Data: ${brDate(booking.data)}\n` +
    `⏰ Horário: ${booking.hora || ""}\n\n` +
    "Sabemos que imprevistos acontecem. Se precisar alterar o horário, " +
    "use os botões enviados logo abaixo.\n\n" +
    "Até breve!\nEquipe MC Bem Estar Studio";
}

async function logWhatsAppMessage({bookingId, booking, type, message, status = "enviado", error = "", messageId = ""}) {
  await db.collection("whatsapp_mensagens").add({
    agendamentoId: bookingId,
    clienteNome: booking.nome || "Cliente",
    telefone: digits(booking.whatsappDestino || booking.tel || booking.telefone),
    tipo: type,
    mensagem: message,
    status,
    erro: error,
    zapiMessageId: messageId,
    dataAgendamento: booking.data || "",
    horaAgendamento: booking.hora || "",
    criadoEm: FieldValue.serverTimestamp(),
  });
}

async function sendBookingConfirmation(bookingId, booking, ref) {
  const phone = digits(booking.whatsappDestino || booking.tel);
  if (!phone) throw new Error("Telefone do cliente não informado.");

  const token = booking.whatsappAcaoToken || randomToken();

  // Salva o token antes do envio para que os links já funcionem ao chegar.
  await ref.set({
    status: "confirmado",
    whatsappAcaoToken: token,
    whatsappDestino: phone,
    whatsappConfirmacaoStatus: "enviando",
    whatsappStatus: "enviando",
    whatsappRespostaStatus: "disponivel",
    whatsappErro: "",
  }, {merge: true});

  const confirmationText = bookingMessage(booking);
  const textResponse = await sendText(phone, confirmationText);

  let buttonsResponse = null;
  let buttonsError = "";
  try {
    buttonsResponse = await sendManagementButtons(phone, bookingId, token);
  } catch (error) {
    buttonsError = String(error.message || error).slice(0, 500);
    logger.warn("A confirmação chegou, mas os botões não foram enviados.", {
      bookingId,
      error: buttonsError,
    });
  }

  const messageId = textResponse.messageId || textResponse.zaapId ||
    textResponse.id || "";
  const buttonsMessageId = buttonsResponse?.messageId ||
    buttonsResponse?.zaapId || buttonsResponse?.id || "";

  await logWhatsAppMessage({
    bookingId,
    booking,
    type: "confirmacao",
    message: confirmationText,
    messageId,
  });

  await ref.set({
    status: "confirmado",
    whatsappConfirmacaoStatus: "enviado",
    whatsappStatus: "enviado",
    whatsappBotoesStatus: buttonsResponse ? "enviado" : "falha",
    whatsappMensagemId: messageId,
    whatsappBotoesMensagemId: buttonsMessageId,
    whatsappEnviadoEm: FieldValue.serverTimestamp(),
    whatsappErro: "",
    whatsappBotoesErro: buttonsError,
  }, {merge: true});

  await updatePublicMirror(bookingId, {status: "confirmado"});

  return {token, messageId, buttonsMessageId, buttonsError};
}

exports.enviarConfirmacaoAgendamento = onDocumentCreated({
  document: "agendamentos/{agendamentoId}",
  region: REGION,
  secrets: [ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN],
  retry: false,
  maxInstances: 2,
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const booking = snapshot.data();
  if (!booking.whatsappDestino && !booking.tel) {
    await snapshot.ref.set({
      whatsappConfirmacaoStatus: "erro",
      whatsappStatus: "sem_telefone",
      whatsappErro: "Telefone do cliente não informado.",
    }, {merge: true});
    return;
  }

  if (![
    "pendente_envio",
    "pendente_api",
  ].includes(booking.whatsappConfirmacaoStatus)) {
    return;
  }

  try {
    const result = await sendBookingConfirmation(
        event.params.agendamentoId,
        booking,
        snapshot.ref,
    );

    logger.info("Confirmação do agendamento enviada.", {
      agendamentoId: event.params.agendamentoId,
      messageId: result.messageId,
      buttonsMessageId: result.buttonsMessageId,
      buttonsError: result.buttonsError,
    });
  } catch (error) {
    const message = String(error.message || error).slice(0, 500);
    logger.error("Falha ao enviar confirmação do WhatsApp.", {
      agendamentoId: event.params.agendamentoId,
      error: message,
    });

    await snapshot.ref.set({
      whatsappConfirmacaoStatus: "erro",
      whatsappStatus: "erro_envio",
      whatsappErro: message,
    }, {merge: true});
    await logWhatsAppMessage({
      bookingId: event.params.agendamentoId,
      booking,
      type: "confirmacao",
      message: bookingMessage(booking),
      status: "falha",
      error: message,
    });
  }
});

async function updatePublicMirror(id, values) {
  await db.collection("agenda_publica").doc(id).set(values, {merge: true});
}

async function bookingByToken(token) {
  if (!token || token.length < 40) {
    throw new HttpsError("invalid-argument", "Link inválido ou incompleto.");
  }

  const snapshot = await db.collection("agendamentos")
      .where("whatsappAcaoToken", "==", token)
      .limit(1)
      .get();

  if (snapshot.empty) {
    throw new HttpsError("not-found", "Agendamento não encontrado.");
  }

  return {
    ref: snapshot.docs[0].ref,
    id: snapshot.docs[0].id,
    data: snapshot.docs[0].data(),
  };
}

function timeToMinutes(value = "00:00") {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:` +
    `${String(value % 60).padStart(2, "0")}`;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function availableSlots(booking, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayKey()) return [];

  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const weekday = new Date(year, month - 1, dayOfMonth, 12).getDay();
  const configSnapshot = await db.collection("config").doc("horarios").get();

  const defaultSchedule = {
    "0": {ativo: false, inicio: "07:00", fim: "14:00"},
    "1": {ativo: true, inicio: "07:00", fim: "19:00"},
    "2": {ativo: true, inicio: "07:00", fim: "19:00"},
    "3": {ativo: true, inicio: "07:00", fim: "19:00"},
    "4": {ativo: true, inicio: "07:00", fim: "22:00"},
    "5": {ativo: true, inicio: "07:00", fim: "22:00"},
    "6": {ativo: true, inicio: "07:00", fim: "14:00"},
  };

  const schedule = {
    ...defaultSchedule,
    ...(configSnapshot.data()?.porDia || {}),
  };
  const daySchedule = schedule[String(weekday)];
  if (!daySchedule?.ativo) return [];

  const appointments = await db.collection("agendamentos")
      .where("data", "==", date)
      .get();

  const occupied = appointments.docs
      .filter((docSnapshot) => docSnapshot.id !== booking.id)
      .map((docSnapshot) => docSnapshot.data())
      .filter((item) =>
        item.profissionalId === booking.data.profissionalId &&
        item.status !== "cancelado",
      );

  const duration = Number(booking.data.duracao || 30);
  const opening = timeToMinutes(daySchedule.inicio);
  const closing = timeToMinutes(daySchedule.fim);
  const result = [];
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let start = opening; start + duration <= closing; start += 30) {
    if (date === todayKey() && start <= currentMinutes) continue;

    const end = start + duration;
    const overlap = occupied.some((item) => {
      const itemStart = timeToMinutes(item.hora);
      const itemEnd = itemStart + Number(item.duracao || 30);
      return start < itemEnd && end > itemStart;
    });

    if (!overlap) result.push(minutesToTime(start));
  }

  return result;
}


function appointmentDateTime(booking) {
  if (!booking.data || !booking.hora) return null;
  const date = new Date(`${booking.data}T${booking.hora}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reminderMessage(booking, hours) {
  const title = hours === 24 ? "Lembrete do seu agendamento de amanhã" : "Seu atendimento é daqui a 2 horas";
  return `Olá, ${booking.nome || "Cliente"}! 👋\n\n` +
    `${title}.\n\n` +
    `💈 Serviço: ${booking.servicoNome || "Serviço"}\n` +
    `👤 Profissional: ${booking.profissionalNome || "Maykon Castro"}\n` +
    `📅 Data: ${brDate(booking.data)}\n` +
    `⏰ Horário: ${booking.hora || ""}\n\n` +
    "Caso aconteça algum imprevisto, use os botões enviados logo abaixo.\n\n" +
    "Até breve!\nEquipe MC Bem Estar Studio";
}

async function sendReminder(docSnapshot, hours) {
  const booking = docSnapshot.data();
  const field = hours === 24 ? "whatsappLembrete24hEnviadoEm" : "whatsappLembrete2hEnviadoEm";
  if (booking[field]) return false;

  const phone = digits(booking.whatsappDestino || booking.tel || booking.telefone);
  if (!phone) return false;
  const token = booking.whatsappAcaoToken || randomToken();
  if (!booking.whatsappAcaoToken) {
    await docSnapshot.ref.set({whatsappAcaoToken: token}, {merge: true});
  }

  const message = reminderMessage(booking, hours);
  try {
    const response = await sendText(phone, message);
    await sendManagementButtons(phone, docSnapshot.id, token);
    await docSnapshot.ref.set({
      [field]: FieldValue.serverTimestamp(),
      [`whatsappLembrete${hours}hStatus`]: "enviado",
    }, {merge: true});
    await logWhatsAppMessage({
      bookingId: docSnapshot.id,
      booking,
      type: hours === 24 ? "lembrete_24h" : "lembrete_2h",
      message,
      messageId: response.messageId || response.zaapId || response.id || "",
    });
    return true;
  } catch (error) {
    const errorMessage = String(error.message || error).slice(0, 500);
    await docSnapshot.ref.set({
      [`whatsappLembrete${hours}hStatus`]: "falha",
      [`whatsappLembrete${hours}hErro`]: errorMessage,
    }, {merge: true});
    await logWhatsAppMessage({
      bookingId: docSnapshot.id,
      booking,
      type: hours === 24 ? "lembrete_24h" : "lembrete_2h",
      message,
      status: "falha",
      error: errorMessage,
    });
    return false;
  }
}

exports.processarLembretesAgendamentos = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "America/Sao_Paulo",
  region: REGION,
  secrets: [ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN],
  maxInstances: 1,
}, async () => {
  const now = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const tomorrow = new Date(`${localDate}T12:00:00-03:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const snapshots = await Promise.all([
    db.collection("agendamentos").where("data", "==", localDate).get(),
    db.collection("agendamentos").where("data", "==", tomorrowKey).get(),
  ]);

  const docs = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => docs.set(doc.id, doc)));

  for (const docSnapshot of docs.values()) {
    const booking = docSnapshot.data();
    if (["cancelado", "concluido"].includes(booking.status)) continue;
    const appointment = appointmentDateTime(booking);
    if (!appointment) continue;
    const diffHours = (appointment.getTime() - now.getTime()) / 3600000;

    if (diffHours > 23.7 && diffHours <= 24.25) {
      await sendReminder(docSnapshot, 24);
    }
    if (diffHours > 1.7 && diffHours <= 2.25) {
      await sendReminder(docSnapshot, 2);
    }
  }
});

exports.gerenciarAgendamento = onCall({
  region: REGION,
  secrets: [ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN],
  maxInstances: 2,
}, async (request) => {
  const action = String(request.data?.acao || "consultar");
  const token = String(request.data?.token || "");
  const booking = await bookingByToken(token);

  if (action === "consultar") {
    const data = booking.data;
    return {
      id: booking.id,
      nome: data.nome,
      servicoNome: data.servicoNome,
      profissionalNome: data.profissionalNome,
      data: data.data,
      hora: data.hora,
      duracao: data.duracao,
      status: data.status,
    };
  }

  if (action === "horarios") {
    const date = String(request.data?.data || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError("invalid-argument", "Data inválida.");
    }
    return {horarios: await availableSlots(booking, date)};
  }

  if (action === "cancelar") {
    if (booking.data.status === "cancelado") {
      return {ok: true, status: "cancelado"};
    }

    await booking.ref.set({
      status: "cancelado",
      whatsappRespostaStatus: "cancelado_pelo_cliente",
      canceladoEm: FieldValue.serverTimestamp(),
    }, {merge: true});
    await updatePublicMirror(booking.id, {status: "cancelado"});

    try {
      const cancelMessage = `Olá, ${booking.data.nome || "Cliente"}. ` +
        "Seu agendamento foi desmarcado com sucesso. " +
        "Quando quiser, faça uma nova reserva pelo nosso site.";
      const response = await sendText(
          booking.data.whatsappDestino || booking.data.tel,
          cancelMessage,
      );
      await logWhatsAppMessage({
        bookingId: booking.id,
        booking: booking.data,
        type: "cancelamento",
        message: cancelMessage,
        messageId: response.messageId || response.zaapId || response.id || "",
      });
    } catch (error) {
      logger.warn("Cancelamento salvo, mas o aviso não foi enviado.", {
        agendamentoId: booking.id,
        error: String(error.message || error),
      });
    }

    return {ok: true, status: "cancelado"};
  }

  if (action === "remarcar") {
    if (booking.data.status === "cancelado") {
      throw new HttpsError(
          "failed-precondition",
          "Esse agendamento já foi cancelado.",
      );
    }

    const date = String(request.data?.data || "");
    const time = String(request.data?.hora || "");
    const slots = await availableSlots(booking, date);

    if (!slots.includes(time)) {
      throw new HttpsError(
          "failed-precondition",
          "Esse horário não está mais disponível.",
      );
    }

    const updatedBooking = {
      ...booking.data,
      data: date,
      hora: time,
      status: "confirmado",
      whatsappRespostaStatus: "remarcado_pelo_cliente",
    };

    await booking.ref.set({
      data: date,
      hora: time,
      status: "confirmado",
      whatsappRespostaStatus: "remarcado_pelo_cliente",
      remarcadoEm: FieldValue.serverTimestamp(),
    }, {merge: true});
    await updatePublicMirror(booking.id, {
      data: date,
      hora: time,
      status: "confirmado",
    });

    try {
      const message = `Olá, ${updatedBooking.nome || "Cliente"}! 👋\n\n` +
        "Seu agendamento foi remarcado com sucesso.\n\n" +
        `💈 Serviço: ${updatedBooking.servicoNome || "Serviço"}\n` +
        `👤 Profissional: ${updatedBooking.profissionalNome || "Maykon Castro"}\n` +
        `📅 Nova data: ${brDate(date)}\n` +
        `⏰ Novo horário: ${time}\n\n` +
        "Até breve!\nEquipe MC Bem Estar Studio";
      const response = await sendText(
          updatedBooking.whatsappDestino || updatedBooking.tel,
          message,
      );
      await logWhatsAppMessage({
        bookingId: booking.id,
        booking: updatedBooking,
        type: "remarcacao",
        message,
        messageId: response.messageId || response.zaapId || response.id || "",
      });
    } catch (error) {
      logger.warn("Remarcação salva, mas o aviso não foi enviado.", {
        agendamentoId: booking.id,
        error: String(error.message || error),
      });
    }

    return {ok: true, status: "confirmado", data: date, hora: time};
  }

  throw new HttpsError("invalid-argument", "Ação inválida.");
});
