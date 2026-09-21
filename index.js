require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// Pulling all secrets and IDs from environment variables
const MONGO_URI = process.env.MONGO_URI;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

app.post("/requestOtp", async (req, res) => {
  const { uid, email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await client.db("emergency_app").collection("logins").updateOne(
      { uid },
      { $set: { uid, email, otp, expiresAt } },
      { upsert: true }
    );
    await client.close();

    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: { to_email: email, otp_code: otp },
      }),
    });

    res.json({ sent: true });
  } catch (error) {
    console.error("Error in requestOtp:", error);
    res.status(500).json({ sent: false, error: "Internal Server Error" });
  }
});

app.post("/verifyOtp", async (req, res) => {
  const { uid, otp } = req.body;

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const record = await client.db("emergency_app").collection("logins").findOne({ uid });
    await client.close();

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
      return res.json({ verified: false });
    }
    res.json({ verified: true });
  } catch (error) {
    console.error("Error in verifyOtp:", error);
    res.status(500).json({ verified: false, error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));