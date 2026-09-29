const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/fonnteService");

// Mendaftarkan user baru via WhatsApp
const handleRegisterUser = async (sender, messageText) => {
  try {
    const cleanPhone = sender.replace(/[^0-9]/g, "");
    const content = messageText.replace(/^DAFTAR/i, "").trim();
    const parts = content.split("|").map((item) => item.trim());

    if (parts.length < 2) {
      await sendWhatsAppMessage(
        sender,
        "❌ *Format Pendaftaran Salah!*\n\nGunakan format:\n`DAFTAR [Nama Anda] | [Nama Usaha]`\n\n*Contoh*:\n`DAFTAR Budi | Kedai Kopi Mantap`",
      );
      return;
    }

    const [userName, businessName] = parts;

    // Simpan ke database
    await db("users").insert({
      name: userName,
      business_name: businessName,
      phone_number: cleanPhone,
    });

    let reply = `🎉 *Pendaftaran Berhasil!*\n\n`;
    reply += `👤 *Nama*: ${userName}\n`;
    reply += `🏪 *Usaha*: ${businessName}\n`;
    reply += `📱 *No. WA*: ${cleanPhone}\n\n`;
    reply += `Sekarang kamu sudah bisa menggunakan fitur HPP Pintar RintisKu! Ketik *MENU* untuk melihat daftar perintah.`;

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleRegisterUser:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal melakukan pendaftaran.");
  }
};

module.exports = {
  handleRegisterUser,
};
