import assert from "node:assert/strict";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const sessionStorage = createStorage();
const localStorage = createStorage({
  "physiovision.token": "legacy-persistent-token",
});
const responses = [];
const requests = [];

globalThis.window = {
  location: { hostname: "localhost" },
  sessionStorage,
  localStorage,
};
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  const next = responses.shift();
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    json: async () => next.body,
  };
};

const api = await import("../api.js?api-auth-test");

assert.equal(localStorage.getItem("physiovision.token"), null);

responses.push({
  status: 201,
  body: {
    email: "person@example.com",
    verification_required: true,
  },
});
await api.register({
  email: "person@example.com",
  password: "safe-password",
  firstName: "Test",
  lastName: "Person",
});
assert.equal(sessionStorage.getItem("physiovision.token"), null);

responses.push({
  status: 202,
  body: {
    verification_required: true,
    verification_purpose: "login",
    challenge_id: "login-challenge",
  },
});
const loginChallenge = await api.login({
  email: "person@example.com",
  password: "safe-password",
});
assert.equal(loginChallenge.challenge_id, "login-challenge");
assert.equal(sessionStorage.getItem("physiovision.token"), null);

responses.push({ status: 200, body: { token: "login-token" } });
await api.verifyLogin({
  challengeId: loginChallenge.challenge_id,
  code: "456789",
});
assert.equal(sessionStorage.getItem("physiovision.token"), "login-token");
assert.equal(localStorage.getItem("physiovision.token"), null);

responses.push({ status: 200, body: { token: "verified-token" } });
await api.verifyEmail({
  email: "person@example.com",
  code: "123456",
});
assert.equal(sessionStorage.getItem("physiovision.token"), "verified-token");

responses.push({
  status: 200,
  body: { detail: "If the account exists, a code was sent." },
});
await api.requestPasswordReset("person@example.com");

responses.push({
  status: 200,
  body: { reset_token: "one-time-reset-token" },
});
const resetVerification = await api.verifyPasswordResetCode({
  email: "person@example.com",
  code: "654321",
});
assert.equal(resetVerification.reset_token, "one-time-reset-token");

responses.push({
  status: 200,
  body: { detail: "Your password has been changed." },
});
await api.resetPassword({
  email: "person@example.com",
  resetToken: "one-time-reset-token",
  newPassword: "new-safe-password",
});

responses.push({ status: 204, body: null });
await api.logout();
assert.equal(sessionStorage.getItem("physiovision.token"), null);
assert.match(requests[0].url, /\/api\/auth\/register\/$/);
assert.match(requests[2].url, /\/api\/auth\/verify-login\/$/);
assert.match(requests[4].url, /\/api\/auth\/forgot-password\/$/);
assert.match(requests[5].url, /\/api\/auth\/verify-reset-code\/$/);
assert.match(requests[6].url, /\/api\/auth\/reset-password\/$/);

console.log("API authentication storage tests passed");
