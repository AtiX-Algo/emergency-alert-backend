require("dotenv").config();
const functions = require("firebase-functions");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

const MONGO_URI = process.env.MONGO_URI;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

exports.requestOtp = functions.https.onCall(async (data, context) => {
  const { uid, email } = data;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

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
      service_id: "YOUR_SERVICE_ID",
      template_id: "YOUR_TEMPLATE_ID",
      user_id: "YOUR_PUBLIC_KEY",
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: { to_email: email, otp_code: otp },
    }),
  });

  return { sent: true };
});

exports.verifyOtp = functions.https.onCall(async (data, context) => {
  const { uid, otp } = data;

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const record = await client.db("emergency_app").collection("logins").findOne({ uid });
  await client.close();

  if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
    return { verified: false };
  }
  return { verified: true };
});