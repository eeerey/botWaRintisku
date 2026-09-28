require("dotenv").config(); // <-- WAJIB ADA DI BARIS PALING ATAS
const express = require("express");
const db = require("./config/db");
const { sendWhatsAppMessage } = require("./services/fonnteService");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Endpoint untuk Uji Coba Server (Cek di browser)
app.get("/", (req, res) => {
  res.send("Server HPP Pintar RintisKu Berjalan dengan Baik! 🚀");
});

// 2. Endpoint Webhook untuk Menerima Pesan dari Fonnte
app.post("/webhook/whatsapp", async (req, res) => {
  const { sender, message } = req.body;

  if (!sender || !message) {
    return res
      .status(400)
      .json({ status: false, message: "Payload tidak valid" });
  }

  console.log(`📩 Pesan masuk dari ${sender}: ${message}`);

  const textUpper = message.trim().toUpperCase();

  if (textUpper === "PING") {
    await sendWhatsAppMessage(
      sender,
      "Pong! 🏓 Bot RintisKu terhubung dengan sukses.",
    );
  } else if (textUpper === "MENU") {
    let replyText = "🤖 *Menu Uji Coba HPP Pintar RintisKu*\n\n";
    replyText += "1. Ketik *PING* (Untuk tes koneksi bot)\n";
    replyText += "2. Ketik *CEK DATABASE* (Untuk tes koneksi ke MySQL)\n";
    await sendWhatsAppMessage(sender, replyText);
  } else if (textUpper === "CEK DATABASE") {
    try {
      const usersCount = await db("users").count("id as total").first();
      await sendWhatsAppMessage(
        sender,
        `✅ Koneksi Database Berhasil!\nJumlah user terdaftar: ${usersCount.total} orang.`,
      );
    } catch (err) {
      console.error(err);
      await sendWhatsAppMessage(sender, "❌ Gagal terhubung ke database.");
    }
  } else {
    await sendWhatsAppMessage(
      sender,
      `Halo! Pesan Anda: "${message}" diterima.\nKetik *MENU* untuk melihat daftar perintah.`,
    );
  }

  return res.status(200).json({ status: true });
});

// Jalankan Server (Menggunakan port dari .env atau default 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server backend berjalan di port ${PORT}`);
});
