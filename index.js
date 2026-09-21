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
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID; // For OTP
const EMAILJS_NOTIFY_TEMPLATE_ID = process.env.EMAILJS_NOTIFY_TEMPLATE_ID; // For Alerts & Cancellations
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

// 1. OTP REQUEST
app.post("/requestOtp", async (req, res) => {
  const { uid, email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;

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

// 2. OTP VERIFY
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

// 3. CONTINUOUS LOCATION UPDATE
app.post("/updateLocation", async (req, res) => {
  const { uid, lat, lng } = req.body;
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await client.db("emergency_app").collection("locations").updateOne(
      { uid },
      { $set: { uid, lat, lng, lastUpdate: Date.now() } },
      { upsert: true }
    );
    await client.close();
    res.json({ success: true });
  } catch (error) {
    console.error("Location error:", error);
    res.status(500).json({ success: false });
  }
});

// 4. THE 5-SECOND RAPID PING
app.post("/rapidPing", async (req, res) => {
  const { uid, lat, lng, battery, emails } = req.body;
  const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await client.db("emergency_app").collection("alerts").updateOne(
      { uid },
      { $set: { uid, lat, lng, battery, status: "ACTIVE_EMERGENCY", timestamp: Date.now() } },
      { upsert: true }
    );
    await client.close();

    // Mass Email Trigger
    if (emails && emails.length > 0) {
      const emailPromises = emails.map(email =>
        fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_NOTIFY_TEMPLATE_ID, 
            user_id: EMAILJS_PUBLIC_KEY,
            accessToken: EMAILJS_PRIVATE_KEY,
            template_params: {
              to_email: email,
              subject: "🚨 EMERGENCY ALERT: I need immediate help",
              message: `An emergency protocol has been activated. My battery is at ${battery}%. My exact GPS coordinates are: ${mapsLink}. You will receive a Google Drive link containing live video and audio recordings shortly.`
            },
          }),
        })
      );
      await Promise.all(emailPromises);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("rapidPing error:", error);
    res.status(500).json({ success: false });
  }
});

// 5. CANCEL FALSE ALARM
app.post("/cancelAlert", async (req, res) => {
  const { uid, emails } = req.body;
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await client.db("emergency_app").collection("alerts").updateOne(
      { uid },
      { $set: { status: "SAFE", timestamp: Date.now() } }
    );
    await client.close();

    // Mass "I'm Safe" Trigger
    if (emails && emails.length > 0) {
      const emailPromises = emails.map(email =>
        fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_NOTIFY_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            accessToken: EMAILJS_PRIVATE_KEY,
            template_params: {
              to_email: email,
              subject: "✅ FALSE ALARM: I am safe",
              message: "I have cancelled my emergency alert. It was a false alarm or the situation has been resolved. I am safe and no further action is required."
            },
          }),
        })
      );
      await Promise.all(emailPromises);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("cancelAlert error:", error);
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));