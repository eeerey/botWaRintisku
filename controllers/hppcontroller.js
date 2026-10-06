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
// 8. HITUNG HPP LENGKAP (Bahan Baku + Tenaga Kerja + Overhead + Margin)
// Format Input Pesan:
// HITUNG HPP Nama Produk: Es Teh Manis | Porsi: 100 | Bahan Baku: Gula Pasir:25000, Teh Celup:10000 | Tenaga Kerja: 2 orang | Biaya Tenaga Kerja: Rp20.000 | Overhead: Gas, Listrik | Biaya Overhead: Rp15.000 | Margin: 50%
const handleHitungHpp = async (sender, messageText, userId = 1) => {
  try {
    const rawContent = messageText.replace(/^HITUNG HPP/i, "").trim();

    if (!rawContent) {
      const helperMsg = 
        `❌ *Format HITUNG HPP Salah!*\n\n` +
        `Gunakan format berikut:\n` +
        `\`HITUNG HPP Nama Produk: [Nama] | Porsi: [Jumlah] | Bahan Baku: [Bahan1:Harga1, Bahan2:Harga2] | Tenaga Kerja: [Detail] | Biaya Tenaga Kerja: [Nominal] | Overhead: [Detail] | Biaya Overhead: [Nominal] | Margin: [Persen]\`\n\n` +
        `*Contoh*:\n` +
        `\`HITUNG HPP Nama Produk: Es Teh Manis | Porsi: 10 | Bahan Baku: Gula:15000, Teh:5000 | Tenaga Kerja: 2 orang | Biaya Tenaga Kerja: Rp20.000 | Overhead: Es batu, sedotan | Biaya Overhead: Rp5.000 | Margin: 50%\``;
      
      await sendWhatsAppMessage(sender, helperMsg);
      return;
    }

    // Parse segmen berdasarkan pemisah "|"
    const segments = rawContent.split("|").map((s) => s.trim());
    const data = {};

    segments.forEach((segment) => {
      const [key, ...valueParts] = segment.split(":");
      if (key && valueParts.length > 0) {
        const cleanKey = key.trim().toLowerCase();
        const value = valueParts.join(":").trim(); // Menjaga jika ada titik dua di dalam nilai
        data[cleanKey] = value;
      }
    });

    // Helper untuk membersihkan input nominal angka
    const parseCurrency = (str) => {
      if (!str) return 0;
      const clean = str.replace(/rp/gi, "").replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "").trim();
      return parseFloat(clean) || 0;
    };

    const productName = data["nama produk"] || "Produk Tanpa Nama";
    const totalPorsi = parseCurrency(data["porsi"]) || 1;
    const detailTK = data["tenaga kerja"] || "-";
    const biayaTK = parseCurrency(data["biaya tenaga kerja"]);
    const detailOH = data["overhead"] || "-";
    const biayaOH = parseCurrency(data["biaya overhead"]);
    const targetMargin = parseCurrency(data["margin"]) || 0;

    // Parse Bahan Baku (Format: NamaBahan1:Harga1, NamaBahan2:Harga2)
    let totalBahanBaku = 0;
    const listBahan = [];
    const rawBahanStr = data["bahan baku"] || "";

    if (rawBahanStr) {
      const bahanItems = rawBahanStr.split(",").map((b) => b.trim());
      bahanItems.forEach((item) => {
        const parts = item.split(":").map((p) => p.trim());
        if (parts.length >= 2) {
          const namaBahan = parts[0];
          const hargaBahan = parseCurrency(parts[1]);
          totalBahanBaku += hargaBahan;
          listBahan.push({ nama: namaBahan, harga: hargaBahan });
        }
      });
    }

    // ----------------------------------------------------
    // RUMUS PERHITUNGAN HPP & HARGA JUAL
    // ----------------------------------------------------
    // 1. Total Biaya Produksi = Total Bahan + Biaya TK + Biaya Overhead
    const totalBiayaProduksi = totalBahanBaku + biayaTK + biayaOH;

    // 2. HPP per Porsi = Total Biaya Produksi / Jumlah Porsi
    const hppPerPorsi = Math.round(totalBiayaProduksi / totalPorsi);

    // 3. Rekomendasi Harga Jual (Profit Margin: HPP / (1 - Margin%))
    let hargaJualRekomendasi = hppPerPorsi;
    if (targetMargin > 0 && targetMargin < 100) {
      hargaJualRekomendasi = Math.round(hppPerPorsi / (1 - targetMargin / 100));
    } else if (targetMargin >= 100) {
      // Fallback Markup jika margin >= 100%
      hargaJualRekomendasi = Math.round(hppPerPorsi + (hppPerPorsi * targetMargin) / 100);
    }

    // 4. Estimasi Keuntungan
    const profitPerPorsi = hargaJualRekomendasi - hppPerPorsi;
    const totalProfit = profitPerPorsi * totalPorsi;

    // ----------------------------------------------------
    // SUSUN BALASAN WHATSAPP
    // ----------------------------------------------------
    let reply = `📊 *HASIL KALKULASI HPP & HARGA JUAL*\n`;
    reply += `🍽 *Produk*: ${productName}\n`;
    reply += `📦 *Jumlah Produksi*: ${totalPorsi} porsi\n\n`;

    reply += `📝 *Rincian Biaya Produksi*:\n`;
    if (listBahan.length > 0) {
      listBahan.forEach((b, idx) => {
        reply += `  ${idx + 1}. ${b.nama}: Rp ${b.harga.toLocaleString("id-ID")}\n`;
      });
      reply += `  *Subtotal Bahan Baku*: Rp ${totalBahanBaku.toLocaleString("id-ID")}\n`;
    } else {
      reply += `  - Bahan Baku: Rp 0\n`;
    }

    reply += `  - Tenaga Kerja (${detailTK}): Rp ${biayaTK.toLocaleString("id-ID")}\n`;
    reply += `  - Overhead (${detailOH}): Rp ${biayaOH.toLocaleString("id-ID")}\n`;
    reply += `-----------------------------------\n`;
    reply += `💰 *Total Biaya Produksi*: Rp ${totalBiayaProduksi.toLocaleString("id-ID")}\n`;
    reply += `🏷 *HPP per Porsi*: Rp ${hppPerPorsi.toLocaleString("id-ID")}\n\n`;

    reply += `📈 *Simulasi Harga Jual & Profit*:\n`;
    reply += `🎯 *Target Margin*: ${targetMargin}%\n`;
    reply += `💡 *Rekomendasi Harga Jual*: Rp ${hargaJualRekomendasi.toLocaleString("id-ID")} / porsi\n`;
    reply += `💵 *Profit per Porsi*: Rp ${profitPerPorsi.toLocaleString("id-ID")}\n`;
    reply += `🤑 *Total Profit* (x${totalPorsi}): Rp ${totalProfit.toLocaleString("id-ID")}`;

    // Simpan/Update produk ke database
    let product = await db("products")
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      await db("products").insert({
        user_id: userId,
        name: productName,
        total_hpp: hppPerPorsi,
      });
    } else {
      await db("products")
        .where("id", product.id)
        .update({ total_hpp: hppPerPorsi });
    }

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleHitungHpp:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal melakukan kalkulasi HPP. Pastikan format pesan sudah benar.");
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
