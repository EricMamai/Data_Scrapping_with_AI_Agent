"use strict";

const maskPhone = (phone) => `${phone.slice(0, 4)}******${phone.slice(-3)}`;

function createConsoleSender() {
  return {
    name: "console",
    async send(phone, code) {
      console.log(`[DEV SMS] To ${maskPhone(phone)}: your Wazi verification code is ${code}`);
    },
  };
}

function createAfricasTalkingSender({ username, apiKey, senderId, baseUrl = "https://api.africastalking.com" }) {
  return {
    name: "africastalking",
    async send(phone, code) {
      const form = new URLSearchParams({
        username,
        to: phone,
        message: `Your Wazi verification code is ${code}. It expires in 5 minutes.`,
      });
      if (senderId) form.set("from", senderId);
      const response = await fetch(`${baseUrl}/version1/messaging`, {
        method: "POST",
        headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`SMS gateway responded with HTTP ${response.status}`);
    },
  };
}

function createSenderFromEnv(env) {
  if (env.SMS_PROVIDER === "africastalking") {
    if (!env.AT_USERNAME || !env.AT_API_KEY) throw new Error("AT_USERNAME and AT_API_KEY are required for Africa's Talking.");
    return createAfricasTalkingSender({ username: env.AT_USERNAME, apiKey: env.AT_API_KEY, senderId: env.AT_SENDER_ID });
  }
  return createConsoleSender();
}

module.exports = { createConsoleSender, createAfricasTalkingSender, createSenderFromEnv, maskPhone };
