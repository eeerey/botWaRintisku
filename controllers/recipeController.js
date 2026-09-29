const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/fonnteService");

// Fungsi untuk melihat resep produk
const handleViewRecipe = async (sender, productName) => {
  try {
    // Cari produk berdasarkan nama
    const product = await db("products")
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      await sendWhatsAppMessage(
        sender,
        `❌ Produk "${productName}" tidak ditemukan di database.`,
      );
      return;
    }

    // Ambil komposisi resep berdasarkan product_id
    const recipes = await db("recipes")
      .join("raw_materials", "recipes.raw_material_id", "=", "raw_materials.id")
      .where("recipes.product_id", product.id)
      .select(
        "raw_materials.name as material_name",
        "recipes.quantity",
        "raw_materials.unit",
      );

    if (recipes.length === 0) {
      await sendWhatsAppMessage(
        sender,
        `📝 Produk *${product.name}* belum memiliki resep/komposisi bahan.`,
      );
      return;
    }

    let reply = `📋 *Resep & Komposisi: ${product.name}*:\n\n`;
    let totalEstimatedCost = 0;

    recipes.forEach((rec, idx) => {
      reply += `- ${rec.material_name}: ${rec.quantity} ${rec.unit}\n`;
    });

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error recipeController:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal mengambil data resep.");
  }
};

module.exports = { handleViewRecipe };
