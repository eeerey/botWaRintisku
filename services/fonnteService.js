const axios = require("axios");
require("dotenv").config();

async function sendWhatsAppMessage(targetPhone, message) {
  try {
    const response = await axios.post(
      "https://api.fonnte.com/send",
      {
        target: targetPhone,
        message: message,
      },
      {
        headers: {
          Authorization: process.env.FONNTE_API_KEY, // Token otomatis terbaca dari .env
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "Gagal mengirim pesan Fonnte:",
      error.response?.data || error.message,
    );
  }
}

module.exports = { sendWhatsAppMessage };
