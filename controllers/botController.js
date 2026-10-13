const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/wablasService");

// Import controller berdasarkan domain tugasnya masing-masing
const { handleRegisterUser } = require("./userController");
const {
  handleCheckHpp,
  handleDaftarProduk,
  handleTambahBahan,
  handleHitungHpp,
  handleTambahResep,
} = require("./hppController");

const normalizePhoneNumber = (value = "") => {
  return String(value).replace(/\D/g, "");
};

const extractWebhookPayload = (body = {}) => {
  const payload = body?.payload || body?.data || body;
  const source = Array.isArray(payload) ? payload[0] : payload;

  const sender =
    source?.phone ||
    source?.sender ||
    source?.from ||
    source?.wa_id ||
    source?.phone_number ||
    payload?.phone ||
    payload?.sender ||
    payload?.from ||
    payload?.wa_id ||
    payload?.phone_number ||
    body?.phone ||
    body?.sender ||
    body?.from ||
    body?.wa_id ||
    body?.phone_number;

  const rawMessage =
    source?.message?.text ??
    source?.message ??
    source?.text ??
    source?.body ??
    payload?.message?.text ??
    payload?.message ??
    payload?.text ??
    payload?.body ??
    body?.message?.text ??
    body?.message ??
    body?.text ??
    body?.body ??
    "";

  const message =
    typeof rawMessage === "string" ? rawMessage : rawMessage?.text || "";

  return { sender, message: String(message).trim() };
};

const handleWhatsAppWebhook = async (req, res) => {
  // Jika Wablas melakukan pengecekan GET (test/verifikasi), langsung balas 200 OK
  if (req.method === "GET") {
    return res.status(200).send("Webhook GET Verified Successfully!");
  }

  // DEBUGGING: Untuk melacak pesan masuk (POST)
  console.log("🔥 WEBHOOK HIT! Method:", req.method);
  console.log("📦 Full Body received:", JSON.stringify(req.body));

  try {
    // Menggunakan fungsi ekstraksi payload yang sudah Anda buat
    const { sender, message } = extractWebhookPayload(req.body);

    if (!sender || !message) {
      console.log("⚠️ Payload webhook tidak valid:", JSON.stringify(req.body));
      return res
        .status(200)
        .json({ status: false, message: "Payload tidak valid" });
    }

    console.log(`📩 Pesan masuk dari ${sender}: ${message}`);
    const textClean = message.trim();
    const textUpper = textClean.toUpperCase();
    const cleanPhone = normalizePhoneNumber(sender);

    // ----------------------------------------------------
    // 1. CEK STATUS PENDAFTARAN USER
    // ----------------------------------------------------
    const user = await db("users")
      .whereRaw(
        "REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', '') = ?",
        [cleanPhone],
      )
      .first();

    if (!user) {
      if (textUpper.startsWith("DAFTAR")) {
        await handleRegisterUser(sender, textClean);
      } else {
        const welcomeMessage =
          `👋 *Selamat Datang di Bot HPP RintisKu!*\n\n` +
          `Nomor kamu belum terdaftar di sistem. Silakan lakukan pendaftaran terlebih dahulu untuk mulai menggunakan fitur.\n\n` +
          `📝 *Format Pendaftaran*:\n` +
          "`DAFTAR [Nama Anda] | [Nama Usaha]`\n\n" +
          `*Contoh*:\n` +
          "`DAFTAR Budi | Kedai Kopi Mantap`";

        await sendWhatsAppMessage(sender, welcomeMessage);
      }

      return res.status(200).json({ status: true });
    }

    // ----------------------------------------------------
    // 2. JIKA USER SUDAH TERDAFTAR (Router Ke HppController)
    // ----------------------------------------------------
    if (textUpper === "PING") {
      await sendWhatsAppMessage(
        sender,
        "Pong! 🏓 Bot HPP Pintar RintisKu terhubung.",
      );
    } else if (textUpper === "MENU" || textUpper === "MENU HPP") {
      let replyText = `🤖 *Menu Utama HPP Pintar RintisKu*\n`;
      replyText += `Halo, *${user.name} (${user.business_name})*!\n\n`;
      replyText += "1. `PROFILE USER` (Lihat profil kamu)\n";
      replyText += "2. `DATA BAHAN BAKU` (Lihat daftar bahan baku)\n";
      replyText += "3. `DAFTAR RESEP` (Lihat daftar resep/produk)\n";
      replyText += "4. `TAMBAH BAHAN [Nama],[Harga],[Qty Satuan]`\n";
      replyText += "5. `TAMBAH RESEP [Produk] | [Bahan] : [Takaran]`\n";
      replyText += "6. Ketik `HITUNG HPP` untuk melihat format petunjuk kalkulasi HPP lengkap.\n";
      await sendWhatsAppMessage(sender, replyText);
    } else if (
      textUpper === "PROFILE" ||
      textUpper === "PROFILE USER" ||
      textUpper === "PROFIL" ||
      textUpper === "PROFIL USER"
    ) {
      let profileText = `👤 *Profil User*\n\n`;
      profileText += `Nama: *${user.name}*\n`;
      profileText += `Usaha: *${user.business_name}*\n`;
      profileText += `No. WA: *${user.phone_number}*\n`;
      await sendWhatsAppMessage(sender, profileText);
    } else if (textUpper === "DATA BAHAN BAKU" || textUpper === "CEK HPP") {
      await handleCheckHpp(sender, user.id);
    } else if (textUpper === "DAFTAR RESEP" || textUpper === "LIST RESEP") {
      await handleDaftarProduk(sender, user.id);
    } else if (textUpper.startsWith("TAMBAH BAHAN")) {
      await handleTambahBahan(sender, textClean, user.id);
    } else if (textUpper.startsWith("TAMBAH RESEP")) {
      await handleTambahResep(sender, textClean, user.id);
    } else if (textUpper.startsWith("HITUNG HPP")) {
      await handleHitungHpp(sender, textClean, user.id);
    } else {
      await sendWhatsAppMessage(
        sender,
        `Halo *${user.name}*! Pesan diterima.\nKetik *MENU HPP* untuk melihat daftar perintah.`,
      );
    }

    return res.status(200).json({ status: true });
  } catch (error) {
    console.error("Error webhook:", error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

module.exports = {
  handleWhatsAppWebhook,
  extractWebhookPayload,
  normalizePhoneNumber,
};
