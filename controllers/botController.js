const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/fonnteService");

// Import controller sesuai tugasnya masing-masing
const { handleRegisterUser } = require("./userController");
const {
  handleCheckHpp,
  handleDaftarProduk,
  handleTambahBahan,
  handleEditBahan,
  handleHapusBahan,
  handleTambahResep,
  handleHapusResep,
  handleHitungHpp,
} = require("./hppController");

const handleWhatsAppWebhook = async (req, res) => {
  try {
    const sender = req.body.sender || req.body.from;
    const message = req.body.message || req.body.text;

    if (!sender || !message) {
      return res
        .status(400)
        .json({ status: false, message: "Payload tidak valid" });
    }

    console.log(`📩 Pesan masuk dari ${sender}: ${message}`);
    const textClean = message.trim();
    const textUpper = textClean.toUpperCase();
    const cleanPhone = sender.replace(/[^0-9]/g, "");

    // ----------------------------------------------------
    // 1. CEK STATUS PENDAFTARAN USER
    // ----------------------------------------------------
    const user = await db("users").where("phone_number", cleanPhone).first();

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
    // 2. ROUTER UTAMA (User Sudah Terdaftar)
    // ----------------------------------------------------
    if (textUpper === "PING") {
      await sendWhatsAppMessage(
        sender,
        "Pong! 🏓 Bot HPP Pintar RintisKu terhubung."
      );
    } else if (textUpper === "MENU" || textUpper === "MENU HPP") {
      let replyText = `🤖 *Menu Utama HPP Pintar RintisKu*\n`;
      replyText += `Halo, *${user.name}* (${user.business_name})!\n\n`;
      replyText += "1. `CEK HPP` (Lihat daftar bahan baku)\n";
      replyText += "2. `DAFTAR PRODUK` (Lihat daftar menu & HPP)\n";
      replyText += "3. `TAMBAH BAHAN [Nama],[Harga],[Qty Satuan]`\n";
      replyText += "4. `EDIT BAHAN [Nama],[Harga Baru],[Qty Baru]`\n";
      replyText += "5. `HAPUS BAHAN [Nama Bahan]`\n";
      replyText += "6. `HITUNG HPP Nama Produk: ... | Porsi: ... | Bahan Baku: ...`\n";

      await sendWhatsAppMessage(sender, replyText);
    } else if (textUpper === "CEK HPP") {
      await handleCheckHpp(sender, user.id);
    } else if (textUpper === "DAFTAR PRODUK") {
      await handleDaftarProduk(sender, user.id);
    } else if (textUpper.startsWith("TAMBAH BAHAN")) {
      await handleTambahBahan(sender, textClean, user.id);
    } else if (textUpper.startsWith("EDIT BAHAN")) {
      await handleEditBahan(sender, textClean, user.id);
    } else if (textUpper.startsWith("HAPUS BAHAN")) {
      await handleHapusBahan(sender, textClean, user.id);
    } else if (textUpper.startsWith("TAMBAH RESEP")) {
      await handleTambahResep(sender, textClean, user.id);
    } else if (textUpper.startsWith("HAPUS RESEP")) {
      await handleHapusResep(sender, textClean, user.id);
    } else if (textUpper.startsWith("HITUNG HPP")) {
      await handleHitungHpp(sender, textClean, user.id);
    } else {
      await sendWhatsAppMessage(
        sender,
        `Halo *${user.name}*! Pesan diterima.\nKetik *MENU HPP* untuk melihat daftar perintah.`
      );
    }

    return res.status(200).json({ status: true });
  } catch (error) {
    console.error("Error webhook:", error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

module.exports = { handleWhatsAppWebhook };