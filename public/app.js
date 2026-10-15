"use strict";

const $ = (id) => document.getElementById(id);
const FIELDS = ["firstName", "secondName", "region", "employment", "sector", "employer"];
let verifiedPhone = null;

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = { error: "Unexpected response from the server." };
  }
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    error.fields = data.fields || {};
    throw error;
  }
  return data;
}

function notify(message, isError = false) {
  const box = $("notice");
  box.textContent = message;
  box.classList.toggle("error", isError);
  box.hidden = !message;
}

async function withBusy(button, task) {
  button.disabled = true;
  try {
    await task();
  } finally {
    button.disabled = false;
  }
}

function showTab(name) {
  for (const tab of ["me", "admin"]) {
    const active = tab === name;
    $(`tab-${tab}`).classList.toggle("active", active);
    $(`tab-${tab}`).setAttribute("aria-selected", String(active));
    $(`tab-${tab}`).tabIndex = active ? 0 : -1;
    $(`panel-${tab}`).hidden = !active;
  }
  notify("");
  if (name === "admin") refreshAdmin();
}

function clearErrors() {
  for (const element of document.querySelectorAll("[data-error]")) element.textContent = "";
  for (const element of document.querySelectorAll("[aria-invalid]")) element.removeAttribute("aria-invalid");
}

function showFieldErrors(fields) {
  for (const [name, message] of Object.entries(fields)) {
    const target = document.querySelector(`[data-error="${name}"]`);
    if (target) target.textContent = message;
    const input = $(name);
    if (input) input.setAttribute("aria-invalid", "true");
  }
}

function toggleEmployerFields() {
  $("employer-fields").hidden = $("employment").value !== "employed";
}

function fillForm(record) {
  for (const name of FIELDS) $(name).value = record ? record[name] || "" : "";
  $("adultConfirmed").checked = Boolean(record);
  $("consent").checked = Boolean(record);
  $("delete").hidden = !record;
  $("form-title").textContent = record ? "2. Your registration" : "2. Your details";
  $("save").textContent = record ? "Update my details" : "Save my details";
  toggleEmployerFields();
}

async function showRegistration() {
  const me = await api("GET", "/api/me");
  verifiedPhone = me.phone;
  $("verified-phone").textContent = me.phone;
  fillForm(me.record);
  clearErrors();
  $("step-phone").hidden = true;
  $("step-form").hidden = false;
}

function resetUserFlow() {
  verifiedPhone = null;
  $("phone-form").hidden = false;
  $("code-form").hidden = true;
  $("phone").value = "";
  $("code").value = "";
  $("phone-error").textContent = "";
  $("code-error").textContent = "";
  $("step-phone").hidden = false;
  $("step-form").hidden = true;
}

$("tab-me").addEventListener("click", () => showTab("me"));
$("tab-admin").addEventListener("click", () => showTab("admin"));
$("employment").addEventListener("change", toggleEmployerFields);

$("phone-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("phone-error").textContent = "";
  await withBusy(event.submitter, async () => {
    try {
      const data = await api("POST", "/api/otp/request", { phone: $("phone").value });
      notify(data.message);
      $("phone-form").hidden = true;
      $("code-form").hidden = false;
      $("code").focus();
    } catch (error) {
      $("phone-error").textContent = error.message;
    }
  });
});

$("change-phone").addEventListener("click", () => {
  $("code-form").hidden = true;
  $("phone-form").hidden = false;
  notify("");
});

$("code-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("code-error").textContent = "";
  await withBusy(event.submitter, async () => {
    try {
      await api("POST", "/api/otp/verify", { phone: $("phone").value, code: $("code").value.trim() });
      notify("Number verified.");
      await showRegistration();
    } catch (error) {
      $("code-error").textContent = error.message;
    }
  });
});

$("registration-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  const body = { adultConfirmed: $("adultConfirmed").checked, consent: $("consent").checked };
  for (const name of FIELDS) body[name] = $(name).value;
  await withBusy($("save"), async () => {
    try {
      const data = await api("PUT", "/api/me", body);
      fillForm(data.record);
      notify(data.created ? "Thank you. Your details have been saved." : "Your details have been updated.");
    } catch (error) {
      if (error.status === 401) {
        resetUserFlow();
        notify("Your session expired. Please verify your number again.", true);
      } else {
        showFieldErrors(error.fields || {});
        notify(error.message, true);
      }
    }
  });
});

$("delete").addEventListener("click", async () => {
  if (!confirm("Permanently delete your record? This cannot be undone.")) return;
  await withBusy($("delete"), async () => {
    try {
      await api("DELETE", "/api/me");
      resetUserFlow();
      notify("Your record has been deleted.");
    } catch (error) {
      notify(error.message, true);
    }
  });
});

$("sign-out").addEventListener("click", async () => {
  await api("POST", "/api/logout", {}).catch(() => {});
  resetUserFlow();
  notify("You have been signed out.");
});

function showAdmin(signedIn) {
  $("admin-login").hidden = signedIn;
  $("admin-console").hidden = !signedIn;
}

async function refreshAdmin() {
  try {
    const summary = await api("GET", "/api/admin/summary");
    $("total").textContent = summary.total;
    const body = $("audit");
    body.replaceChildren();
    for (const entry of summary.audit) {
      const row = document.createElement("tr");
      for (const text of [new Date(entry.at).toLocaleString(), `***${entry.queryLast3}`, entry.found ? "Found" : "No match"]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      body.append(row);
    }
    showAdmin(true);
  } catch {
    showAdmin(false);
  }
}

$("admin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("admin-error").textContent = "";
  await withBusy(event.submitter, async () => {
    try {
      await api("POST", "/api/admin/login", { token: $("token").value });
      $("token").value = "";
      await refreshAdmin();
    } catch (error) {
      $("admin-error").textContent = error.message;
    }
  });
});

$("admin-sign-out").addEventListener("click", async () => {
  await api("POST", "/api/logout", {}).catch(() => {});
  $("result").hidden = true;
  showAdmin(false);
});

const LABELS = [["Name", (r) => `${r.firstName} ${r.secondName}`], ["Mobile number", (r) => r.phone], ["Region", (r) => r.region],
  ["Employment", (r) => (r.employment === "employed" ? "Employed" : "Not employed")],
  ["Employer", (r) => (r.employer ? `${r.employer} (${r.sector === "government" ? "Government" : "Private"})` : "Not applicable")],
  ["Consent recorded", (r) => new Date(r.consentAt).toLocaleString()]];

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("search-error").textContent = "";
  const result = $("result");
  await withBusy(event.submitter, async () => {
    try {
      const data = await api("POST", "/api/admin/search", { phone: $("search-phone").value });
      result.replaceChildren();
      result.classList.toggle("empty", !data.found);
      if (data.found) {
        const list = document.createElement("dl");
        for (const [label, read] of LABELS) {
          const term = document.createElement("dt");
          term.textContent = label;
          const detail = document.createElement("dd");
          detail.textContent = read(data.record);
          list.append(term, detail);
        }
        result.append(list);
      } else {
        result.textContent = "No registration exists for that number.";
      }
      result.hidden = false;
      await refreshAdmin();
    } catch (error) {
      if (error.status === 401) showAdmin(false);
      $("search-error").textContent = error.message;
    }
  });
});

(async function init() {
  try {
    const config = await api("GET", "/api/config");
    for (const region of config.regions) {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      $("region").append(option);
    }
    $("dev-hint").hidden = !config.devSms;
    await showRegistration();
  } catch {
    resetUserFlow();
  }
})();
