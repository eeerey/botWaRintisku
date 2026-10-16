const db = require("../config/db");
const { sendWhatsAppMessage } = require("../services/wablasService");

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

const normalizeUnitName = (unitName = "") =>
  String(unitName).toLowerCase().trim();

const parseAmountWithUnit = (value = "") => {
  const cleanValue = String(value).trim();
  const match = cleanValue.match(/^([\d.]+)\s*([a-zA-Z]+)?$/);

  if (!match) {
    return { amount: NaN, unit: "" };
  }

  return {
    amount: parseFloat(match[1]),
    unit: normalizeUnitName(match[2] || ""),
  };
};

const convertAmountToMaterialUnit = async (
  amount,
  fromUnit,
  materialUnitId,
) => {
  if (!Number.isFinite(amount) || !materialUnitId) {
    return Number(amount);
  }

  const materialUnit = await db("units").where("id", materialUnitId).first();
  if (!materialUnit) {
    return Number(amount);
  }

  const normalizedTarget = normalizeUnitName(materialUnit.symbol);
  const normalizedFrom = normalizeUnitName(fromUnit || normalizedTarget);

  if (!normalizedFrom || normalizedFrom === normalizedTarget) {
    return Number(amount);
  }

  const fromUnitRow = await db("units")
    .where("symbol", "like", normalizedFrom)
    .orWhere("name", "like", normalizedFrom)
    .first();

  if (!fromUnitRow) {
    return Number(amount);
  }

  const conversion = await db("unit_conversions")
    .where((builder) => {
      builder
        .where("from_unit_id", fromUnitRow.id)
        .andWhere("to_unit_id", materialUnit.id);
    })
    .orWhere((builder) => {
      builder
        .where("from_unit_id", materialUnit.id)
        .andWhere("to_unit_id", fromUnitRow.id);
    })
    .first();

  if (!conversion) {
    return Number(amount);
  }

  if (
    conversion.from_unit_id === fromUnitRow.id &&
    conversion.to_unit_id === materialUnit.id
  ) {
    return Number(amount) * Number(conversion.multiplier);
  }

  return Number(amount) / Number(conversion.multiplier);
};

// 1. CEK HPP (Lihat daftar bahan baku)
const handleCheckHpp = async (sender, userId) => {
  try {
    const rawMaterials = await db("raw_materials")
      .leftJoin("units", "raw_materials.unit_id", "units.id")
      .where("raw_materials.user_id", userId)
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
      reply += `${index + 1}. *${item.name}*: Rp ${price.toLocaleString("id-ID")} / ${unit} (Stok: ${item.stock}${unit})\n`;
    });
    reply += "\n💡 *Format Tambah Bahan*:\n`TAMBAH BAHAN Gula, 15000, 1kg`";

    await sendWhatsAppMessage(sender, reply);
  } catch (error) {
    console.error("Error handleCheckHpp:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal memuat data bahan baku.");
  }
};

// 2. DAFTAR PRODUK (Menu Baru)
const handleDaftarProduk = async (sender, userId) => {
  try {
    const products = await db("products")
      .where("user_id", userId)
      .select("name", "total_hpp");

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
const handleTambahBahan = async (sender, messageText, userId) => {
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
      user_id: userId,
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
const handleEditBahan = async (sender, messageText, userId) => {
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
      .where("user_id", userId)
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
      .where("user_id", userId)
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
const handleHapusBahan = async (sender, messageText, userId) => {
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
      .where("user_id", userId)
      .where("name", "like", `%${materialName}%`)
      .first();

    if (!material) {
      await sendWhatsAppMessage(
        sender,
        `❌ Bahan "${materialName}" tidak ditemukan.`,
      );
      return;
    }

    await db("raw_materials")
      .where("id", material.id)
      .where("user_id", userId)
      .del();

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
const handleTambahResep = async (sender, messageText, userId) => {
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

    let product = await db("products")
      .where("user_id", userId)
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      const [productId] = await db("products").insert({
        user_id: userId,
        name: productName,
      });
      product = { id: productId, name: productName };
    }

    const material = await db("raw_materials")
      .where("user_id", userId)
      .where("name", "like", `%${materialName}%`)
      .first();

    if (!material) {
      await sendWhatsAppMessage(
        sender,
        `❌ Bahan baku "${materialName}" tidak ditemukan!\nTambahkan dulu dengan perintah:\n\`TAMBAH BAHAN ${materialName}, [Harga], [Qty Satuan]\``,
      );
      return;
    }

    const { amount: rawAmount, unit: rawUnit } = parseAmountWithUnit(
      bahanSubParts[1],
    );

    if (Number.isNaN(rawAmount)) {
      await sendWhatsAppMessage(
        sender,
        "❌ Jumlah takaran bahan harus berupa angka!",
      );
      return;
    }

    const normalizedAmount = await convertAmountToMaterialUnit(
      rawAmount,
      rawUnit,
      material.unit_id,
    );

    await db("product_ingredients").insert({
      product_id: product.id,
      material_id: material.id,
      amount_used: normalizedAmount,
    });

    const materialUnit = await db("units")
      .where("id", material.unit_id)
      .first();

    const displayUnit = materialUnit?.symbol || rawUnit || "unit";

    await sendWhatsAppMessage(
      sender,
      `✅ *Resep Berhasil Ditambahkan!*\n\n🍽 *Produk*: ${product.name}\n📦 *Bahan*: ${material.name}\n⚖️ *Takaran*: ${rawAmount}${rawUnit || displayUnit}`,
    );
  } catch (error) {
    console.error("Error handleTambahResep:", error);
    await sendWhatsAppMessage(sender, "❌ Gagal menyimpan resep ke database.");
  }
};

// 7. HAPUS RESEP
const handleHapusResep = async (sender, messageText, userId) => {
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
      .where("user_id", userId)
      .where("name", "like", `%${productName}%`)
      .first();

    if (!product) {
      await sendWhatsAppMessage(
        sender,
        `❌ Produk "${productName}" tidak ditemukan.`,
      );
      return;
    }

    await db("product_ingredients").where("product_id", product.id).del();
    await db("products")
      .where("id", product.id)
      .where("user_id", userId)
      .update({ total_hpp: 0 });

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
const parseNumber = (str = "") => {
  if (!str) return 0;
  let clean = String(str).replace(/rp/gi, "").trim();
  if (clean.includes(".") && clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(/,/g, ".");
  } else if (clean.includes(".")) {
    if (/\.\d{3}/.test(clean)) {
      clean = clean.replace(/\./g, "");
    }
  } else if (clean.includes(",")) {
    clean = clean.replace(/,/g, ".");
  }
  clean = clean.replace(/[^0-9.]/g, "");
  return parseFloat(clean) || 0;
};

const handleHitungHpp = async (sender, messageText, userId) => {
  try {
    const rawLines = messageText.split("\n").map((line) => line.trim()).filter(Boolean);
    const cleanedLines = rawLines.map((line) => line.replace(/[*_~`]/g, "").trim());
    const firstLineClean = cleanedLines[0] ? cleanedLines[0].toLowerCase() : "";

    // 1. Jika hanya mengetik "HITUNG HPP" (atau "*HITUNG HPP*")
    if (cleanedLines.length === 1 && firstLineClean === "hitung hpp") {
      const guideText =
        "Baik! Mari Kita Hitung HPP-nya\n\n" +
        "📋 *Format Input Hitung HPP*\n" +
        "_(Salin pesan di bawah ini mulai dari teks HITUNG HPP)_\n\n" +
        "HITUNG HPP\n" +
        "Nama Produk:\n" +
        "Porsi:\n" +
        "Bahan Baku: [Bahan1:Harga1, Bahan2:Harga2]\n" +
        "Tenaga Kerja:\n" +
        "Biaya Tenaga Kerja:\n" +
        "Overhead:\n" +
        "Biaya Overhead:\n" +
        "Margin:\n\n" +
        "*Contoh Penulisan*\n" +
        "HITUNG HPP\n" +
        "Nama Produk: Es Teh Manis\n" +
        "Porsi: 10\n" +
        "Bahan Baku: Gula:15000, Teh:5000\n" +
        "Tenaga Kerja: 2 orang\n" +
        "Biaya Tenaga Kerja: Rp20.000\n" +
        "Overhead: Es batu, sedotan\n" +
        "Biaya Overhead: Rp5.000\n" +
        "Margin: 50%";

      await sendWhatsAppMessage(sender, guideText);
      return;
    }

    // 2. Parsing parameter dari pesan multiline (tahan terhadap format bold / spasi)
    let namaProduk = "";
    let porsi = 1;
    let bahanBakuInput = "";
    let tenagaKerja = "";
    let biayaTenagaKerja = 0;
    let overhead = "";
    let biayaOverhead = 0;
    let marginPercent = 0;

    rawLines.forEach((rawLine) => {
      const line = rawLine.replace(/[*_~`]/g, "").trim();
      if (/^Nama Produk\s*:/i.test(line)) {
        namaProduk = line.replace(/^Nama Produk\s*:/i, "").trim();
      } else if (/^Porsi\s*:/i.test(line)) {
        porsi = parseNumber(line.replace(/^Porsi\s*:/i, "")) || 1;
      } else if (/^Bahan Baku\s*:/i.test(line)) {
        bahanBakuInput = line.replace(/^Bahan Baku\s*:/i, "").trim();
      } else if (/^Tenaga Kerja\s*:/i.test(line)) {
        tenagaKerja = line.replace(/^Tenaga Kerja\s*:/i, "").trim();
      } else if (/^Biaya Tenaga Kerja\s*:/i.test(line)) {
        biayaTenagaKerja = parseNumber(line.replace(/^Biaya Tenaga Kerja\s*:/i, ""));
      } else if (/^Overhead\s*:/i.test(line)) {
        overhead = line.replace(/^Overhead\s*:/i, "").trim();
      } else if (/^Biaya Overhead\s*:/i.test(line)) {
        biayaOverhead = parseNumber(line.replace(/^Biaya Overhead\s*:/i, ""));
      } else if (/^Margin\s*:/i.test(line)) {
        marginPercent = parseNumber(line.replace(/^Margin\s*:/i, ""));
      }
    });

    if (!namaProduk) {
      await sendWhatsAppMessage(
        sender,
        "❌ Nama Produk tidak boleh kosong. Gunakan format input `HITUNG HPP` yang benar."
      );
      return;
    }

    // 3. Pengecekan Bahan Baku
    const rawMaterialsList = await db("raw_materials").where("user_id", userId);
    let totalBiayaBahan = 0;
    const missingMaterials = [];
    const bahanPairs = bahanBakuInput.split(",").map((b) => b.trim()).filter(Boolean);

    for (const pair of bahanPairs) {
      const parts = pair.split(":");
      const rawName = parts[0] ? parts[0].trim() : "";
      const priceVal = parts[1] ? parseNumber(parts[1]) : 0;

      if (!rawName) continue;

      const existing = rawMaterialsList.find(
        (m) => m.name.toLowerCase() === rawName.toLowerCase()
      );

      if (!existing) {
        missingMaterials.push(rawName);
      } else {
        totalBiayaBahan += priceVal;
      }
    }

    if (missingMaterials.length > 0) {
      const unaddedList = missingMaterials.join(", ");
      await sendWhatsAppMessage(
        sender,
        `⚠️ Bahan *${unaddedList}* belum tertambah di TAMBAH BAHAN, mohon segera tambahkan.`
      );
      return;
    }

    // 4. Kalkulasi Total HPP, HPP Satuan, & Harga Jual
    const totalHpp = totalBiayaBahan + biayaTenagaKerja + biayaOverhead;
    const hppSatuan = porsi > 0 ? totalHpp / porsi : totalHpp;
    const hargaJual = hppSatuan + (hppSatuan * (marginPercent / 100));

    // 5. Cek apakah produk sudah ada di tabel products (opsional)
    const product = await db("products")
      .where("user_id", userId)
      .where("name", "like", `%${namaProduk}%`)
      .first();

    // 6. SIMPAN HASIL KE TABEL hpp_calculations
    await db("hpp_calculations").insert({
      user_id: userId,
      product_id: product ? product.id : null,
      product_name: namaProduk,
      servings: porsi,
      raw_material_cost: totalBiayaBahan,
      labor_details: tenagaKerja,
      labor_cost: biayaTenagaKerja,
      overhead_details: overhead,
      overhead_cost: biayaOverhead,
      margin_percent: marginPercent,
      total_hpp: totalHpp,
      hpp_per_unit: hppSatuan,
      selling_price: hargaJual
    });

    // 7. Format Balasan
    let reply = `*HASIL HPP*\n`;
    reply += `Nama Produk: ${namaProduk}\n`;
    reply += `Porsi: ${porsi}\n`;
    reply += `Bahan Baku: ${bahanBakuInput}\n`;
    reply += `Tenaga Kerja: ${tenagaKerja}\n`;
    reply += `Biaya Tenaga Kerja: Rp${Math.round(biayaTenagaKerja).toLocaleString("id-ID")}\n`;
    reply += `Overhead: ${overhead}\n`;
    reply += `Biaya Overhead: Rp${Math.round(biayaOverhead).toLocaleString("id-ID")}\n`;
    reply += `Margin: ${marginPercent}%\n`;
    reply += `-----------------------------------\n`;
    reply += `TOTAL HPP: Rp${Math.round(totalHpp).toLocaleString("id-ID")}\n`;
    reply += `HPP satuan: Rp.${Math.round(hppSatuan).toLocaleString("id-ID")}\n`;
    reply += `Harga Jual: Rp.${Math.round(hargaJual).toLocaleString("id-ID")}`;

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
