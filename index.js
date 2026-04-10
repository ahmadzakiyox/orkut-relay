const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Secret key untuk autentikasi - SET di Heroku Config Vars
const SECRET_KEY = process.env.SECRET_KEY || "ganti-key-rahasia-kamu";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== DEVICE GENERATOR =====
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function generateDevice(username) {
  const seed = sha256(username);
  const models = [
    "SM-G960F", "SM-G973F", "SM-A505F", "SM-G991B", "SM-A536B",
    "Pixel 7", "RMX3363", "CPH2363", "M2101K6G", "sdk_gphone_x86",
  ];
  const versions = ["10", "11", "12", "13", "14"];

  const pick = (arr, offset) => {
    const h = sha256(seed + String(offset));
    return arr[parseInt(h.slice(0, 8), 16) % arr.length];
  };

  return {
    uuid: seed.slice(0, 22),
    phone_model: pick(models, 1),
    android_version: pick(versions, 2),
    app_version_code: "250918",
    app_version_name: "25.09.18",
    user_agent: "okhttp/4.12.0",
    secretKey: sha256(username + "_orkut_secret"),
  };
}

function generateSignature(params, timestamp, secretKey) {
  let sigStr = "";
  for (const k of Object.keys(params).sort()) {
    sigStr += `${k}=${params[k]}&`;
  }
  sigStr += `timestamp=${timestamp}&key=${secretKey}`;
  return crypto.createHash("md5").update(sigStr).digest("hex");
}

// ===== MIDDLEWARE: Auth =====
function authMiddleware(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.key || "";
  if (key !== SECRET_KEY) {
    return res.status(401).json({ status: false, error: "Unauthorized - API key salah" });
  }
  next();
}

// ===== ENDPOINT: Health =====
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "OrderKuota Mutasi Relay",
    usage: "GET /api/mutasi?key=SECRET&username=USER&token=USERID:TOKEN",
    time: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ===== ENDPOINT: Cek Mutasi =====
// GET /api/mutasi?key=SECRET&username=08xxxx&token=12345:abcdef
app.get("/api/mutasi", authMiddleware, async (req, res) => {
  const username = req.query.username || "";
  const token = req.query.token || "";

  if (!username || !token) {
    return res.status(400).json({
      status: false,
      error: "Parameter 'username' dan 'token' wajib diisi",
      usage: "/api/mutasi?key=SECRET&username=08xxxx&token=USERID:TOKEN",
    });
  }

  const parts = token.split(":");
  if (parts.length < 2) {
    return res.status(400).json({
      status: false,
      error: "Token harus format userId:authToken",
    });
  }

  const userId = parts[0];

  try {
    const device = generateDevice(username);
    const timestamp = String(Date.now());
    const requestId = crypto.randomBytes(16).toString("hex");

    const sigParams = {
      auth_username: username,
      auth_token: token,
      uuid: device.uuid,
      timestamp,
    };
    const signature = generateSignature(sigParams, timestamp, device.secretKey);

    const formData = new URLSearchParams();
    formData.append("auth_username", username);
    formData.append("auth_token", token);
    formData.append("uuid", device.uuid);
    formData.append("phone_model", device.phone_model);
    formData.append("phone_uuid", device.uuid);
    formData.append("timestamp", timestamp);
    formData.append("request_id", requestId);
    formData.append("signature", signature);
    formData.append("app_version_code", device.app_version_code);
    formData.append("app_version_name", device.app_version_name);
    formData.append("platform", "android");
    formData.append("filter[qris_history][keterangan]", "");
    formData.append("filter[qris_history][jumlah]", "");
    formData.append("qris_history[page]", "1");
    formData.append("filter[qris_history][dari_tanggal]", "");
    formData.append("filter[qris_history][sampai_tanggal]", "");
    formData.append(
      "device_info",
      JSON.stringify({
        brand: "android",
        model: device.phone_model,
        version: device.android_version,
        sdk: parseInt(device.android_version),
      })
    );
    formData.append(
      "app_info",
      JSON.stringify({
        version_code: device.app_version_code,
        version_name: device.app_version_name,
      })
    );

    const response = await axios.post(
      `https://app.orderkuota.com/api/v2/qris/history/${userId}`,
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": device.user_agent,
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Platform": "android",
          "X-App-Version": device.app_version_name,
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    // Extract history dari berbagai format response
    let items = [];
    if (data.data?.qris_history?.results) items = data.data.qris_history.results;
    else if (data.qris_history?.results) items = data.qris_history.results;
    else if (data.results) items = data.results;
    else if (Array.isArray(data.data)) items = data.data;
    else if (Array.isArray(data)) items = data;

    // Format output
    const mutasi = items.map((item) => ({
      date: item.created_at || item.date || item.timestamp || "",
      amount: String(item.amount || item.jumlah || item.nominal || 0).replace(/[^0-9]/g, ""),
      type: String(item.type || item.direction || "").toUpperCase() === "IN" ? "CR" : "DB",
      brand_name: item.brand?.name || item.brand_name || "",
      issuer_reff: String(item.id || item.issuer_reff || item.reff || ""),
      buyer_reff: item.buyer || item.note || item.keterangan || "",
      balance: String(item.saldo || item.balance || 0).replace(/[^0-9]/g, ""),
    }));

    console.log(`[mutasi] ✅ ${username} — ${mutasi.length} transaksi`);

    return res.json({
      status: true,
      message: "OK",
      merchant: "OK" + username,
      count: mutasi.length,
      data: mutasi,
    });
  } catch (e) {
    const code = e.response?.status;
    const msg = e.response?.data?.message || e.message;

    console.error(`[mutasi] ❌ ${username} — ${code || "?"}: ${msg}`);

    return res.status(code === 469 ? 469 : 500).json({
      status: false,
      error: msg,
      code,
    });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`\n🚀 OrderKuota Mutasi Relay`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Endpoint: GET /api/mutasi?key=SECRET&username=USER&token=TOKEN`);
  console.log(`   Health: GET /api/health\n`);
});
