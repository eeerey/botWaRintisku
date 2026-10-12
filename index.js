require("dotenv").config();
const express = require("express");
const { handleWhatsAppWebhook } = require("./controllers/botController");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Server HPP Pintar RintisKu Berjalan dengan Baik! 🚀");
});

// Menggunakan app.all untuk menghandle GET (verifikasi/test) dan POST (pesan masuk)
app.all("/webhook/whatsapp", handleWhatsAppWebhook);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server backend berjalan di port ${PORT}`);
});
