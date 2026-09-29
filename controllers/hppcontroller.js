const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/fonnteService");

// Helper untuk mencari unit_id berdasarkan simbol atau nama (kg, g, l, ml, pcs, dll)
const getUnitId = async (unitName) => {
  if (!unitName) return null;
  const cleanUnit = unitName.toLowerCase().trim();

  const unit = await db("units")
    .where("symbol", "like", cleanUnit)
    .orWhere("name", "like", cleanUnit)
    .first();

  return unit ? unit.id : null;
};


// 1. CEK HPP (Lihat daftar bahan baku)
const handleCheckHpp = async (sender) => {
  try {
    const rawMaterials = await db("raw_materials")
      .leftJoin("units", "raw_materials.unit_id", "units.id")
      .select(
        "raw_materials.name",
        "raw_materials.price_per_unit",
        "raw_materials.stock",
        "units.symbol as unit_symbol",
      );

    if (!rawMaterials || rawMaterials.length === 0) {
      await sendWhatsAppMessage(
        sender,
        "⚠️ Belum ada data bahan baku. Ketik `TAMBAH BAHAN [Nama],[Harga],[Qty Satuan]` untuk menambah.",
      );
      return;
    }

    let reply = "📦 *Daftar Bahan Baku & Harga*:\n\n";
    rawMaterials.forEach((item, index) => {
      const price = parseFloat(item.price_per_unit || 0);
      const unit = item.unit_symbol || "unit";
      reply += `${index + 1}. *${item.name}* - Rp ${price.toLocaleString("id-ID")} / ${unit} (Stok: ${item.stock}${unit})\n`;
    });
    reply += "\n💡 *Format Tambah Bahan*:\n`TAMBAH BAHAN Gula, 15000, 1kg`";

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleCheckHpp:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal memuat data bahan baku.");
  }
};

// 2. DAFTAR PRODUK (Menu Baru)
const handleDaftarProduk = async (sender) => {
  try {
    const products = await db("products").select("name", "total_hpp");

    if (!products || products.length === 0) {
      await sendWhatsAppMessage(
        sender,
        "⚠️ Belum ada produk terdaftar. Tambahkan resep baru dengan perintah `TAMBAH RESEP`.",
      );
      return;
    }

    let reply = "🍽️ *Daftar Produk & HPP*:\n\n";
    products.forEach((p, idx) => {
      const hpp = parseFloat(p.total_hpp || 0);
      reply += `${idx + 1}. *${p.name}* - HPP: Rp${Math.round(hpp).toLocaleString("id-ID")}\n`;
    });

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleDaftarProduk:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal memuat daftar produk.");
  }
};

// 3. TAMBAH BAHAN
const handleTambahBahan = async (sender, messageText) => {
  try {
    const content = messageText.replace(/^TAMBAH BAHAN/i, "").trim();
    const parts = content.split(",").map((item) => item.trim());

    if (parts.length < 3) {
      await sendWhatsAppMessage(
        sender,
        "❌ *Format Salah!*\n\nGunakan format:\n`TAMBAH BAHAN [Nama],[Harga],[Qty Satuan]`\n\n*Contoh*:\n`TAMBAH BAHAN tepung, 15.000, 1kg`",
      );
      return;
    }

    const [name, priceStr, qtyUnitStr] = parts;

    const cleanPriceStr = priceStr
      .replace(/rp/gi, "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .trim();
    const totalPrice = parseFloat(cleanPriceStr);

    if (isNaN(totalPrice)) {
      await sendWhatsAppMessage(
        sender,
        "❌ *Harga tidak valid!* Pastikan memasukkan angka yang benar.",
      );
      return;
    }

    const match = qtyUnitStr.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
    let qty = 1;
    let unitStr = qtyUnitStr;

    if (match) {
      qty = parseFloat(match[1]) || 1;
      unitStr = match[2];
    }

    const pricePerUnit = totalPrice / qty;
    const unitId = await getUnitId(unitStr);

    await db("raw_materials").insert({
      user_id: 1,
      name: name,
      stock: qty,
      price_per_unit: pricePerUnit,
      unit_id: unitId,
    });

    let reply = `✅ *Berhasil Menambah Bahan Baku!*\n\n`;
    reply += `📌 *Nama*: ${name}\n`;
    reply += `💰 *Harga Tot*: Rp ${totalPrice.toLocaleString("id-ID")}\n`;
    reply += `📦 *Jumlah/Satuan*: ${qty}${unitStr}\n`;
    reply += `💵 *Harga/Satuan*: Rp ${Math.round(pricePerUnit).toLocaleString("id-ID")}/${unitStr}`;

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleTambahBahan:", error);
    await sendWhatsAppMessage(
      sender,
      "❌ Gagal menyimpan bahan baku ke database.",
    );
  }
};

// 4. EDIT BAHAN (Menu Baru)
// Format: EDIT BAHAN [Nama Bahan], [Harga Baru], [Qty Baru]
const handleEditBahan = async (sender, messageText) => {
  try {
    const content = messageText.replace(/^EDIT BAHAN/i, "").trim();
    const parts = content.split(",").map((item) => item.trim());

    if (parts.length < 3) {
      await sendWhatsAppMessage(
        sender,
        "❌ *Format Salah!*\n\nGunakan format:\n`EDIT BAHAN [Nama Bahan], [Harga Baru], [Qty Baru]`\n\n*Contoh*:\n`EDIT BAHAN tepung, 18.000, 1kg`",
      );
      return;
    }

    const [name, priceStr, qtyUnitStr] = parts;

    const material = await db("raw_materials")
      .where("name", "like", `%${name}%`)
      .first();

    if (!material) {
      await sendWhatsAppMessage(
        sender,
        `❌ Bahan baku "${name}" tidak ditemukan.`,
      );
      return;
    }

    const cleanPriceStr = priceStr
      .replace(/rp/gi, "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .trim();
    const totalPrice = parseFloat(cleanPriceStr);

    const match = qtyUnitStr.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
    let qty = 1;
    let unitStr = qtyUnitStr;

    if (match) {
      qty = parseFloat(match[1]) || 1;
      unitStr = match[2];
    }

    const pricePerUnit = totalPrice / qty;
    const unitId = await getUnitId(unitStr);

    await db("raw_materials")
      .where("id", material.id)
      .update({
        price_per_unit: pricePerUnit,
        stock: qty,
        unit_id: unitId || material.unit_id,
      });

    await sendWhatsAppMessage(
      sender,
      `✅ *Berhasil Mengubah Bahan Baku!*\n\n📌 *Nama*: ${material.name}\n💰 *Harga Baru*: Rp ${totalPrice.toLocaleString("id-ID")}\n📦 *Stok/Satuan Baru*: ${qty}${unitStr}`,
    );
  } catch (error) {
    console.error("Error handleEditBahan:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal memperbarui bahan baku.");
  }
};

// 5. HAPUS BAHAN (Menu Baru)
// Format: HAPUS BAHAN [Nama Bahan]
const handleHapusBahan = async (sender, messageText) => {
  try {
    const materialName = messageText.replace(/^HAPUS BAHAN/i, "").trim();

    if (!materialName) {
      await sendWhatsAppMessage(
        sender,
        "❌ Masukkan nama bahan yang ingin dihapus.\nContoh: `HAPUS BAHAN Tepung`",
      );
      return;
    }

    const material = await db("raw_materials")
      .where("name", "like", `%${materialName}%`)
      .first();

    if (!material) {
      await sendWhatsAppMessage(
        sender,
        `❌ Bahan "${materialName}" tidak ditemukan.`,
      );
      return;
    }

    await db("raw_materials").where("id", material.id).del();

    await sendWhatsAppMessage(
      sender,
      `🗑️ *Berhasil Menghapus Bahan Baku*: ${material.name}`,
    );
  } catch (error) {
    console.error("Error handleHapusBahan:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal menghapus bahan baku.");
  }
};

// 6. TAMBAH RESEP
const handleTambahResep = async (sender, messageText) => {
  try {
    const content = messageText.replace(/^TAMBAH RESEP/i, "").trim();
    const parts = content.split("|").map((item) => item.trim());

    if (parts.length < 2) {
      await sendWhatsAppMessage(
        sender,
        "❌ *Format Salah!*\n\nGunakan format:\n`TAMBAH RESEP [Produk] | [Bahan] : [Takaran]`\n\n*Contoh*:\n`TAMBAH RESEP Es Teh Manis | Gula Pasir : 25`",
      );
      return;
    }

    const productName = parts[0];
    const bahanPart = parts[1];

    const bahanSubParts = bahanPart.split(":").map((item) => item.trim());
    if (bahanSubParts.length < 2) {
      await sendWhatsAppMessage(
        sender,
        "❌ Format bahan dan takaran salah. Gunakan titik dua (:).\nContoh: `Gula Pasir : 25`",
      );
      return;
    }

    const materialName = bahanSubParts[0];
    const amountUsed = parseFloat(bahanSubParts[1]);

    if (isNaN(amountUsed)) {
      await sendWhatsAppMessage(
        sender,
        "❌ Jumlah takaran bahan harus berupa angka!",
      );
      return;
    }

    let product = await db("products")
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      const [productId] = await db("products").insert({
        user_id: 1,
        name: productName,
      });
      product = { id: productId, name: productName };
    }

    const material = await db("raw_materials")
      .where("name", "like", `%${materialName}%`)
      .first();

    if (!material) {
      await sendWhatsAppMessage(
        sender,
        `❌ Bahan baku "${materialName}" tidak ditemukan!\nTambahkan dulu dengan perintah:\n\`TAMBAH BAHAN ${materialName}, [Harga], [Qty Satuan]\``,
      );
      return;
    }

    await db("product_ingredients").insert({
      product_id: product.id,
      material_id: material.id,
      amount_used: amountUsed,
    });

    await sendWhatsAppMessage(
      sender,
      `✅ *Resep Berhasil Ditambahkan!*\n\n🍽 *Produk*: ${product.name}\n📦 *Bahan*: ${material.name}\n⚖️ *Takaran*: ${amountUsed}`,
    );
  } catch (error) {
    console.error("Error handleTambahResep:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal menyimpan resep ke database.");
  }
};

// 7. HAPUS RESEP / RESET RESEP PRODUK (Menu Baru)
// Format: HAPUS RESEP [Nama Produk]
const handleHapusResep = async (sender, messageText) => {
  try {
    const productName = messageText.replace(/^HAPUS RESEP/i, "").trim();

    if (!productName) {
      await sendWhatsAppMessage(
        sender,
        "❌ Masukkan nama produk.\nContoh: `HAPUS RESEP Es Teh Manis`",
      );
      return;
    }

    const product = await db("products")
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      await sendWhatsAppMessage(
        sender,
        `❌ Produk "${productName}" tidak ditemukan.`,
      );
      return;
    }

    // Hapus semua bahan racikan produk tersebut
    await db("product_ingredients").where("product_id", product.id).del();
    await db("products").where("id", product.id).update({ total_hpp: 0 });

    await sendWhatsAppMessage(
      sender,
      `🗑️ *Berhasil Mengosongkan Resep Produk*: ${product.name}`,
    );
  } catch (error) {
    console.error("Error handleHapusResep:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal menghapus resep produk.");
  }
};

// 8. HITUNG HPP
const handleHitungHpp = async (sender, messageText) => {
  try {
    const productName = messageText.replace(/^HITUNG HPP/i, "").trim();

    if (!productName) {
      await sendWhatsAppMessage(
        sender,
        "❌ Masukkan nama produk.\nContoh: `HITUNG HPP Es Teh Manis`",
      );
      return;
    }

    const product = await db("products")
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      await sendWhatsAppMessage(
        sender,
        `❌ Produk "${productName}" tidak ditemukan.`,
      );
      return;
    }

    const ingredients = await db("product_ingredients")
      .join(
        "raw_materials",
        "product_ingredients.material_id",
        "=",
        "raw_materials.id",
      )
      .leftJoin("units", "raw_materials.unit_id", "=", "units.id")
      .where("product_ingredients.product_id", product.id)
      .select(
        "raw_materials.name",
        "raw_materials.price_per_unit",
        "product_ingredients.amount_used",
        "units.symbol as unit_symbol",
      );

    if (ingredients.length === 0) {
      await sendWhatsAppMessage(
        sender,
        `⚠️ Produk *${product.name}* belum memiliki resep.`,
      );
      return;
    }

    let totalHpp = 0;
    let reply = `📊 *Kalkulasi HPP: ${product.name}*:\n\n`;

    ingredients.forEach((item, idx) => {
      const pricePerUnit = parseFloat(item.price_per_unit || 0);
      const subtotal = item.amount_used * pricePerUnit;
      totalHpp += subtotal;

      reply += `${idx + 1}. *${item.name}*\n   Takaran: ${item.amount_used} ${item.unit_symbol || ""}\n   Biaya: Rp ${Math.round(subtotal).toLocaleString("id-ID")}\n\n`;
    });

    reply += `-----------------------------------\n`;
    reply += `💰 *Total HPP: Rp ${Math.round(totalHpp).toLocaleString("id-ID")}*`;

    await db("products")
      .where("id", product.id)
      .update({ total_hpp: totalHpp });

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleHitungHpp:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal melakukan kalkulasi HPP.");
  }
};

module.exports = {
  handleCheckHpp,
  handleDaftarProduk,
  handleTambahBahan,
  handleEditBahan,
  handleHapusBahan,
  handleTambahResep,
  handleHapusResep,
  handleHitungHpp,
};
