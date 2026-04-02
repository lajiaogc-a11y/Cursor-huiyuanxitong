const API_BASE = process.env.API_BASE || "http://localhost:3001";
const username = process.argv[2] || "wangchao";
const password = process.argv[3] || "";

async function main() {
  if (!password) {
    console.error("Usage: node login-and-seed.mjs wangchao <password>");
    process.exit(1);
  }
  const loginRes = await fetch(API_BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    console.error("Login failed:", loginData);
    process.exit(1);
  }
  const token = loginData.token;
  const seedRes = await fetch(API_BASE + "/api/data/seed-knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
  });
  const seedData = await seedRes.json().catch(() => ({}));
  console.log("POST /api/data/seed-knowledge status:", seedRes.status);
  console.log("Response:", JSON.stringify(seedData, null, 2));
}
main();
