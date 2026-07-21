const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const REGION = "southamerica-east1";
const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = defineString("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_GRAPH_VERSION = defineString("WHATSAPP_GRAPH_VERSION", { default: "v23.0" });
const WHATSAPP_TEMPLATE_NAME = defineString("WHATSAPP_TEMPLATE_NAME", { default: "confirmacao_agendamento" });
const WHATSAPP_TEMPLATE_LANGUAGE = defineString("WHATSAPP_TEMPLATE_LANGUAGE", { default: "pt_BR" });
const PUBLIC_SITE_URL = defineString("PUBLIC_SITE_URL", { default: "https://eulernasc.github.io/mcbemstar" });

function digits(value = "") {
  const raw = String(value).replace(/\D/g, "");
  if (raw.startsWith("55")) return raw;
  return `55${raw}`;
}

function brDate(value = "") {
  const [y, m, d] = String(value).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function graphRequest(path, payload) {
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION.value()}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Erro HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function sendText(to, text) {
  return graphRequest(`${WHATSAPP_PHONE_NUMBER_ID.value()}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits(to),
    type: "text",
    text: { preview_url: true, body: text }
  });
}

async function sendConfirmationTemplate(bookingId, booking) {
  const response = await graphRequest(`${WHATSAPP_PHONE_NUMBER_ID.value()}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits(booking.whatsappDestino || booking.tel),
    type: "template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME.value(),
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE.value() },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: booking.nome || "Cliente" },
            { type: "text", text: booking.profissionalNome || "Maykon Castro" },
            { type: "text", text: booking.servicoNome || "Serviço" },
            { type: "text", text: brDate(booking.data) },
            { type: "text", text: booking.hora || "" }
          ]
        },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `CONFIRMAR:${bookingId}` }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `REMARCAR:${bookingId}` }] },
        { type: "button", sub_type: "quick_reply", index: "2", parameters: [{ type: "payload", payload: `CANCELAR:${bookingId}` }] }
      ]
    }
  });
  return response?.messages?.[0]?.id || "";
}

exports.enviarConfirmacaoWhatsApp = onDocumentCreated({
  document: "agendamentos/{agendamentoId}",
  region: REGION,
  secrets: [WHATSAPP_ACCESS_TOKEN],
  retry: false
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const booking = snapshot.data();
  if (!booking.whatsappDestino && !booking.tel) return;
  if (!["pendente_envio", "pendente_api"].includes(booking.whatsappConfirmacaoStatus)) return;

  const token = booking.whatsappAcaoToken || randomToken();
  try {
    const messageId = await sendConfirmationTemplate(event.params.agendamentoId, booking);
    await snapshot.ref.set({
      whatsappAcaoToken: token,
      whatsappConfirmacaoStatus: "enviado",
      whatsappRespostaStatus: "aguardando",
      whatsappMensagemId: messageId,
      whatsappEnviadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    logger.error("Falha ao enviar confirmação do WhatsApp", error);
    await snapshot.ref.set({
      whatsappAcaoToken: token,
      whatsappConfirmacaoStatus: "falha",
      whatsappErro: String(error.message || error).slice(0, 500)
    }, { merge: true });
  }
});

function extractButtonPayload(message) {
  return message?.button?.payload || message?.interactive?.button_reply?.id || "";
}

async function updatePublicMirror(id, values) {
  await db.collection("agenda_publica").doc(id).set(values, { merge: true });
}

async function handleButton(from, payload) {
  const [rawAction, bookingId] = String(payload).split(":");
  const action = String(rawAction || "").toUpperCase();
  if (!bookingId || !["CONFIRMAR", "REMARCAR", "CANCELAR"].includes(action)) return;

  const ref = db.collection("agendamentos").doc(bookingId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  const booking = snapshot.data();
  const token = booking.whatsappAcaoToken || randomToken();

  if (action === "CONFIRMAR") {
    await ref.set({ status: "confirmado", whatsappRespostaStatus: "confirmado", whatsappRespondidoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await updatePublicMirror(bookingId, { status: "confirmado" });
    await sendText(from, `Tudo certo, ${booking.nome || ""}! Seu horário está confirmado para ${brDate(booking.data)} às ${booking.hora}. Até breve!`);
    return;
  }

  if (action === "CANCELAR") {
    await ref.set({ status: "cancelado", whatsappRespostaStatus: "cancelado", whatsappRespondidoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await updatePublicMirror(bookingId, { status: "cancelado" });
    await sendText(from, "Seu agendamento foi cancelado. Quando quiser, faça uma nova reserva pelo nosso site.");
    return;
  }

  await ref.set({ status: "remarcando", whatsappRespostaStatus: "remarcando", whatsappAcaoToken: token, whatsappRespondidoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await updatePublicMirror(bookingId, { status: "remarcando" });
  const link = `${PUBLIC_SITE_URL.value().replace(/\/$/, "")}/agendamento.html?token=${encodeURIComponent(token)}`;
  await sendText(from, `Para escolher uma nova data e horário, acesse o link seguro abaixo:\n${link}`);
}

exports.whatsappWebhook = onRequest({
  region: REGION,
  secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN]
}, async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN.value()) return res.status(200).send(challenge);
    return res.sendStatus(403);
  }

  res.sendStatus(200);
  try {
    const changes = (req.body?.entry || []).flatMap(entry => entry.changes || []);
    for (const change of changes) {
      const value = change.value || {};
      for (const status of value.statuses || []) {
        if (!status.id) continue;
        const snap = await db.collection("agendamentos").where("whatsappMensagemId", "==", status.id).limit(1).get();
        if (!snap.empty) await snap.docs[0].ref.set({ whatsappConfirmacaoStatus: status.status, whatsappStatusAtualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      for (const message of value.messages || []) {
        const payload = extractButtonPayload(message);
        if (payload) await handleButton(message.from, payload);
      }
    }
  } catch (error) {
    logger.error("Erro ao processar webhook do WhatsApp", error);
  }
});

async function bookingByToken(token) {
  if (!token || token.length < 20) throw new HttpsError("invalid-argument", "Token inválido.");
  const snap = await db.collection("agendamentos").where("whatsappAcaoToken", "==", token).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "Agendamento não encontrado.");
  return { ref: snap.docs[0].ref, id: snap.docs[0].id, data: snap.docs[0].data() };
}

function timeToMinutes(value = "00:00") {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

async function availableSlots(booking, date) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(y, m - 1, d, 12).getDay();
  const configSnap = await db.collection("config").doc("horarios").get();
  const defaultSchedule = {
    "0": { ativo: false, inicio: "07:00", fim: "14:00" },
    "1": { ativo: true, inicio: "07:00", fim: "19:00" },
    "2": { ativo: true, inicio: "07:00", fim: "19:00" },
    "3": { ativo: true, inicio: "07:00", fim: "19:00" },
    "4": { ativo: true, inicio: "07:00", fim: "22:00" },
    "5": { ativo: true, inicio: "07:00", fim: "22:00" },
    "6": { ativo: true, inicio: "07:00", fim: "14:00" }
  };
  const schedule = { ...defaultSchedule, ...(configSnap.data()?.porDia || {}) };
  const day = schedule[String(weekday)];
  if (!day?.ativo) return [];

  const bookings = await db.collection("agendamentos").where("data", "==", date).get();
  const occupied = bookings.docs
    .filter(docSnap => docSnap.id !== booking.id)
    .map(docSnap => docSnap.data())
    .filter(item => item.profissionalId === booking.data.profissionalId && item.status !== "cancelado");
  const duration = Number(booking.data.duracao || 30);
  const opening = timeToMinutes(day.inicio);
  const closing = timeToMinutes(day.fim);
  const result = [];
  for (let start = opening; start + duration <= closing; start += 30) {
    const end = start + duration;
    const overlap = occupied.some(item => {
      const itemStart = timeToMinutes(item.hora);
      const itemEnd = itemStart + Number(item.duracao || 30);
      return start < itemEnd && end > itemStart;
    });
    if (!overlap) result.push(minutesToTime(start));
  }
  return result;
}

exports.gerenciarAgendamento = onCall({ region: REGION }, async (request) => {
  const action = String(request.data?.acao || "consultar");
  const token = String(request.data?.token || "");
  const booking = await bookingByToken(token);

  if (action === "consultar") {
    const a = booking.data;
    return {
      id: booking.id,
      nome: a.nome,
      servicoNome: a.servicoNome,
      profissionalNome: a.profissionalNome,
      data: a.data,
      hora: a.hora,
      duracao: a.duracao,
      status: a.status
    };
  }

  if (action === "horarios") {
    const date = String(request.data?.data || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError("invalid-argument", "Data inválida.");
    return { horarios: await availableSlots(booking, date) };
  }

  if (action === "cancelar") {
    await booking.ref.set({ status: "cancelado", whatsappRespostaStatus: "cancelado" }, { merge: true });
    await updatePublicMirror(booking.id, { status: "cancelado" });
    return { ok: true, status: "cancelado" };
  }

  if (action === "confirmar") {
    await booking.ref.set({ status: "confirmado", whatsappRespostaStatus: "confirmado" }, { merge: true });
    await updatePublicMirror(booking.id, { status: "confirmado" });
    return { ok: true, status: "confirmado" };
  }

  if (action === "remarcar") {
    const date = String(request.data?.data || "");
    const time = String(request.data?.hora || "");
    const slots = await availableSlots(booking, date);
    if (!slots.includes(time)) throw new HttpsError("failed-precondition", "Esse horário não está mais disponível.");
    await booking.ref.set({ data: date, hora: time, status: "confirmado", whatsappRespostaStatus: "confirmado", whatsappConfirmacaoStatus: "remarcado_pelo_cliente" }, { merge: true });
    await updatePublicMirror(booking.id, { data: date, hora: time, status: "confirmado" });
    return { ok: true, status: "confirmado", data: date, hora: time };
  }

  throw new HttpsError("invalid-argument", "Ação inválida.");
});
