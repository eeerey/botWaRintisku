const axios = require("axios");
require("dotenv").config();

async function sendWhatsAppMessage(targetPhone, message) {
  try {
    const domain = process.env.WABLAS_DOMAIN.replace(/\/$/, "");
    const url = `${domain}/api/v2/send-message`;

    const payload = {
      data: [
        {
          phone: targetPhone,
          message: message,
        },
      ],
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: process.env.WABLAS_TOKEN,
        // Jika Wablas memerlukan secret key di header, tambahkan baris ini (sesuaikan jika namanya berbeda di dokumentasi)
        "secret-key": process.env.WABLAS_SECRET,
        "Content-Type": "application/json",
      },
    });

    console.log("Respon sukses dari Wablas:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Gagal mengirim pesan Wablas:",
      error.response?.data || error.message,
    );
  }
}

module.exports = { sendWhatsAppMessage };
